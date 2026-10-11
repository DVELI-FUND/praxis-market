package contract

import "testing"

func v2Gate(t *testing.T, fc *fakeChain) {
	t.Helper()
	oh := GetGlobalHeight()
	v4On(t, fc) // PATCH_V3 + V4 (+ audit/resolver fixes) on
	oe := ENGINE_V2_HEIGHT
	ENGINE_V2_HEIGHT = 1
	t.Cleanup(func() { ENGINE_V2_HEIGHT = oe; SetGlobalHeight(oh) })
}

// Gate disabled (the shipped default): markets are byte-for-byte the old engine.
func TestEngineV2GateOffIsLegacy(t *testing.T) {
	SetGlobalHeight(100)
	c, fc, creator := nSetup(t)
	mid := nCreate(t, c, creator, 1, []string{"A", "B", "C"})
	m := nMarket(t, fc, mid)
	if m.EngineV2 || m.AlphaPpm != 0 {
		t.Fatalf("gate off must not create v2 markets: %+v", m)
	}
	if engineV2Active(0) {
		t.Fatal("v2 must be inactive at height 0")
	}
	if h := ENGINE_V2_HEIGHT; h != ^uint64(0) {
		if engineV2Active(h - 1) {
			t.Fatal("v2 must be inactive before ENGINE_V2_HEIGHT")
		}
		if !engineV2Active(h) {
			t.Fatal("v2 must activate exactly at ENGINE_V2_HEIGHT")
		}
	}
}

func TestEngineV2CreateAndRejectLegacyBinary(t *testing.T) {
	c, fc, creator := nSetup(t)
	v2Gate(t, fc)
	r := c.DeliverMessageCreateMarket(&MessageCreateMarket{CreatorAddress: creator, B0: nTestB0, ExpiryTime: 5000, Nonce: 9, Question: "q?"}, 1000, "h")
	if r.Error == nil {
		t.Fatal("empty-options (legacy binary) create must be rejected once v2 is active")
	}
	for n := 2; n <= 10; n++ {
		opts := make([]string, n)
		for i := range opts {
			opts[i] = string(rune('A' + i))
		}
		mid := nCreate(t, c, creator, uint64(100+n), opts)
		m := nMarket(t, fc, mid)
		want, _ := AlphaForFrictionV2(n, DEFAULT_FRICTION_PPM)
		if !m.EngineV2 || m.AlphaPpm != want || m.AlphaPpm == 0 {
			t.Fatalf("n=%d engineV2=%v alpha=%d want %d", n, m.EngineV2, m.AlphaPpm, want)
		}
		if base, err := BaseCostN(m.Q, m.BEff); err != nil || base > fc.pool(KeyForMarketPool(mid)) {
			t.Fatalf("n=%d seed does not cover b0*ln N", n)
		}
	}
}

func TestEngineV2TradeChargesV2CostAndProtocolFee(t *testing.T) {
	c, fc, creator := nSetup(t)
	v2Gate(t, fc)
	b := addr(0xB1)
	fc.putAccount(t, b, 100_000_000_000)
	mid := nCreate(t, c, creator, 1, []string{"Yes", "No"})
	m := nMarket(t, fc, mid)
	poolBefore, trBefore := fc.pool(KeyForMarketPool(mid)), fc.pool(KeyForTreasuryPool())
	accBefore := fc.account(b)
	shares := 4 * PRECISION_SCALE
	want, err := TradeCostV2(m.Q, EngineV2{B0: m.BEff, AlphaPPM: m.AlphaPpm}, 0, shares)
	if err != nil {
		t.Fatal(err)
	}
	if r := nBuy(c, mid, b, 0, shares); r.Error != nil {
		t.Fatal(r.Error)
	}
	if got := fc.pool(KeyForMarketPool(mid)) - poolBefore; got != want {
		t.Fatalf("pool +%d want v2 cost %d", got, want)
	}
	pf := ComputeBps(want, V2_PROTOCOL_FEE_BPS)
	if got := fc.pool(KeyForTreasuryPool()) - trBefore; got != pf || pf == 0 {
		t.Fatalf("treasury +%d want protocol fee %d", got, pf)
	}
	total := want + pf + ComputeBps(want, CREATOR_FEE_BPS) + ComputeBps(want, RESOLVER_FEE_BPS)
	if got := accBefore - fc.account(b); got != total {
		t.Fatalf("bettor paid %d want %d", got, total)
	}
	if nMarket(t, fc, mid).Q[0] != shares {
		t.Fatal("q not updated")
	}
}

// Full lifecycle: seed returns first, only profit is split 50/20/30, claims drain the
// pool exactly, nothing is left behind and nothing is minted.
func TestEngineV2SettlementProfitSplitConserves(t *testing.T) {
	c, fc, creator := nSetup(t)
	v2Gate(t, fc)
	b1, b2, resolver, caller := addr(0xB1), addr(0xB2), addr(0x99), addr(0xC1)
	fc.putAccount(t, b1, 100_000_000_000)
	fc.putAccount(t, b2, 100_000_000_000)
	mid := nCreate(t, c, creator, 1, []string{"A", "B", "C"})
	if r := nBuy(c, mid, b1, 2, 3*PRECISION_SCALE); r.Error != nil {
		t.Fatal(r.Error)
	}
	if r := nBuy(c, mid, b2, 0, 2*PRECISION_SCALE); r.Error != nil {
		t.Fatal(r.Error)
	}
	m := nMarket(t, fc, mid)
	bond := ComputeMinBond(m)
	nRegisterResolver(t, fc, resolver, 1_000_000_000)
	SetGlobalHeight(m.ExpiryTime + 10)
	if r := c.DeliverMessageProposeOutcome(&MessageProposeOutcome{MarketId: mid, ResolverAddress: resolver, ProposedIndex: 2, ProposalBond: bond}, 0, "h"); r.Error != nil {
		t.Fatalf("propose: %v", r.Error)
	}
	pr := &ProposalRecord{}
	if pe := Unmarshal(fc.get(KeyForProposal(mid)), pr); pe != nil {
		t.Fatal(pe)
	}
	SetGlobalHeight(pr.ProposalBlock + ComputeDisputeBlocks(m.OpenTime, m.ExpiryTime) + 1)

	pool := fc.pool(KeyForMarketPool(mid))
	owed := m.Q[2]
	if owed >= pool {
		t.Fatal("scenario must leave a surplus")
	}
	resid := pool - owed
	cs, rs, ts := SettleResidualV2(resid, seedEstimate(m), V2_PROFIT_CREATOR_BPS, V2_PROFIT_RESOLVER_BPS)
	if cs+rs+ts != resid {
		t.Fatal("split not conserved")
	}
	tr := &TreasuryReserve{}
	_ = Unmarshal(fc.get(KeyForTreasuryReserve(mid)), tr)
	rfp := fc.pool(KeyForResolverFeePool(mid))
	crBefore, rsBefore, trBefore := fc.account(creator), fc.account(resolver), fc.pool(KeyForTreasuryPool())

	if r := c.DeliverMessageFinalizeMarket(&MessageFinalizeMarket{MarketId: mid, CallerAddr: caller}, 0, "h"); r.Error != nil {
		t.Fatalf("finalize: %v", r.Error)
	}
	if got := fc.account(creator) - crBefore; got != tr.CreatorBond+cs {
		t.Fatalf("creator +%d want bond %d + share %d", got, tr.CreatorBond, cs)
	}
	if got := fc.account(resolver) - rsBefore; got < rs+rfp {
		t.Fatalf("resolver +%d want >= share %d + fee pool %d", got, rs, rfp)
	}
	if got := fc.pool(KeyForTreasuryPool()) - trBefore; got != ts {
		t.Fatalf("treasury +%d want %d", got, ts)
	}
	if got := fc.pool(KeyForMarketPool(mid)); got != owed {
		t.Fatalf("pool after finalize %d want exactly owed %d", got, owed)
	}
	if r := c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: b1}, 0); r.Error != nil {
		t.Fatalf("claim: %v", r.Error)
	}
	if got := fc.pool(KeyForMarketPool(mid)); got != 0 {
		t.Fatalf("pool must drain to 0, left %d", got)
	}
}

// Creator loss is capped at the seed: when the heavily-bought outcome wins the creator
// gets back (pool - owed) and never more is taken from them.
func TestEngineV2CreatorLossCappedAtSeed(t *testing.T) {
	c, fc, creator := nSetup(t)
	v2Gate(t, fc)
	b1, resolver, caller := addr(0xB1), addr(0x99), addr(0xC1)
	fc.putAccount(t, b1, 100_000_000_000)
	mid := nCreate(t, c, creator, 1, []string{"A", "B"})
	for i := 0; i < 6; i++ {
		if r := nBuy(c, mid, b1, 0, 6*PRECISION_SCALE); r.Error != nil {
			t.Fatalf("buy %d: %v", i, r.Error)
		}
	}
	m := nMarket(t, fc, mid)
	pool := fc.pool(KeyForMarketPool(mid))
	if m.Q[0] > pool {
		t.Fatalf("INSOLVENT: owed %d > pool %d", m.Q[0], pool)
	}
	if loss := int64(m.Q[0]) - int64(pool-seedEstimate(m)); loss > int64(seedEstimate(m))+3 {
		t.Fatalf("creator loss %d exceeds seed %d", loss, seedEstimate(m))
	}
	_ = resolver
	_ = caller
}
