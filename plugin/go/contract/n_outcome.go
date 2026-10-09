package contract

import "strings"

// N-outcome market helpers (2-10 creator-defined options, standard LMSR).
// A market is LEGACY binary iff len(Options) == 0; legacy code paths are untouched.

const (
	MAX_OPTION_LABEL_BYTES      = 64
	MAX_NOUTCOME_QUESTION_BYTES = 280
	MAX_NOUTCOME_RULES_BYTES    = 4096

	// Minimum LMSR seed (B0 - FINALIZATION_BOUNTY) for an N-outcome market. At N=10,
	// b = seed/ln(10) and the smallest allowed trade (PRECISION_SCALE shares) must fit
	// under the 20% position cap on a BEff/2 base: seed >= 10M*ln(10) ~ 23.03M.
	MIN_SEED_N uint64 = 25_000_000

	PAYOUT_MODE_STANDARD uint32 = 0
)

func isNOutcome(m *MarketState) bool { return m != nil && len(m.Options) > 0 }

// validateCreateExtras validates the N-outcome fields of create_market. Byte-exact
// comparisons only (no case folding) so every validator agrees regardless of Go/Unicode version.
func validateCreateExtras(msg *MessageCreateMarket) *PluginError {
	if len(msg.Options) == 0 {
		if msg.PayoutMode != 0 {
			return ErrInvalidParam()
		}
		if patchV3Active(GetGlobalHeight()) {
			if len(msg.Question) > MAX_BINARY_QUESTION {
				return ErrInvalidQuestion()
			}
			if len(msg.Rules) > MAX_BINARY_RULES {
				return ErrInvalidParam()
			}
		}
		return nil
	}
	if msg.PayoutMode != PAYOUT_MODE_STANDARD {
		return ErrInvalidParam()
	}
	n := len(msg.Options)
	if n < MIN_OUTCOMES || n > MAX_OUTCOMES {
		return ErrInvalidParam()
	}
	seen := make(map[string]struct{}, n)
	// AUDIT: stricter label rules (invisible/format characters, edge whitespace, ASCII
	// case-insensitive duplicates) change which create_market txs are valid, so they are
	// height-gated like the entropy repair (see entropy.go). Before AUDIT_FIX_HEIGHT the
	// original byte-exact rules apply unchanged.
	hardened := auditFixActive(GetGlobalHeight())
	for _, o := range msg.Options {
		if strings.TrimSpace(o) == "" || len(o) > MAX_OPTION_LABEL_BYTES {
			return ErrInvalidParam()
		}
		key := o
		if hardened {
			if !optionLabelClean(o) {
				return ErrInvalidParam()
			}
			key = asciiLower(o)
		}
		if _, dup := seen[key]; dup {
			return ErrInvalidParam()
		}
		seen[key] = struct{}{}
	}
	if len(msg.Question) > MAX_NOUTCOME_QUESTION_BYTES {
		return ErrInvalidQuestion()
	}
	if len(msg.Rules) > MAX_NOUTCOME_RULES_BYTES {
		return ErrInvalidParam()
	}
	if msg.B0 < FINALIZATION_BOUNTY+MIN_SEED_N {
		return ErrInvalidB0()
	}
	return nil
}

// optionLabelClean rejects labels that can render blank or be spoofed: leading/trailing
// whitespace and control/format characters (zero-width, bidi overrides, BOM, soft hyphen,
// line/paragraph separators). Explicit rune ranges, not unicode tables, so every validator
// agrees regardless of Go/Unicode version.
func optionLabelClean(o string) bool {
	if o != strings.TrimSpace(o) {
		return false
	}
	for _, r := range o {
		switch {
		case r < 0x20, r >= 0x7F && r <= 0x9F:
		case r == 0x00AD, r >= 0x200B && r <= 0x200F:
		case r >= 0x2028 && r <= 0x202E, r >= 0x2060 && r <= 0x2064:
		case r >= 0x2066 && r <= 0x206F, r == 0xFEFF, r >= 0xFFF9 && r <= 0xFFFB:
		default:
			continue
		}
		return false
	}
	return true
}

// asciiLower folds only A-Z so duplicate detection is deterministic across Go versions.
func asciiLower(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'A' && c <= 'Z' {
			b[i] = c + 32
		}
	}
	return string(b)
}

func positionIsEmpty(p *PositionState) bool {
	if p.SharesYes != 0 || p.SharesNo != 0 || p.CostPaid != 0 {
		return false
	}
	for _, s := range p.Shares {
		if s != 0 {
			return false
		}
	}
	return true
}

func tradeCostNOutcome(m *MarketState, msg *MessageSubmitPrediction) (uint64, *PluginError) {
	idx := int(msg.OutcomeIndex)
	if idx >= len(m.Options) || len(m.Q) != len(m.Options) {
		return 0, ErrInvalidParam()
	}
	cost, err := TradeCostN(m.Q, m.BEff, idx, msg.Shares)
	if err != nil {
		return 0, ErrInvalidAmount()
	}
	return cost, nil
}

// checkPositionCapN: 20% (MAX_POSITION_BPS) of max(post-trade q[idx], BEff/2).
// The BEff/2 floor stops a fresh option (q=0) from capping the first buyer at ~0.
func checkPositionCapN(m *MarketState, p *PositionState, msg *MessageSubmitPrediction) *PluginError {
	idx := int(msg.OutcomeIndex)
	if idx >= len(m.Q) {
		return ErrInvalidParam()
	}
	var cur uint64
	if idx < len(p.Shares) {
		cur = p.Shares[idx]
	}
	base := m.Q[idx] + msg.Shares
	if floor := m.BEff / 2; base < floor {
		base = floor
	}
	if exceedsPositionCap(cur, msg.Shares, base) {
		return ErrPositionCapExceeded()
	}
	return nil
}

func applyTradeN(m *MarketState, p *PositionState, idx int, shares uint64) {
	if len(p.Shares) != len(m.Options) {
		grown := make([]uint64, len(m.Options))
		copy(grown, p.Shares)
		p.Shares = grown
	}
	m.Q[idx] += shares
	p.Shares[idx] += shares
}

// payoutNOutcome: standard LMSR — each winning share pays exactly 1 unit.
func payoutNOutcome(m *MarketState, p *PositionState, o *OutcomeState) (uint64, *PluginError) {
	if m.PayoutMode != PAYOUT_MODE_STANDARD {
		return 0, ErrInternal()
	}
	idx := int(o.WinningIndex)
	if idx >= len(m.Options) {
		return 0, ErrInternal()
	}
	if idx >= len(p.Shares) {
		return 0, nil
	}
	return p.Shares[idx], nil
}

// buildMarketTxLogOpN is buildMarketTxLogOp for N-outcome markets (records OutcomeIndex).
func buildMarketTxLogOpN(market *MarketState, marketId []byte, txType string, actor []byte, height uint64, outcomeIndex uint32, shares, cost uint64, txHash string) (*PluginSetOp, *PluginError) {
	seq := market.TxCount
	market.TxCount++
	entry := &MarketTxEntry{
		TxType:       txType,
		Actor:        actor,
		Height:       height,
		OutcomeIndex: outcomeIndex,
		Shares:       shares,
		Cost:         cost,
		TxHash:       txHash,
	}
	raw, pe := SafeMarshal(entry)
	if pe != nil {
		return nil, pe
	}
	return &PluginSetOp{Key: KeyForMarketTx(marketId, seq), Value: raw}, nil
}
