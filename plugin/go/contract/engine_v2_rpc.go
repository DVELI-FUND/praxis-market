package contract

import (
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strconv"
)

// ═══════════════════════════════════════════════════════════════════════════════
// Server-side price / quote views. The chain is the single source of truth for v2
// math, so clients must not re-implement the engine: they read these instead.
//   GET /v1/query/markets            -> each N-outcome market now carries "engine"
//   GET /v1/query/quote?market=<hex>&outcome=<i>&shares=<n>[&address=<hex>]
//   GET /v1/query/quote?market=<hex>&outcome=<i>&budget=<n>[&address=<hex>]
// Legacy binary markets are unchanged (clients keep their existing math for them).
// ═══════════════════════════════════════════════════════════════════════════════

type engineView struct {
	Version  int      `json:"version"`   // 1 = fixed-b N-outcome, 2 = ADLMSR v2
	B0       uint64   `json:"b0"`        // base depth (micro-units)
	AlphaPPM uint64   `json:"alpha_ppm"` // depth growth per share, parts per million
	Depth    uint64   `json:"depth"`     // live depth b(q)
	Seed     uint64   `json:"seed"`      // ceil(b0*ln N): creator's maximum loss
	Probs    []uint64 `json:"probs"`     // softmax(q/b), PRECISION_SCALE = 100%
	Prices   []uint64 `json:"prices"`    // marginal price of one more share
	PriceSum uint64   `json:"price_sum"` // 1.0 + overround, PRECISION_SCALE units
}

// engineViewOf returns nil for legacy binary markets.
func engineViewOf(m *MarketState) *engineView {
	if !isNOutcome(m) {
		return nil
	}
	e := marketEngineV2(m)
	probs, err := ProbsV2(m.Q, e)
	if err != nil {
		return nil
	}
	prices, err := PricesV2(m.Q, e)
	if err != nil {
		return nil
	}
	v := &engineView{Version: 1, B0: m.BEff, AlphaPPM: m.AlphaPpm, Depth: m.BEff,
		Seed: seedEstimate(m), Probs: probs, Prices: prices}
	if m.EngineV2 {
		v.Version, v.Depth = 2, depthV2(m)
	}
	for _, p := range prices {
		v.PriceSum = addSat(v.PriceSum, p)
	}
	return v
}

type quoteN struct {
	Market        string      `json:"market"`
	Outcome       uint32      `json:"outcome"`
	Shares        uint64      `json:"shares"`
	Cost          uint64      `json:"cost"`
	CreatorFee    uint64      `json:"creator_fee"`
	ResolverFee   uint64      `json:"resolver_fee"`
	ProtocolFee   uint64      `json:"protocol_fee"`
	Total         uint64      `json:"total"`     // what the bettor pays; excludes the network tx fee
	AvgPrice      uint64      `json:"avg_price"` // cost per share, PRECISION_SCALE units
	ProbsBefore   []uint64    `json:"probs_before"`
	ProbsAfter    []uint64    `json:"probs_after"`
	PositionCapOK *bool       `json:"position_cap_ok,omitempty"`
	CapReason     string      `json:"position_cap_reason,omitempty"`
	Engine        *engineView `json:"engine"`
}

func quoteTotal(m *MarketState, idx uint32, shares uint64) (cost, cf, rf, pf, total uint64, err *PluginError) {
	cost, err = tradeCostNOutcome(m, &MessageSubmitPrediction{OutcomeIndex: idx, Shares: shares})
	if err != nil {
		return
	}
	cf, rf, pf = ComputeBps(cost, CREATOR_FEE_BPS), ComputeBps(cost, RESOLVER_FEE_BPS), v2ProtocolFee(m, cost)
	total = addSat(addSat(addSat(cost, cf), rf), pf)
	return
}

// maxSharesForBudget returns the largest share count whose total (incl. fees) <= budget.
func maxSharesForBudget(m *MarketState, idx uint32, budget uint64) uint64 {
	ok := func(s uint64) bool {
		_, _, _, _, t, e := quoteTotal(m, idx, s)
		return e == nil && t <= budget
	}
	const limit = uint64(1) << 62
	lo, hi := uint64(0), budget
	if hi < PRECISION_SCALE {
		hi = PRECISION_SCALE
	}
	for hi < limit && ok(hi) {
		lo = hi
		hi *= 2
	}
	if hi > limit {
		hi = limit
	}
	for lo < hi {
		mid := lo + (hi-lo+1)/2
		if ok(mid) {
			lo = mid
		} else {
			hi = mid - 1
		}
	}
	return lo
}

// buildQuoteN is pure (no I/O) so it is unit-testable and shared by the RPC route.
func buildQuoteN(marketHex string, m *MarketState, idx uint32, shares uint64, pos *PositionState) (*quoteN, *PluginError) {
	if !isNOutcome(m) {
		return nil, ErrInvalidParam()
	}
	if int(idx) >= len(m.Options) || shares < PRECISION_SCALE {
		return nil, ErrInvalidParam()
	}
	cost, cf, rf, pf, total, pe := quoteTotal(m, idx, shares)
	if pe != nil {
		return nil, pe
	}
	e := marketEngineV2(m)
	before, _ := ProbsV2(m.Q, e)
	after := append([]uint64(nil), m.Q...)
	after[idx] += shares
	probsAfter, _ := ProbsV2(after, e)
	q := &quoteN{Market: marketHex, Outcome: idx, Shares: shares, Cost: cost, CreatorFee: cf,
		ResolverFee: rf, ProtocolFee: pf, Total: total, ProbsBefore: before, ProbsAfter: probsAfter,
		Engine: engineViewOf(m)}
	q.AvgPrice = mulDiv(cost, PRECISION_SCALE, shares)
	if pos != nil {
		cp := checkPositionCapN(m, pos, &MessageSubmitPrediction{OutcomeIndex: idx, Shares: shares})
		ok := cp == nil
		q.PositionCapOK = &ok
		if cp != nil {
			q.CapReason = cp.Msg
		}
	}
	return q, nil
}

func (p *Plugin) registerQuoteRoute(mux *http.ServeMux) {
	mux.HandleFunc("/v1/query/quote", func(w http.ResponseWriter, r *http.Request) {
		qp := r.URL.Query()
		marketHex := qp.Get("market")
		marketId, err := hex.DecodeString(marketHex)
		if err != nil || marketHex == "" {
			http.Error(w, "invalid market: must be hex-encoded", http.StatusBadRequest)
			return
		}
		oi, err := strconv.ParseUint(qp.Get("outcome"), 10, 32)
		if err != nil {
			http.Error(w, "invalid outcome index", http.StatusBadRequest)
			return
		}
		reads := []*PluginKeyRead{{QueryId: 1, Key: KeyForMarket(marketId)}}
		if a := qp.Get("address"); a != "" {
			addr, aerr := hex.DecodeString(a)
			if aerr != nil {
				http.Error(w, "invalid address: must be hex-encoded", http.StatusBadRequest)
				return
			}
			reads = append(reads, &PluginKeyRead{QueryId: 2, Key: KeyForPosition(marketId, addr)})
		}
		resp, qErr := p.QueryState(0, &PluginStateReadRequest{Keys: reads})
		if qErr != nil {
			http.Error(w, qErr.Msg, http.StatusInternalServerError)
			return
		}
		var market *MarketState
		var pos *PositionState
		for _, res := range resp.Results {
			if len(res.Entries) == 0 || len(res.Entries[0].Value) == 0 {
				continue
			}
			switch res.QueryId {
			case 1:
				market = &MarketState{}
				if Unmarshal(res.Entries[0].Value, market) != nil {
					http.Error(w, "failed to decode market", http.StatusInternalServerError)
					return
				}
			case 2:
				pos = &PositionState{}
				if Unmarshal(res.Entries[0].Value, pos) != nil {
					pos = nil
				}
			}
		}
		if market == nil {
			http.Error(w, "market not found", http.StatusNotFound)
			return
		}
		if !isNOutcome(market) {
			http.Error(w, "legacy binary market: quote not supported", http.StatusBadRequest)
			return
		}
		if len(reads) > 1 && pos == nil {
			pos = &PositionState{Shares: make([]uint64, len(market.Options))}
		}
		shares, serr := strconv.ParseUint(qp.Get("shares"), 10, 64)
		if b := qp.Get("budget"); b != "" {
			budget, berr := strconv.ParseUint(b, 10, 64)
			if berr != nil {
				http.Error(w, "invalid budget", http.StatusBadRequest)
				return
			}
			shares, serr = maxSharesForBudget(market, uint32(oi), budget), nil
		}
		if serr != nil {
			http.Error(w, "invalid shares", http.StatusBadRequest)
			return
		}
		q, pe := buildQuoteN(marketHex, market, uint32(oi), shares, pos)
		if pe != nil {
			http.Error(w, pe.Msg, http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(q)
	})
}
