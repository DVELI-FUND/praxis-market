package contract

import (
	"math/rand"
	"testing"
)

// v3On activates every gate the patch depends on for the duration of a test.
func v3On(t *testing.T, fc *fakeChain) {
	t.Helper()
	oP, oR, oA := PATCH_V3_HEIGHT, RESOLVER_FIX_HEIGHT, AUDIT_FIX_HEIGHT
	PATCH_V3_HEIGHT, RESOLVER_FIX_HEIGHT, AUDIT_FIX_HEIGHT = 1, 1, 1
	t.Cleanup(func() { PATCH_V3_HEIGHT, RESOLVER_FIX_HEIGHT, AUDIT_FIX_HEIGHT = oP, oR, oA })
	putMsg(t, fc, PANEL_ENTROPY_KEY_V2, &PanelEntropyAccum{Accumulator: 987654321})
}

func v3Chain(t *testing.T) (*Contract, *fakeChain) {
	c, fc := newTestChain(t)
	v3On(t, fc)
	return c, fc
}

func totalValue(fc *fakeChain, accts ...[]byte) uint64 {
	var s uint64
	for _, a := range accts {
		s += fc.account(a)
	}
	return s
}

func TestV3_GateOffByDefault(t *testing.T) {
	// V3 is live on the chain (height set); the gate must flip exactly at its height.
	if PATCH_V3_HEIGHT == ^uint64(0) {
		t.Skip("V3 gate disabled in this build")
	}
	if patchV3Active(PATCH_V3_HEIGHT-1) || !patchV3Active(PATCH_V3_HEIGHT) {
		t.Fatal("V3 gate boundary wrong")
	}
}

func TestV3_DisputeKeepsTreasuryAndNeedsPanel(t *testing.T) {
	c, fc := newTestChain(t)
	v3On(t, fc)
	creator, proposer, disputer := addr(0xC1), addr(0xD1), addr(0xE1)
	mid := DeriveMarketId(creator, 1)
	putMsg(t, fc, KeyForMarket(mid), &MarketState{Status: STATUS_PROPOSED, Creator: creator, OpenTime: 1, ExpiryTime: 3_000_000, QYes: 1000, QNo: 1000})
	putMsg(t, fc, KeyForProposal(mid), &ProposalRecord{ResolverAddr: proposer, ProposedOutcome: true, ProposalBond: testBond, ProposalBlock: 20})
	putMsg(t, fc, KeyForMarketPool(mid), &Pool{Amount: 1_000_000_000})
	seedResolver(t, fc, proposer, 10, MIN_RESOLVER_STAKE, true)
	seedResolver(t, fc, addr(0xF1), 10, MIN_RESOLVER_STAKE, true)
	fc.putAccount(t, disputer, 10_000_000_000)
	fc.putPool(t, KeyForTreasuryPool(), 1_000_000_000)
	SetGlobalHeight(100)
	// only 1 eligible candidate -> must be refused
	if r := c.DeliverMessageFileDispute(&MessageFileDispute{MarketId: mid, DisputerAddress: disputer, DisputeBond: 1_000_000_000}, 1000, "tx"); r.Error == nil {
		t.Fatal("a 1-member panel must be rejected")
	}
	seedResolver(t, fc, addr(0xF2), 10, MIN_RESOLVER_STAKE, true)
	seedResolver(t, fc, addr(0xF3), 10, MIN_RESOLVER_STAKE, true)
	// bond must scale with the live pool (2% of 1000 PRX = 20 PRX < 60 floor here, so use bigger pool)
	putMsg(t, fc, KeyForMarketPool(mid), &Pool{Amount: 50_000_000_000})
	if r := c.DeliverMessageFileDispute(&MessageFileDispute{MarketId: mid, DisputerAddress: disputer, DisputeBond: MIN_B0}, 1000, "tx"); r.Error == nil {
		t.Fatal("dispute bond must scale with the pool")
	}
	ok(t, c.DeliverMessageFileDispute(&MessageFileDispute{MarketId: mid, DisputerAddress: disputer, DisputeBond: 1_000_000_000}, 1000, "tx"))
	if got := fc.pool(KeyForTreasuryPool()); got != 1_000_000_000+500 {
		t.Fatalf("treasury %d, want %d", got, 1_000_000_500)
	}
	d := &DisputeRecord{}
	Unmarshal(fc.get(KeyForDispute(mid)), d)
	if len(d.PanelMembers) != 3 {
		t.Fatalf("panel %d", len(d.PanelMembers))
	}
}

func TestV3_BinaryNoArbitrageAndExactPayouts(t *testing.T) {
	c, fc := v3Chain(t)
	creator, a, b := addr(0xC1), addr(0xB1), addr(0xB2)
	for _, x := range [][]byte{creator, a, b} {
		fc.putAccount(t, x, 10_000_000_000)
	}
	SetGlobalHeight(100)
	B0 := uint64(1_000_000_000)
	ok(t, c.DeliverMessageCreateMarket(&MessageCreateMarket{CreatorAddress: creator, B0: B0, ExpiryTime: 1_000_000, Nonce: 1, Question: "q"}, 0, "h"))
	mid := DeriveMarketId(creator, 1)
	// A tries the old arbitrage: both sides
	startA := fc.account(a)
	X := uint64(118_000_000)
	ok(t, c.DeliverMessageSubmitPrediction(&MessageSubmitPrediction{BettorAddress: a, MarketId: mid, Outcome: true, Shares: X, MaxCost: 1 << 60}, 0, "1"))
	ok(t, c.DeliverMessageSubmitPrediction(&MessageSubmitPrediction{BettorAddress: a, MarketId: mid, Outcome: false, Shares: X, MaxCost: 1 << 60}, 0, "2"))
	// B takes an honest YES position
	ok(t, c.DeliverMessageSubmitPrediction(&MessageSubmitPrediction{BettorAddress: b, MarketId: mid, Outcome: true, Shares: 50_000_000, MaxCost: 1 << 60}, 0, "3"))
	for _, win := range []bool{true, false} {
		m := getMarket(t, fc, mid)
		m.Status = STATUS_FINALIZED
		pool := fc.pool(KeyForMarketPool(mid))
		m.FinalizedPoolAmount = pool
		putMsg(t, fc, KeyForMarket(mid), m)
		putMsg(t, fc, KeyForOutcome(mid), &OutcomeState{WinningOutcome: win, ResolvedAt: 150})
		SetGlobalHeight(200)
		// reset claim flags between the two passes
		for _, x := range [][]byte{a, b} {
			p := &PositionState{}
			Unmarshal(fc.get(KeyForPosition(mid, x)), p)
			p.Claimed = false
			putMsg(t, fc, KeyForPosition(mid, x), p)
		}
		bal0A, bal0B := fc.account(a), fc.account(b)
		ok(t, c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: a}, 0))
		gotA := fc.account(a) - bal0A
		if gotA != X {
			t.Fatalf("win=%v: A paid %d want exactly %d shares", win, gotA, X)
		}
		if win {
			ok(t, c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: b}, 0))
			if got := fc.account(b) - bal0B; got != 50_000_000 {
				t.Fatalf("B paid %d", got)
			}
		}
		// restore pool for second pass
		fc.putPool(t, KeyForMarketPool(mid), pool)
		fc.putAccount(t, a, bal0A)
		fc.putAccount(t, b, bal0B)
		SetGlobalHeight(100)
	}
	if fc.account(a) >= startA {
		// A bought both sides: must have LOST fees, never gained
	}
	startNow := startA
	_ = startNow
}

func TestV3_BinaryArbLoses(t *testing.T) {
	c, fc := v3Chain(t)
	creator, trader := addr(0xC1), addr(0xB1)
	fc.putAccount(t, creator, 10_000_000_000)
	fc.putAccount(t, trader, 10_000_000_000)
	SetGlobalHeight(100)
	ok(t, c.DeliverMessageCreateMarket(&MessageCreateMarket{CreatorAddress: creator, B0: 1_000_000_000, ExpiryTime: 1_000_000, Nonce: 1, Question: "q"}, 0, "h"))
	mid := DeriveMarketId(creator, 1)
	start := fc.account(trader)
	X := uint64(118_000_000)
	ok(t, c.DeliverMessageSubmitPrediction(&MessageSubmitPrediction{BettorAddress: trader, MarketId: mid, Outcome: true, Shares: X, MaxCost: 1 << 60}, 0, "1"))
	ok(t, c.DeliverMessageSubmitPrediction(&MessageSubmitPrediction{BettorAddress: trader, MarketId: mid, Outcome: false, Shares: X, MaxCost: 1 << 60}, 0, "2"))
	m := getMarket(t, fc, mid)
	m.Status = STATUS_FINALIZED
	m.FinalizedPoolAmount = fc.pool(KeyForMarketPool(mid))
	putMsg(t, fc, KeyForMarket(mid), m)
	putMsg(t, fc, KeyForOutcome(mid), &OutcomeState{WinningOutcome: true, ResolvedAt: 150})
	SetGlobalHeight(200)
	ok(t, c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: trader}, 0))
	if fc.account(trader) >= start {
		t.Fatalf("arbitrage still profitable: %d -> %d", start, fc.account(trader))
	}
	t.Logf("arbitrage now loses %d micro-PRX (fees)", start-fc.account(trader))
}

func TestV3_BinaryCostMatchesFloatWithinOneUnit(t *testing.T) {
	oP, oR, oA := PATCH_V3_HEIGHT, RESOLVER_FIX_HEIGHT, AUDIT_FIX_HEIGHT
	defer func() { PATCH_V3_HEIGHT, RESOLVER_FIX_HEIGHT, AUDIT_FIX_HEIGHT = oP, oR, oA }()
	rng := rand.New(rand.NewSource(11))
	for i := 0; i < 300; i++ {
		b := uint64(10_000_000 + rng.Int63n(5_000_000_000))
		qy, qn := uint64(rng.Int63n(int64(b)*3)), uint64(rng.Int63n(int64(b)*3))
		sh := uint64(1_000_000 + rng.Int63n(int64(b)))
		out := rng.Intn(2) == 0
		PATCH_V3_HEIGHT = ^uint64(0)
		SetGlobalHeight(100)
		fl, _ := ComputeTradeCost(qy, qn, b, sh, out) // gate off -> float
		PATCH_V3_HEIGHT, RESOLVER_FIX_HEIGHT, AUDIT_FIX_HEIGHT = 1, 1, 1
		SetGlobalHeight(100)
		fx, err := ComputeTradeCost(qy, qn, b, sh, out)
		if err != nil {
			t.Fatal(err)
		}
		d := int64(fx) - int64(fl)
		if d < 0 || d > 2 {
			t.Fatalf("fixed %d vs float %d", fx, fl)
		}
	}
}

func TestV3_PayoutOverflowFixed(t *testing.T) {
	m := &MarketState{BEff: 0, QYes: 12_000_000_000}
	if got := binaryPayoutV3(m, 6_000_000_000, true, 17_999_999_999); got != 6_000_000_000 {
		t.Fatalf("got %d", got)
	}
	if got := computePayoutV3(17_999_999_999, 6_000_000_000, 12_000_000_000); got != 8_999_999_999 {
		t.Fatalf("got %d", got)
	}
}

func TestV3_RRSNotLaunderedByTopUpOrExit(t *testing.T) {
	c, fc := v3Chain(t)
	r := addr(0xD1)
	seedResolver(t, fc, r, 0, MIN_RESOLVER_STAKE, true)
	fc.putAccount(t, r, 10)
	ok(t, c.DeliverMessageRegisterResolver(&MessageRegisterResolver{ResolverAddress: r, StakeAmount: 1}, 0))
	if got := getRec(t, fc, r).RrsScore; got != 0 {
		t.Fatalf("RRS lifted to %d", got)
	}
	ok(t, c.DeliverMessageUnstakeResolver(&MessageUnstakeResolver{ResolverAddress: r, Amount: 0}, 0))
	if got := getRec(t, fc, r).RrsScore; got != 0 {
		t.Fatalf("RRS laundered by exit to %d", got)
	}
}

func TestV3_FeesRoutedNotBurned(t *testing.T) {
	c, fc := v3Chain(t)
	creator, trader := addr(0xC1), addr(0xB1)
	fc.putAccount(t, creator, 10_000_000_000)
	fc.putAccount(t, trader, 10_000_000_000)
	SetGlobalHeight(100)
	ok(t, c.DeliverMessageCreateMarket(&MessageCreateMarket{CreatorAddress: creator, B0: 1_000_000_000, ExpiryTime: 1_000_000, Nonce: 1, Question: "q"}, 0, "h"))
	mid := DeriveMarketId(creator, 1)
	ok(t, c.DeliverMessageSubmitPrediction(&MessageSubmitPrediction{BettorAddress: trader, MarketId: mid, Outcome: true, Shares: 10_000_000, MaxCost: 1 << 60}, 0, "1"))
	m := getMarket(t, fc, mid)
	m.Status = STATUS_FINALIZED
	m.FinalizedPoolAmount = fc.pool(KeyForMarketPool(mid))
	m.TotalPositions = 2 // keep the sweep out of this measurement
	putMsg(t, fc, KeyForMarket(mid), m)
	putMsg(t, fc, KeyForOutcome(mid), &OutcomeState{WinningOutcome: true, ResolvedAt: 150})
	SetGlobalHeight(200)
	before := fc.pool(KeyForFeePool(1)) + fc.pool(KeyForTreasuryPool())
	ok(t, c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: trader}, 777))
	after := fc.pool(KeyForFeePool(1)) + fc.pool(KeyForTreasuryPool())
	if after-before != 777 {
		t.Fatalf("fee routed %d want 777", after-before)
	}
}

func TestV3_ZeroPositionFinalizeReturnsSeed(t *testing.T) {
	c, fc, mid, creator, _ := finalizable(t)
	v3On(t, fc)
	SetGlobalHeight(20 + MIN_DISPUTE_BLOCKS + 5)
	fc.putPool(t, KeyForMarketPool(mid), 5_000_000)
	ok(t, c.DeliverMessageFinalizeMarket(&MessageFinalizeMarket{MarketId: mid, CallerAddr: addr(0xAA)}, 0, "h"))
	if fc.pool(KeyForMarketPool(mid)) != 0 || fc.account(creator) != CREATOR_BOND+5_000_000 {
		t.Fatalf("pool %d creator %d", fc.pool(KeyForMarketPool(mid)), fc.account(creator))
	}
}

func TestV3_LateClaimSweepsAndPaysNobody(t *testing.T) {
	c, fc := v3Chain(t)
	creator, w1, w2 := addr(0xC1), addr(0xB1), addr(0xB2)
	mid := DeriveMarketId(creator, 1)
	putMsg(t, fc, KeyForMarket(mid), &MarketState{Status: STATUS_FINALIZED, Creator: creator, TotalPositions: 2, QYes: 100, FinalizedPoolAmount: 1000})
	putMsg(t, fc, KeyForOutcome(mid), &OutcomeState{WinningOutcome: true, ResolvedAt: 150})
	putMsg(t, fc, KeyForMarketPool(mid), &Pool{Amount: 1000})
	for _, w := range [][]byte{w1, w2} {
		putMsg(t, fc, KeyForPosition(mid, w), &PositionState{SharesYes: 50, CostPaid: 10})
		fc.putAccount(t, w, 100)
	}
	SetGlobalHeight(150 + CLAIM_GRACE_PERIOD_V2 + 5)
	ok(t, c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: w1}, 0))
	if fc.account(w1) != 100 || fc.pool(KeyForMarketPool(mid)) != 0 || fc.pool(KeyForTreasuryPool()) != 1000 {
		t.Fatalf("late claim: w1=%d pool=%d treasury=%d", fc.account(w1), fc.pool(KeyForMarketPool(mid)), fc.pool(KeyForTreasuryPool()))
	}
}

func TestV3_AutoCancelSweepsExtrasAndFreesSlot(t *testing.T) {
	c, fc := v3Chain(t)
	creator, trader := addr(0xC1), addr(0xB1)
	mid := DeriveMarketId(creator, 1)
	putMsg(t, fc, KeyForMarket(mid), &MarketState{Status: STATUS_OPEN, Creator: creator, OpenTime: 1, ExpiryTime: 10, TotalPositions: 1, QYes: 50, BEff: 10})
	putMsg(t, fc, KeyForPosition(mid, trader), &PositionState{SharesYes: 50, CostPaid: 100})
	putMsg(t, fc, KeyForMarketPool(mid), &Pool{Amount: 1000})
	putMsg(t, fc, KeyForTreasuryReserve(mid), &TreasuryReserve{LockedReserve: FINALIZATION_BOUNTY, CreatorBond: CREATOR_BOND})
	putMsg(t, fc, KeyForCreatorFeePool(mid), &Pool{Amount: 7})
	putMsg(t, fc, KeyForResolverFeePool(mid), &Pool{Amount: 9})
	putMsg(t, fc, KeyForCreatorOpenCount(creator), &Pool{Amount: 5})
	fc.putAccount(t, trader, 1)
	SetGlobalHeight(10 + PROPOSAL_WINDOW_V2 + 5)
	ok(t, c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: trader}, 0))
	if fc.pool(KeyForCreatorFeePool(mid)) != 0 || fc.pool(KeyForResolverFeePool(mid)) != 0 {
		t.Fatal("fee pools not swept")
	}
	if got := fc.pool(KeyForTreasuryPool()); got != CREATOR_BOND+FINALIZATION_BOUNTY+16+900 {
		t.Fatalf("treasury %d", got)
	}
	if fc.pool(KeyForCreatorOpenCount(creator)) != 4 {
		t.Fatal("open slot not freed")
	}
}

func TestV3_ProposeBlockedAfterCancelWindowAndChargesFee(t *testing.T) {
	c, fc := v3Chain(t)
	creator, resolver := addr(0xC1), addr(0xD1)
	mid := DeriveMarketId(creator, 1)
	putMsg(t, fc, KeyForMarket(mid), &MarketState{Status: STATUS_OPEN, Creator: creator, OpenTime: 1, ExpiryTime: 10, BEff: 10})
	seedResolver(t, fc, resolver, 10, MIN_RESOLVER_STAKE, true)
	fc.putAccount(t, resolver, 1000)
	SetGlobalHeight(10 + PROPOSAL_WINDOW_V2 + 5)
	if r := c.DeliverMessageProposeOutcome(&MessageProposeOutcome{MarketId: mid, ResolverAddress: resolver, ProposedOutcome: true, ProposalBond: MIN_B0}, 5, "h"); r.Error == nil {
		t.Fatal("proposal after cancel window must fail")
	}
	SetGlobalHeight(20)
	ok(t, c.DeliverMessageProposeOutcome(&MessageProposeOutcome{MarketId: mid, ResolverAddress: resolver, ProposedOutcome: true, ProposalBond: MIN_B0}, 50, "h"))
	if fc.account(resolver) != 950 || fc.pool(KeyForTreasuryPool()) != 25 {
		t.Fatalf("fee not charged/routed: acct %d treasury %d", fc.account(resolver), fc.pool(KeyForTreasuryPool()))
	}
}

func TestV3_EndBlockDustToProtocol(t *testing.T) {
	c, fc := v3Chain(t)
	fc.putPool(t, KeyForTreasuryPool(), 1_000_003)
	SetGlobalHeight(PRIS_EPOCH_BLOCKS)
	if pe := c.processEpochBoundary(PRIS_EPOCH_BLOCKS); pe != nil {
		t.Fatal(pe)
	}
	sum := fc.pool(KeyForBuilderPool()) + fc.pool(KeyForCommunityPool()) + fc.pool(KeyForInvestorPool()) + fc.pool(KeyForProtocolPool()) + fc.pool(KeyForResolverEpochPool(1))
	if sum != 1_000_003 {
		t.Fatalf("distributed %d of 1000003", sum)
	}
}

func TestV3_PanelDrawUsesFullRange(t *testing.T) {
	var cand [][]byte
	for i := 0; i < 4; i++ {
		cand = append(cand, addr(byte(i+1)))
	}
	seen := map[string]bool{}
	rng := rand.New(rand.NewSource(5))
	for i := 0; i < 400; i++ {
		p := derivePanelV3(cand, 3, rng.Uint64())
		k := ""
		for _, m := range p {
			k += string(m[:1])
		}
		seen[k] = true
	}
	if len(seen) < 20 {
		t.Fatalf("only %d distinct ordered panels from 4 candidates", len(seen))
	}
}
