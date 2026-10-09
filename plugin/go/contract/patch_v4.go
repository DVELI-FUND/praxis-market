package contract

import (
	"crypto/sha256"
	"encoding/binary"
)

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH V4 — "standard prediction market" fairness fixes on top of V3.
// One height gate, default DISABLED. Same activation rules as V3: set it to a height
// comfortably in the future and have EVERY validator on the new binary before then.
// Requires PATCH_V3_HEIGHT to be active.
// ═══════════════════════════════════════════════════════════════════════════════

var PATCH_V4_HEIGHT uint64 = 73987

func patchV4Active(h uint64) bool {
	return PATCH_V4_HEIGHT != ^uint64(0) && h >= PATCH_V4_HEIGHT && patchV3Active(h)
}

const (
	// A resolution only earns RRS / epoch weight once the market saw real volume.
	MIN_REWARD_VOLUME uint64 = 2_000_000_000 // 2,000 PRX
	// Resolver epoch pools nobody claimed for this many epochs are swept to protocol.
	STALE_EPOCH_LAG uint64 = 6
	// Minimum tx fee (0.01 PRX = the frontend default). Plugin txs have NO base-layer
	// fee floor, so without this a zero-fee tx is accepted. TUNE BEFORE ACTIVATION.
	MIN_TX_FEE uint64 = 10_000
	// Reveal nonces shorter than this are rejected (short nonces can be brute-forced
	// from the public commit hash). Clients MUST generate >= 32 random bytes.
	MIN_VOTE_NONCE_BYTES = 32
)

// ── volume / payout helpers ──────────────────────────────────────────────────

// seedEstimate is a LOWER bound on the liquidity the creator put in the pool.
func seedEstimate(m *MarketState) uint64 {
	if isNOutcome(m) {
		b := m.BEff
		n := len(m.Options)
		if b == 0 || n < 2 {
			return 0
		}
		zero := make([]uint64, n)
		s, err := BaseCostN(zero, b)
		if err != nil {
			return 0
		}
		return s
	}
	return m.BEff
}

// marketVolumeProxy ~= total traded cost = pool - seed (never negative).
func marketVolumeProxy(m *MarketState, pool uint64) uint64 {
	return subOrZero(pool, seedEstimate(m))
}

// totalWinnerPayout is exactly what the winners can ever be paid out of the pool.
// Everything above it is the market maker's (creator's) surplus.
func totalWinnerPayout(m *MarketState, winYes bool, winIdx uint32, pool uint64) uint64 {
	if isNOutcome(m) {
		if int(winIdx) >= len(m.Q) {
			return pool
		}
		return minU64(m.Q[winIdx], pool)
	}
	phantom := m.BEff / 2
	qWin := m.QNo
	if winYes {
		qWin = m.QYes
	}
	switch {
	case qWin > phantom:
		return minU64(qWin-phantom, pool)
	case qWin == phantom:
		return 0 // nobody holds the winning side
	default:
		return pool // inconsistent legacy bookkeeping: pay pro-rata, no surplus
	}
}

// CREATOR_SURPLUS_CAP_TO_SEED: false = standard LMSR (creator keeps the whole residual).
// true = creator gets back at most their seed and the treasury keeps anything above.
const CREATOR_SURPLUS_CAP_TO_SEED = false

func ErrFeeTooLow() *PluginError {
	return &PluginError{Code: 231, Module: errModule, Msg: "tx fee below minimum"}
}

func (c *Contract) v4FeeGate(fee uint64) *PluginError {
	if patchV4Active(GetGlobalHeight()) && fee < MIN_TX_FEE {
		return ErrFeeTooLow()
	}
	return nil
}

// payCreatorSeedOnClose returns the creator's seed in the tx that flips a market with
// positions to CANCELLED/VOIDED. Afterwards the pool holds only the traders' refunds,
// so every refund stays claimable forever (no timeouts). seed <= pool - refunds always.
func (c *Contract) payCreatorSeedOnClose(marketId []byte, m *MarketState) *PluginError {
	if m == nil || m.TotalPositions == 0 {
		return nil // the never-traded paths already return the seed
	}
	amt, pe := c.marketPoolAmount(marketId)
	if pe != nil {
		return pe
	}
	pay := minU64(seedEstimate(m), amt)
	if pay == 0 {
		return nil
	}
	raw, pe := SafeMarshal(&Pool{Amount: amt - pay})
	if pe != nil {
		return pe
	}
	wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{Sets: []*PluginSetOp{{Key: KeyForMarketPool(marketId), Value: raw}}})
	if pe := errCheckWrite(wr, werr); pe != nil {
		return pe
	}
	return c.creditAccount(m.Creator, pay)
}

func minU64(a, b uint64) uint64 {
	if a < b {
		return a
	}
	return b
}

// ── generic second-step state helpers ────────────────────────────────────────

// creditAccount adds amt to addr (fresh read, so aliasing with the main write is safe).
func (c *Contract) creditAccount(addr []byte, amt uint64) *PluginError {
	if amt == 0 {
		return nil
	}
	if len(addr) != 20 {
		return c.creditTreasury(amt) // never let value vanish on a malformed address
	}
	q := nextQueryId()
	v, err := c.readKeys(map[uint64][]byte{q: KeyForAccount(addr)})
	if err != nil {
		return err
	}
	acc := &Account{}
	if pe := unmarshalIf(v[q], acc); pe != nil {
		return pe
	}
	if acc.Amount > ^uint64(0)-amt {
		return ErrInvalidAmount()
	}
	acc.Amount += amt
	raw, pe := SafeMarshal(acc)
	if pe != nil {
		return pe
	}
	wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{Sets: []*PluginSetOp{{Key: KeyForAccount(addr), Value: raw}}})
	return errCheckWrite(wr, werr)
}

// refundFeesV4 gives a bettor on a CANCELLED/VOIDED market their creator+resolver fees
// back (standard: a market that never resolves refunds everything the trader paid into
// it). Drawn from the two fee pools; the last claimant also sweeps rounding dust.
func (c *Contract) refundFeesV4(marketId, claimant []byte, costPaid uint64, last bool) *PluginError {
	cq, rq := nextQueryId(), nextQueryId()
	v, err := c.readKeys(map[uint64][]byte{cq: KeyForCreatorFeePool(marketId), rq: KeyForResolverFeePool(marketId)})
	if err != nil {
		return err
	}
	cf, rf := &Pool{}, &Pool{}
	if pe := unmarshalIf(v[cq], cf); pe != nil {
		return pe
	}
	if pe := unmarshalIf(v[rq], rf); pe != nil {
		return pe
	}
	wantC := minU64(ComputeBps(costPaid, CREATOR_FEE_BPS), cf.Amount)
	wantR := minU64(ComputeBps(costPaid, RESOLVER_FEE_BPS), rf.Amount)
	cf.Amount -= wantC
	rf.Amount -= wantR
	var dust uint64
	if last {
		dust = addSat(cf.Amount, rf.Amount)
		cf.Amount, rf.Amount = 0, 0
	}
	if wantC+wantR == 0 && dust == 0 {
		return nil
	}
	rawC, pe := SafeMarshal(cf)
	if pe != nil {
		return pe
	}
	rawR, pe := SafeMarshal(rf)
	if pe != nil {
		return pe
	}
	wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{Sets: []*PluginSetOp{
		{Key: KeyForCreatorFeePool(marketId), Value: rawC},
		{Key: KeyForResolverFeePool(marketId), Value: rawR},
	}})
	if pe := errCheckWrite(wr, werr); pe != nil {
		return pe
	}
	if pe := c.creditAccount(claimant, wantC+wantR); pe != nil {
		return pe
	}
	return c.creditTreasury(dust)
}

// reserveToCreatorV4 returns the unspent finalization reserve of a cancelled market to
// the creator (V3 sent it to the treasury).
func (c *Contract) reserveToCreatorV4(marketId, creator []byte) *PluginError {
	q := nextQueryId()
	v, err := c.readKeys(map[uint64][]byte{q: KeyForTreasuryReserve(marketId)})
	if err != nil {
		return err
	}
	res := &TreasuryReserve{}
	if pe := unmarshalIf(v[q], res); pe != nil {
		return pe
	}
	if res.LockedReserve == 0 {
		return nil
	}
	amt := res.LockedReserve
	res.LockedReserve = 0
	raw, pe := SafeMarshal(res)
	if pe != nil {
		return pe
	}
	wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{Sets: []*PluginSetOp{{Key: KeyForTreasuryReserve(marketId), Value: raw}}})
	if pe := errCheckWrite(wr, werr); pe != nil {
		return pe
	}
	return c.creditAccount(creator, amt)
}

// sweepPoolToCreatorV4 moves whatever is left in a cancelled/voided market's pool to the
// creator (their seed) once every position has been refunded.
func (c *Contract) sweepPoolToCreatorV4(marketId, creator []byte) *PluginError {
	amt, pe := c.marketPoolAmount(marketId)
	if pe != nil || amt == 0 {
		return pe
	}
	raw, pe := SafeMarshal(&Pool{Amount: 0})
	if pe != nil {
		return pe
	}
	wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{Sets: []*PluginSetOp{{Key: KeyForMarketPool(marketId), Value: raw}}})
	if pe := errCheckWrite(wr, werr); pe != nil {
		return pe
	}
	return c.creditAccount(creator, amt)
}

// ── per-block tx entropy (panel draw no longer a pure function of height) ────

// mixTxEntropy folds a successfully-delivered tx hash into the panel-entropy
// accumulator AFTER the tx ran, so a tx can never influence its own draw, and a
// disputer cannot know which other txs land in the block that includes their filing.
// Residual risk: the block proposer chooses tx inclusion/order (see README).
func (c *Contract) mixTxEntropy(txHash string) *PluginError {
	if txHash == "" {
		return nil
	}
	q := nextQueryId()
	v, err := c.readKeys(map[uint64][]byte{q: PANEL_ENTROPY_KEY_V2})
	if err != nil {
		return err
	}
	acc := &PanelEntropyAccum{}
	if pe := unmarshalIf(v[q], acc); pe != nil {
		return pe
	}
	if acc.Accumulator == 0 {
		return nil // BeginBlock has not initialised it yet; never mix into "missing"
	}
	var prev [8]byte
	binary.BigEndian.PutUint64(prev[:], acc.Accumulator)
	h := sha256.Sum256(append(prev[:], []byte(txHash)...))
	n := binary.BigEndian.Uint64(h[:8])
	if n == 0 {
		n = 1
	}
	raw, pe := SafeMarshal(&PanelEntropyAccum{Accumulator: n})
	if pe != nil {
		return pe
	}
	wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{Sets: []*PluginSetOp{{Key: PANEL_ENTROPY_KEY_V2, Value: raw}}})
	return errCheckWrite(wr, werr)
}

// ── resolver-epoch rollover ──────────────────────────────────────────────────

// rolloverEpochs runs at an epoch boundary (V4): the PREVIOUS epoch's resolver pool goes
// to the protocol pool if nobody can claim it (no weight left), and the pool of the
// epoch STALE_EPOCH_LAG back is swept whatever is left.
func (c *Contract) rolloverEpochs(epoch uint64) *PluginError {
	var moved uint64
	var sets []*PluginSetOp
	type job struct {
		e     uint64
		stale bool
	}
	jobs := []job{}
	if epoch >= 1 {
		jobs = append(jobs, job{epoch - 1, false})
	}
	if epoch >= STALE_EPOCH_LAG {
		jobs = append(jobs, job{epoch - STALE_EPOCH_LAG, true})
	}
	for _, j := range jobs {
		pq, tq := nextQueryId(), nextQueryId()
		v, err := c.readKeys(map[uint64][]byte{pq: KeyForResolverEpochPool(j.e), tq: KeyForEpochWeightedTotal(j.e)})
		if err != nil {
			return err
		}
		pool, tot := &Pool{}, &Pool{}
		if pe := unmarshalIf(v[pq], pool); pe != nil {
			return pe
		}
		if pe := unmarshalIf(v[tq], tot); pe != nil {
			return pe
		}
		if pool.Amount == 0 || (!j.stale && tot.Amount != 0) {
			continue
		}
		moved = addSat(moved, pool.Amount)
		pool.Amount = 0
		raw, pe := SafeMarshal(pool)
		if pe != nil {
			return pe
		}
		sets = append(sets, &PluginSetOp{Key: KeyForResolverEpochPool(j.e), Value: raw})
	}
	if moved == 0 {
		return nil
	}
	wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{Sets: sets})
	if pe := errCheckWrite(wr, werr); pe != nil {
		return pe
	}
	// credit protocol pool (fresh read)
	q := nextQueryId()
	v, err := c.readKeys(map[uint64][]byte{q: KeyForProtocolPool()})
	if err != nil {
		return err
	}
	pp := &Pool{}
	if pe := unmarshalIf(v[q], pp); pe != nil {
		return pe
	}
	pp.Amount = addSat(pp.Amount, moved)
	raw, pe := SafeMarshal(pp)
	if pe != nil {
		return pe
	}
	wr, werr = c.plugin.StateWrite(c, &PluginStateWriteRequest{Sets: []*PluginSetOp{{Key: KeyForProtocolPool(), Value: raw}}})
	return errCheckWrite(wr, werr)
}
