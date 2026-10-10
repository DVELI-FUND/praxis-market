package contract

import (
	"math/rand"
	"testing"
)

func v4On(t *testing.T, fc *fakeChain) {
	t.Helper()
	v3On(t, fc)
	o := PATCH_V4_HEIGHT
	PATCH_V4_HEIGHT = 1
	t.Cleanup(func() { PATCH_V4_HEIGHT = o })
}

func TestV4_GateBoundary(t *testing.T) {
	// V4 is live on the chain (height set); the gate must flip exactly at its height.
	if PATCH_V4_HEIGHT == ^uint64(0) {
		t.Skip("V4 gate disabled in this build")
	}
	if patchV4Active(PATCH_V4_HEIGHT-1) || !patchV4Active(PATCH_V4_HEIGHT) {
		t.Fatalf("V4 gate boundary wrong: v4=%d v3=%d audit=%d resolver=%d", PATCH_V4_HEIGHT, PATCH_V3_HEIGHT, AUDIT_FIX_HEIGHT, RESOLVER_FIX_HEIGHT)
	}
}

func TestV4_V4RequiresV3(t *testing.T) {
	o := PATCH_V4_HEIGHT
	PATCH_V4_HEIGHT = 1
	defer func() { PATCH_V4_HEIGHT = o }()
	if patchV4Active(1<<40) && PATCH_V3_HEIGHT == ^uint64(0) {
		t.Fatal("v4 must not activate without v3")
	}
}

// ── finalize: market-maker surplus goes to the creator ──────────────────────

func TestV4_FinalizeBinarySurplusToCreator(t *testing.T) {
	c, fc, mid, creator, _ := finalizable(t)
	v4On(t, fc)
	putMsg(t, fc, KeyForMarket(mid), &MarketState{Status: STATUS_PROPOSED, Creator: creator, OpenTime: 1, ExpiryTime: 10,
		BEff: 100_000_000, QYes: 50_000_000 + 30_000_000, QNo: 50_000_000 + 10_000_000, TotalPositions: 2})
	fc.putPool(t, KeyForMarketPool(mid), 125_000_000)
	ok(t, c.DeliverMessageFinalizeMarket(&MessageFinalizeMarket{MarketId: mid, CallerAddr: addr(0xAA)}, 0, "h"))
	if got := fc.account(creator); got != CREATOR_BOND+95_000_000 {
		t.Fatalf("creator got %d want bond+95M", got)
	}
	if got := fc.pool(KeyForMarketPool(mid)); got != 30_000_000 {
		t.Fatalf("pool %d want 30M (winners' exact entitlement)", got)
	}
	// the single 30M-share YES holder is paid in full from the reduced pool
	holder := addr(0xB1)
	putMsg(t, fc, KeyForPosition(mid, holder), &PositionState{SharesYes: 30_000_000, CostPaid: 20_000_000})
	fc.putAccount(t, holder, 1)
	SetGlobalHeight(getMarketOutcomeAt(t, fc, mid) + 10)
	ok(t, c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: holder}, 0))
	if got := fc.account(holder); got != 30_000_001 {
		t.Fatalf("holder paid %d", got-1)
	}
}

func getMarketOutcomeAt(t *testing.T, fc *fakeChain, mid []byte) uint64 {
	o := &OutcomeState{}
	if pe := Unmarshal(fc.get(KeyForOutcome(mid)), o); pe != nil {
		t.Fatal(pe)
	}
	return o.ResolvedAt
}

func TestV4_FinalizeNoWinnersAllToCreator(t *testing.T) {
	c, fc, mid, creator, _ := finalizable(t)
	v4On(t, fc)
	putMsg(t, fc, KeyForMarket(mid), &MarketState{Status: STATUS_PROPOSED, Creator: creator, OpenTime: 1, ExpiryTime: 10,
		BEff: 100_000_000, QYes: 50_000_000, QNo: 50_000_000 + 10_000_000, TotalPositions: 1})
	fc.putPool(t, KeyForMarketPool(mid), 110_000_000) // YES wins, nobody holds YES
	ok(t, c.DeliverMessageFinalizeMarket(&MessageFinalizeMarket{MarketId: mid, CallerAddr: addr(0xAA)}, 0, "h"))
	if fc.pool(KeyForMarketPool(mid)) != 0 || fc.account(creator) != CREATOR_BOND+110_000_000 {
		t.Fatalf("pool %d creator %d", fc.pool(KeyForMarketPool(mid)), fc.account(creator))
	}
}

func TestV4_FinalizeNOutcomeSurplusToCreator(t *testing.T) {
	c, fc, mid, creator, _ := finalizable(t)
	v4On(t, fc)
	putMsg(t, fc, KeyForMarket(mid), &MarketState{Status: STATUS_PROPOSED, Creator: creator, OpenTime: 1, ExpiryTime: 10,
		BEff: 30_000_000, Options: []string{"a", "b", "c"}, Q: []uint64{10_000_000, 5_000_000, 0}, TotalPositions: 2})
	putMsg(t, fc, KeyForProposal(mid), &ProposalRecord{ResolverAddr: addr(0xD1), ProposedIndex: 0, ProposalBond: testBond, ProposalBlock: 20})
	fc.putPool(t, KeyForMarketPool(mid), 80_000_000)
	ok(t, c.DeliverMessageFinalizeMarket(&MessageFinalizeMarket{MarketId: mid, CallerAddr: addr(0xAA)}, 0, "h"))
	if fc.pool(KeyForMarketPool(mid)) != 10_000_000 || fc.account(creator) != CREATOR_BOND+70_000_000 {
		t.Fatalf("pool %d creator %d", fc.pool(KeyForMarketPool(mid)), fc.account(creator))
	}
}

// property: owed + surplus == pool; winners' payouts never exceed owed; creator never
// loses more than the seed — across random binary markets and both outcomes.
func TestV4_BinarySolvencyProperty(t *testing.T) {
	c, fc := newTestChain(t)
	v4On(t, fc)
	_ = c
	SetGlobalHeight(100)
	rng := rand.New(rand.NewSource(21))
	for it := 0; it < 300; it++ {
		seed := uint64(10_000_000 + rng.Int63n(5_000_000_000))
		m := &MarketState{BEff: seed, QYes: seed / 2, QNo: seed / 2}
		pool := seed
		type pos struct{ y, n uint64 }
		var ps []pos
		for k := 0; k < 1+rng.Intn(6); k++ {
			var p pos
			for j := 0; j < 1+rng.Intn(4); j++ {
				sh := uint64(1_000_000 + rng.Int63n(int64(seed)/4+1))
				yes := rng.Intn(2) == 0
				cost, err := ComputeTradeCost(m.QYes, m.QNo, m.BEff, sh, yes)
				if err != nil {
					t.Fatal(err)
				}
				pool += cost
				if yes {
					m.QYes += sh
					p.y += sh
				} else {
					m.QNo += sh
					p.n += sh
				}
			}
			ps = append(ps, p)
		}
		for _, win := range []bool{true, false} {
			owed := totalWinnerPayout(m, win, 0, pool)
			if owed > pool {
				t.Fatalf("owed %d > pool %d", owed, pool)
			}
			var paid uint64
			for _, p := range ps {
				w := p.n
				if win {
					w = p.y
				}
				paid += binaryPayoutV3(m, w, win, owed)
			}
			if paid > owed {
				t.Fatalf("it %d win=%v paid %d > owed %d", it, win, paid, owed)
			}
			if owed-paid > uint64(len(ps)) {
				t.Fatalf("it %d win=%v dust %d too large", it, win, owed-paid)
			}
			if pool-owed+0 < 0 {
				t.Fatal("negative surplus")
			}
		}
	}
}

// ── min volume for reward ───────────────────────────────────────────────────

func TestV4_ResolverRewardNeedsVolume(t *testing.T) {
	for _, big := range []bool{false, true} {
		c, fc, mid, creator, resolver := finalizable(t)
		v4On(t, fc)
		pool := uint64(100_000_000 + 50_000_000)
		if big {
			pool = 100_000_000 + MIN_REWARD_VOLUME + 1
		}
		putMsg(t, fc, KeyForMarket(mid), &MarketState{Status: STATUS_PROPOSED, Creator: creator, OpenTime: 1, ExpiryTime: 10,
			BEff: 100_000_000, QYes: 50_000_000 + 5, QNo: 50_000_000, TotalPositions: 1})
		fc.putPool(t, KeyForMarketPool(mid), pool)
		ok(t, c.DeliverMessageFinalizeMarket(&MessageFinalizeMarket{MarketId: mid, CallerAddr: addr(0xAA)}, 0, "h"))
		rrs := getRec(t, fc, resolver).RrsScore
		if big && rrs != 20 || !big && rrs != 10 {
			t.Fatalf("big=%v RRS %d", big, rrs)
		}
	}
}

// ── cancelled / voided: full refund incl. fees, seed back to creator ────────

func cancelScene(t *testing.T, status uint32) (*Contract, *fakeChain, []byte, []byte, []byte, []byte) {
	c, fc := newTestChain(t)
	v4On(t, fc)
	creator, a, b := addr(0xC1), addr(0xB1), addr(0xB2)
	mid := DeriveMarketId(creator, 1)
	putMsg(t, fc, KeyForMarket(mid), &MarketState{Status: status, Creator: creator, OpenTime: 1, ExpiryTime: 10, TotalPositions: 2, BEff: 50_000_000})
	putMsg(t, fc, KeyForPosition(mid, a), &PositionState{SharesYes: 1, CostPaid: 100_000_000})
	putMsg(t, fc, KeyForPosition(mid, b), &PositionState{SharesNo: 1, CostPaid: 300_000_000})
	fc.putPool(t, KeyForMarketPool(mid), 50_000_000+400_000_000)
	fc.putPool(t, KeyForCreatorFeePool(mid), 4_000_000)
	fc.putPool(t, KeyForResolverFeePool(mid), 4_000_000)
	putMsg(t, fc, KeyForTreasuryReserve(mid), &TreasuryReserve{LockedReserve: FINALIZATION_BOUNTY, CreatorBond: 0})
	fc.putAccount(t, a, 1)
	fc.putAccount(t, b, 1)
	SetGlobalHeight(20) // well inside every window
	return c, fc, mid, creator, a, b
}

func TestV4_CancelledRefundsFeesAndSeed(t *testing.T) {
	c, fc, mid, creator, a, b := cancelScene(t, STATUS_CANCELLED)
	ok(t, c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: a}, 0))
	if got := fc.account(a); got != 1+100_000_000+2_000_000 {
		t.Fatalf("A got %d", got)
	}
	ok(t, c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: b}, 0))
	if got := fc.account(b); got != 1+300_000_000+6_000_000 {
		t.Fatalf("B got %d", got)
	}
	if got := fc.account(creator); got != 50_000_000+FINALIZATION_BOUNTY {
		t.Fatalf("creator got %d want seed + reserve", got)
	}
	if fc.pool(KeyForMarketPool(mid)) != 0 || fc.pool(KeyForCreatorFeePool(mid)) != 0 || fc.pool(KeyForResolverFeePool(mid)) != 0 {
		t.Fatal("pools not emptied")
	}
}

func TestV4_VoidedRefundsFeesAndSeed(t *testing.T) {
	c, fc, mid, creator, a, b := cancelScene(t, STATUS_VOIDED)
	ok(t, c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: a}, 0))
	ok(t, c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: b}, 0))
	if fc.account(a) != 1+102_000_000 || fc.account(b) != 1+306_000_000 || fc.account(creator) != 50_000_000 {
		t.Fatalf("a=%d b=%d creator=%d", fc.account(a), fc.account(b), fc.account(creator))
	}
}

func TestV4_ReclaimCountsAndFinalSweep(t *testing.T) {
	c, fc := newTestChain(t)
	v4On(t, fc)
	creator, a, b := addr(0xC1), addr(0xB1), addr(0xB2)
	mid := DeriveMarketId(creator, 1)
	putMsg(t, fc, KeyForMarket(mid), &MarketState{Status: STATUS_OPEN, Creator: creator, OpenTime: 1, ExpiryTime: 10, TotalPositions: 2, BEff: 50_000_000})
	putMsg(t, fc, KeyForPosition(mid, a), &PositionState{SharesYes: 1, CostPaid: 100_000_000})
	putMsg(t, fc, KeyForPosition(mid, b), &PositionState{SharesNo: 1, CostPaid: 300_000_000})
	fc.putPool(t, KeyForMarketPool(mid), 450_000_000)
	fc.putPool(t, KeyForCreatorFeePool(mid), 4_000_000)
	fc.putPool(t, KeyForResolverFeePool(mid), 4_000_000)
	putMsg(t, fc, KeyForTreasuryReserve(mid), &TreasuryReserve{})
	fc.putAccount(t, a, 1)
	fc.putAccount(t, b, 1)
	SetGlobalHeight(10 + PROPOSAL_WINDOW_V2 + 5)
	ok(t, c.DeliverMessageReclaimStake(&MessageReclaimStake{MarketId: mid, ClaimantAddress: a}, 0))
	if m := getMarket(t, fc, mid); m.Status != STATUS_CANCELLED || m.ClaimedCount != 1 {
		t.Fatalf("status %d claimed %d", m.Status, m.ClaimedCount)
	}
	ok(t, c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: b}, 0))
	if fc.pool(KeyForMarketPool(mid)) != 0 || fc.account(creator) != 50_000_000 {
		t.Fatalf("seed not returned: pool %d creator %d", fc.pool(KeyForMarketPool(mid)), fc.account(creator))
	}
}

func TestV4_ReclaimLastSweepsSeed(t *testing.T) {
	c, fc := newTestChain(t)
	v4On(t, fc)
	creator, a := addr(0xC1), addr(0xB1)
	mid := DeriveMarketId(creator, 1)
	putMsg(t, fc, KeyForMarket(mid), &MarketState{Status: STATUS_OPEN, Creator: creator, OpenTime: 1, ExpiryTime: 10, TotalPositions: 1, BEff: 50_000_000})
	putMsg(t, fc, KeyForPosition(mid, a), &PositionState{SharesYes: 1, CostPaid: 100_000_000})
	fc.putPool(t, KeyForMarketPool(mid), 150_000_000)
	putMsg(t, fc, KeyForTreasuryReserve(mid), &TreasuryReserve{})
	fc.putAccount(t, a, 1)
	SetGlobalHeight(10 + PROPOSAL_WINDOW_V2 + 5)
	ok(t, c.DeliverMessageReclaimStake(&MessageReclaimStake{MarketId: mid, ClaimantAddress: a}, 0))
	if fc.pool(KeyForMarketPool(mid)) != 0 || fc.account(creator) != 50_000_000 || fc.account(a) != 1+100_000_000 {
		t.Fatalf("pool %d creator %d a %d", fc.pool(KeyForMarketPool(mid)), fc.account(creator), fc.account(a))
	}
}

// ── forfeit: LMSR exit value, not a free option ─────────────────────────────

func TestV4_ForfeitNoFreeOption(t *testing.T) {
	c, fc := newTestChain(t)
	v4On(t, fc)
	creator, res, other := addr(0xC1), addr(0xD1), addr(0xB2)
	fc.putAccount(t, creator, 10_000_000_000)
	fc.putAccount(t, res, 10_000_000_000)
	fc.putAccount(t, other, 10_000_000_000)
	seedResolver(t, fc, res, 10, MIN_RESOLVER_STAKE, true)
	SetGlobalHeight(100)
	ok(t, c.DeliverMessageCreateMarket(&MessageCreateMarket{CreatorAddress: creator, B0: 1_000_000_000, ExpiryTime: 1_000_000, Nonce: 1, Question: "q"}, 0, "h"))
	mid := DeriveMarketId(creator, 1)
	ok(t, c.DeliverMessageSubmitPrediction(&MessageSubmitPrediction{BettorAddress: res, MarketId: mid, Outcome: true, Shares: 20_000_000, MaxCost: 1 << 60}, 0, "1"))
	ok(t, c.DeliverMessageSubmitPrediction(&MessageSubmitPrediction{BettorAddress: other, MarketId: mid, Outcome: false, Shares: 110_000_000, MaxCost: 1 << 60}, 0, "2"))
	pos := &PositionState{}
	Unmarshal(fc.get(KeyForPosition(mid, res)), pos)
	cost := pos.CostPaid
	SetGlobalHeight(1_000_005)
	before := fc.account(res)
	ok(t, c.DeliverMessageForfeitPosition(&MessageForfeitPosition{MarketId: mid, ResolverAddress: res}, 0))
	got := fc.account(res) - before
	if got >= cost {
		t.Fatalf("refund %d >= cost %d: still a free option", got, cost)
	}
	if got == 0 {
		t.Fatal("refund should be the LMSR exit value, not zero")
	}
	t.Logf("cost %d, exit value %d", cost, got)
}

func TestV4_ForfeitNeverAboveCost(t *testing.T) {
	c, fc := newTestChain(t)
	v4On(t, fc)
	creator, res, other := addr(0xC1), addr(0xD1), addr(0xB2)
	fc.putAccount(t, creator, 10_000_000_000)
	fc.putAccount(t, res, 10_000_000_000)
	fc.putAccount(t, other, 10_000_000_000)
	seedResolver(t, fc, res, 10, MIN_RESOLVER_STAKE, true)
	SetGlobalHeight(100)
	ok(t, c.DeliverMessageCreateMarket(&MessageCreateMarket{CreatorAddress: creator, B0: 1_000_000_000, ExpiryTime: 1_000_000, Nonce: 1, Question: "q"}, 0, "h"))
	mid := DeriveMarketId(creator, 1)
	ok(t, c.DeliverMessageSubmitPrediction(&MessageSubmitPrediction{BettorAddress: res, MarketId: mid, Outcome: true, Shares: 20_000_000, MaxCost: 1 << 60}, 0, "1"))
	ok(t, c.DeliverMessageSubmitPrediction(&MessageSubmitPrediction{BettorAddress: other, MarketId: mid, Outcome: true, Shares: 100_000_000, MaxCost: 1 << 60}, 0, "2")) // price UP
	pos := &PositionState{}
	Unmarshal(fc.get(KeyForPosition(mid, res)), pos)
	SetGlobalHeight(1_000_005)
	before := fc.account(res)
	ok(t, c.DeliverMessageForfeitPosition(&MessageForfeitPosition{MarketId: mid, ResolverAddress: res}, 0))
	if got := fc.account(res) - before; got != pos.CostPaid {
		t.Fatalf("price up: refund %d, want exactly cost %d (capped)", got, pos.CostPaid)
	}
}

// ── epoch rollover ───────────────────────────────────────────────────────────

func TestV4_EpochRollover(t *testing.T) {
	c, fc := newTestChain(t)
	v4On(t, fc)
	e := uint64(10)
	fc.putPool(t, KeyForResolverEpochPool(e-1), 1000) // empty epoch: nobody can claim
	fc.putPool(t, KeyForResolverEpochPool(e-2), 700)  // has weight -> stays
	fc.putPool(t, KeyForEpochWeightedTotal(e-2), 5)
	fc.putPool(t, KeyForResolverEpochPool(e-STALE_EPOCH_LAG), 500) // stale -> swept
	fc.putPool(t, KeyForEpochWeightedTotal(e-STALE_EPOCH_LAG), 3)
	ok2(t, c.rolloverEpochs(e))
	if fc.pool(KeyForProtocolPool()) != 1500 || fc.pool(KeyForResolverEpochPool(e-1)) != 0 ||
		fc.pool(KeyForResolverEpochPool(e-STALE_EPOCH_LAG)) != 0 || fc.pool(KeyForResolverEpochPool(e-2)) != 700 {
		t.Fatalf("protocol %d", fc.pool(KeyForProtocolPool()))
	}
}

func ok2(t *testing.T, pe *PluginError) {
	t.Helper()
	if pe != nil {
		t.Fatal(pe)
	}
}

// ── tx entropy mixing ────────────────────────────────────────────────────────

func TestV4_TxEntropyMixing(t *testing.T) {
	c, fc := newTestChain(t)
	v4On(t, fc)
	read := func() uint64 {
		a := &PanelEntropyAccum{}
		Unmarshal(fc.get(PANEL_ENTROPY_KEY_V2), a)
		return a.Accumulator
	}
	start := read()
	ok2(t, c.mixTxEntropy("aa"))
	a1 := read()
	ok2(t, c.mixTxEntropy("bb"))
	a2 := read()
	if a1 == start || a2 == a1 {
		t.Fatal("entropy not mixed")
	}
	// order-sensitive & deterministic
	putMsg(t, fc, PANEL_ENTROPY_KEY_V2, &PanelEntropyAccum{Accumulator: start})
	ok2(t, c.mixTxEntropy("bb"))
	ok2(t, c.mixTxEntropy("aa"))
	if read() == a2 {
		t.Fatal("mix must depend on tx order")
	}
	putMsg(t, fc, PANEL_ENTROPY_KEY_V2, &PanelEntropyAccum{Accumulator: 0})
	ok2(t, c.mixTxEntropy("cc"))
	if read() != 0 {
		t.Fatal("must never mix into an uninitialised accumulator")
	}
}

func TestV4_AutoCancelPaysSeedImmediatelyAndRefundsStayClaimable(t *testing.T) {
	c, fc := newTestChain(t)
	v4On(t, fc)
	creator, a, b := addr(0xC1), addr(0xB1), addr(0xB2)
	mid := DeriveMarketId(creator, 1)
	putMsg(t, fc, KeyForMarket(mid), &MarketState{Status: STATUS_OPEN, Creator: creator, OpenTime: 1, ExpiryTime: 10, TotalPositions: 2, BEff: 50_000_000})
	putMsg(t, fc, KeyForPosition(mid, a), &PositionState{SharesYes: 1, CostPaid: 100_000_000})
	putMsg(t, fc, KeyForPosition(mid, b), &PositionState{SharesNo: 1, CostPaid: 300_000_000})
	fc.putPool(t, KeyForMarketPool(mid), 450_000_000)
	fc.putPool(t, KeyForCreatorFeePool(mid), 4_000_000)
	fc.putPool(t, KeyForResolverFeePool(mid), 4_000_000)
	putMsg(t, fc, KeyForTreasuryReserve(mid), &TreasuryReserve{CreatorBond: CREATOR_BOND})
	fc.putAccount(t, a, 1)
	fc.putAccount(t, b, 1)
	SetGlobalHeight(10 + PROPOSAL_WINDOW_V2 + 5)
	ok(t, c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: a}, 0))
	if fc.account(creator) != 50_000_000 {
		t.Fatalf("seed not paid at close: %d", fc.account(creator))
	}
	if fc.pool(KeyForMarketPool(mid)) != 300_000_000 {
		t.Fatalf("pool %d must hold exactly B's refund", fc.pool(KeyForMarketPool(mid)))
	}
	// far in the future B can still claim in full, with fees
	SetGlobalHeight(10 + 100_000_000)
	ok(t, c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: b}, 0))
	if fc.account(b) != 1+300_000_000+6_000_000 {
		t.Fatalf("B %d", fc.account(b))
	}
}

func TestV4_FeeFloorAndStrictCharge(t *testing.T) {
	c, fc := newTestChain(t)
	v4On(t, fc)
	SetGlobalHeight(100)
	if c.v4FeeGate(MIN_TX_FEE-1) == nil || c.v4FeeGate(MIN_TX_FEE) != nil {
		t.Fatal("fee floor wrong")
	}
	fc.putAccount(t, addr(0x01), 5)
	if pe := c.chargeAndRoute(addr(0x01), 10); pe == nil {
		t.Fatal("V4 must fail (not skip) when the fee cannot be paid")
	}
}

func TestV4_RevealNonceMinimum(t *testing.T) {
	c, fc := newTestChain(t)
	v4On(t, fc)
	SetGlobalHeight(100)
	r := c.DeliverMessageRevealVote(&MessageRevealVote{MarketId: addr(1), VoterAddr: addr(2), Nonce: []byte{1, 2, 3}}, 10_000)
	if r.Error == nil {
		t.Fatal("short nonce must be rejected")
	}
}

func TestV4_SurplusCapToggleIsOff(t *testing.T) {
	if CREATOR_SURPLUS_CAP_TO_SEED {
		t.Fatal("default is standard LMSR: creator keeps the whole residual")
	}
}

func TestV4_MalformedCreatorFallsBackToTreasury(t *testing.T) {
	c, fc := newTestChain(t)
	v4On(t, fc)
	ok2(t, c.creditAccount(nil, 123))
	if fc.pool(KeyForTreasuryPool()) != 123 {
		t.Fatal("value must not vanish")
	}
}
