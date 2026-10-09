package contract

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH V3 — audit fixes. ONE height gate, default DISABLED.
//
// Every fix below changes consensus state transitions, so none may apply to blocks
// that were already produced. Until PATCH_V3_HEIGHT is set, every handler behaves
// byte-for-byte as before. To activate: set PATCH_V3_HEIGHT to a height comfortably
// in the future, rebuild, and have EVERY validator upgrade before that height.
//
// It additionally requires RESOLVER_FIX_HEIGHT and AUDIT_FIX_HEIGHT to be active.
// ═══════════════════════════════════════════════════════════════════════════════

var PATCH_V3_HEIGHT uint64 = 66335

func patchV3Active(h uint64) bool {
	return PATCH_V3_HEIGHT != ^uint64(0) && h >= PATCH_V3_HEIGHT && resolverFixActive(h) && auditFixActive(h)
}

const (
	// Bond scales with the live pool: 2% of the pool, floored by the old minimum and
	// capped so a resolver with the minimum stake can always still propose.
	BOND_POOL_BPS       uint64 = 200
	MAX_BOND_V3         uint64 = MIN_RESOLVER_STAKE / 2
	MAX_BINARY_QUESTION        = 280
	MAX_BINARY_RULES           = 4096
)

func ErrClaimsClosed() *PluginError {
	return &PluginError{Code: 230, Module: errModule, Msg: "claim window closed"}
}

// computePayoutV3 is the overflow-free pro-rata share.
func computePayoutV3(pool, part, total uint64) uint64 { return mulDiv(pool, part, total) }

// binaryPayoutV3: standard LMSR payout for a legacy binary market — one unit per REAL
// winning share (the seed's phantom shares are not holders), capped pro-rata by the
// pool. This removes the buy-both-sides arbitrage of the old pool/QWin formula.
func binaryPayoutV3(m *MarketState, winnerShares uint64, winYes bool, pool uint64) uint64 {
	if winnerShares == 0 {
		return 0
	}
	phantom := m.BEff / 2
	qWin := m.QNo
	if winYes {
		qWin = m.QYes
	}
	real := subOrZero(qWin, phantom)
	if real == 0 {
		// Inconsistent seed bookkeeping (phantom >= total): fall back to plain
		// pro-rata over the recorded total instead of paying nothing.
		if qWin == 0 {
			return 0
		}
		return mulDiv(pool, winnerShares, qWin)
	}
	capped := mulDiv(pool, winnerShares, real)
	if capped < winnerShares {
		return capped
	}
	return winnerShares
}

// minBondV3 = max(old minimum, 2% of live pool), capped at MAX_BOND_V3.
func minBondV3(m *MarketState, pool uint64) uint64 {
	b := ComputeMinBond(m)
	if p := ComputeBps(pool, BOND_POOL_BPS); p > b {
		b = p
	}
	if b > MAX_BOND_V3 {
		b = MAX_BOND_V3
	}
	return b
}

func (c *Contract) marketPoolAmount(marketId []byte) (uint64, *PluginError) {
	q := nextQueryId()
	v, err := c.readKeys(map[uint64][]byte{q: KeyForMarketPool(marketId)})
	if err != nil {
		return 0, err
	}
	p := &Pool{}
	if pe := unmarshalIf(v[q], p); pe != nil {
		return 0, pe
	}
	return p.Amount, nil
}

// routeFee credits an ALREADY-DEBITED tx fee to the fee pool / treasury (50/50), so
// it is no longer burned. Runs as a second write after the handler's main write.
func (c *Contract) routeFee(fee uint64) *PluginError {
	if fee == 0 {
		return nil
	}
	fq, tq := nextQueryId(), nextQueryId()
	v, err := c.readKeys(map[uint64][]byte{fq: KeyForFeePool(c.Config.ChainId), tq: KeyForTreasuryPool()})
	if err != nil {
		return err
	}
	fp, tp := &Pool{}, &Pool{}
	if pe := unmarshalIf(v[fq], fp); pe != nil {
		return pe
	}
	if pe := unmarshalIf(v[tq], tp); pe != nil {
		return pe
	}
	split := ComputeBps(fee, TX_TREASURY_SPLIT_BPS)
	fp.Amount = addSat(fp.Amount, split)
	tp.Amount = addSat(tp.Amount, fee-split)
	rf, pe := SafeMarshal(fp)
	if pe != nil {
		return pe
	}
	rt, pe := SafeMarshal(tp)
	if pe != nil {
		return pe
	}
	wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{Sets: []*PluginSetOp{
		{Key: KeyForFeePool(c.Config.ChainId), Value: rf},
		{Key: KeyForTreasuryPool(), Value: rt},
	}})
	return errCheckWrite(wr, werr)
}

// chargeAndRoute debits `fee` from addr (reading the account AFTER the handler's main
// write, so aliasing can never overwrite it) and routes it. Best effort: if the
// account cannot afford it the fee is skipped, never failing an otherwise valid tx.
func (c *Contract) chargeAndRoute(addr []byte, fee uint64) *PluginError {
	if fee == 0 || len(addr) != 20 {
		return nil
	}
	aq := nextQueryId()
	v, err := c.readKeys(map[uint64][]byte{aq: KeyForAccount(addr)})
	if err != nil {
		return err
	}
	acc := &Account{}
	if pe := unmarshalIf(v[aq], acc); pe != nil {
		return pe
	}
	if acc.Amount < fee {
		if patchV4Active(GetGlobalHeight()) {
			return ErrInsufficientFunds() // V4: the whole tx reverts (FSM TxnWrap)
		}
		return nil
	}
	acc.Amount -= fee
	var sets []*PluginSetOp
	var dels []*PluginDeleteOp
	if acc.Amount == 0 {
		dels = append(dels, &PluginDeleteOp{Key: KeyForAccount(addr)})
	} else {
		raw, pe := SafeMarshal(acc)
		if pe != nil {
			return pe
		}
		sets = append(sets, &PluginSetOp{Key: KeyForAccount(addr), Value: raw})
	}
	wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{Sets: sets, Deletes: dels})
	if pe := errCheckWrite(wr, werr); pe != nil {
		return pe
	}
	return c.routeFee(fee)
}

// decOpenCount frees one of a creator's open-market slots (auto-cancel / reclaim paths
// never did).
func (c *Contract) decOpenCount(creator []byte) *PluginError {
	q := nextQueryId()
	v, err := c.readKeys(map[uint64][]byte{q: KeyForCreatorOpenCount(creator)})
	if err != nil {
		return err
	}
	p := &Pool{}
	if pe := unmarshalIf(v[q], p); pe != nil {
		return pe
	}
	if p.Amount == 0 {
		return nil
	}
	p.Amount--
	raw, pe := SafeMarshal(p)
	if pe != nil {
		return pe
	}
	wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{Sets: []*PluginSetOp{{Key: KeyForCreatorOpenCount(creator), Value: raw}}})
	return errCheckWrite(wr, werr)
}

// creditTreasury adds amt to the global treasury pool (separate write; reads fresh).
func (c *Contract) creditTreasury(amt uint64) *PluginError {
	if amt == 0 {
		return nil
	}
	q := nextQueryId()
	v, err := c.readKeys(map[uint64][]byte{q: KeyForTreasuryPool()})
	if err != nil {
		return err
	}
	tp := &Pool{}
	if pe := unmarshalIf(v[q], tp); pe != nil {
		return pe
	}
	tp.Amount = addSat(tp.Amount, amt)
	raw, pe := SafeMarshal(tp)
	if pe != nil {
		return pe
	}
	wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{Sets: []*PluginSetOp{{Key: KeyForTreasuryPool(), Value: raw}}})
	return errCheckWrite(wr, werr)
}

// derivePanelV3: unbiased pick using the HIGH bits of the LCG (low bits of a
// power-of-two LCG have tiny periods), and never fewer than MIN_PANEL_SIZE.
func derivePanelV3(candidates [][]byte, n int, seed uint64) [][]byte {
	if len(candidates) == 0 || n == 0 {
		return nil
	}
	pool := make([][]byte, len(candidates))
	copy(pool, candidates)
	s := seed
	next := func() uint64 {
		s = s*6364136223846793005 + 1442695040888963407
		return s >> 17
	}
	limit := len(pool)
	if n < limit {
		limit = n
	}
	for i := 0; i < limit; i++ {
		j := int(next()%uint64(len(pool)-i)) + i
		pool[i], pool[j] = pool[j], pool[i]
	}
	return pool[:limit]
}

// panelSeedV3 binds the draw to chain entropy + market + block only. The filing tx
// hash and the disputer are deliberately NOT inputs, removing the cheapest grinding
// vector (re-signing the tx). See README for the residual risk.
func panelSeedV3(entropy uint64, marketId []byte, p *ProposalRecord, now uint64) uint64 {
	return panelSeedV2(entropy, marketId, p, nil, "", now)
}

// sweepCancelledExtras moves value that auto-cancelled markets used to strand forever
// (creator/resolver fee pools and the unclaimed finalization reserve) into the treasury.
// Reads fresh state, so it is idempotent after the creator bond has been slashed.
func (c *Contract) sweepCancelledExtras(marketId []byte) *PluginError {
	rq, cq, vq := nextQueryId(), nextQueryId(), nextQueryId()
	v, err := c.readKeys(map[uint64][]byte{
		rq: KeyForTreasuryReserve(marketId),
		cq: KeyForCreatorFeePool(marketId),
		vq: KeyForResolverFeePool(marketId),
	})
	if err != nil {
		return err
	}
	res, cf, rf := &TreasuryReserve{}, &Pool{}, &Pool{}
	if pe := unmarshalIf(v[rq], res); pe != nil {
		return pe
	}
	if pe := unmarshalIf(v[cq], cf); pe != nil {
		return pe
	}
	if pe := unmarshalIf(v[vq], rf); pe != nil {
		return pe
	}
	total := addSat(addSat(res.LockedReserve, cf.Amount), rf.Amount)
	if total == 0 {
		return nil
	}
	res.LockedReserve, cf.Amount, rf.Amount = 0, 0, 0
	rr, pe := SafeMarshal(res)
	if pe != nil {
		return pe
	}
	rc, pe := SafeMarshal(cf)
	if pe != nil {
		return pe
	}
	rv, pe := SafeMarshal(rf)
	if pe != nil {
		return pe
	}
	wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{Sets: []*PluginSetOp{
		{Key: KeyForTreasuryReserve(marketId), Value: rr},
		{Key: KeyForCreatorFeePool(marketId), Value: rc},
		{Key: KeyForResolverFeePool(marketId), Value: rv},
	}})
	if pe := errCheckWrite(wr, werr); pe != nil {
		return pe
	}
	return c.creditTreasury(total)
}

// sweepClosedMarket handles claims after the claim window: nobody is paid (so the
// first late claimant can no longer win while everyone else loses); the remaining pool
// goes to the treasury. Anyone can trigger it, which also fixes pools nobody claimed.
func (c *Contract) sweepClosedMarket(marketId []byte, claimant []byte, fee uint64) *PluginDeliverResponse {
	pq := nextQueryId()
	v, err := c.readKeys(map[uint64][]byte{pq: KeyForMarketPool(marketId)})
	if err != nil {
		return &PluginDeliverResponse{Error: err}
	}
	pool := &Pool{}
	if pe := unmarshalIf(v[pq], pool); pe != nil {
		return &PluginDeliverResponse{Error: pe}
	}
	if pool.Amount == 0 {
		return &PluginDeliverResponse{Error: ErrClaimsClosed()}
	}
	amt := pool.Amount
	pool.Amount = 0
	raw, pe := SafeMarshal(pool)
	if pe != nil {
		return &PluginDeliverResponse{Error: pe}
	}
	wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{Sets: []*PluginSetOp{{Key: KeyForMarketPool(marketId), Value: raw}}})
	if pe := errCheckWrite(wr, werr); pe != nil {
		return &PluginDeliverResponse{Error: pe}
	}
	if pe := c.creditTreasury(amt); pe != nil {
		return &PluginDeliverResponse{Error: pe}
	}
	if pe := c.chargeAndRoute(claimant, fee); pe != nil {
		return &PluginDeliverResponse{Error: pe}
	}
	return &PluginDeliverResponse{}
}
