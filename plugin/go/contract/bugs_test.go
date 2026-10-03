package contract

import "testing"

func mustMarshal(t *testing.T, m interface{}) []byte {
	t.Helper()
	raw, pe := SafeMarshal(m)
	if pe != nil {
		t.Fatal(pe)
	}
	return raw
}

// Bug 1: create_market must ADD its fee share to the global treasury, never overwrite it.
func TestCreateMarketAccumulatesTreasury(t *testing.T) {
	c, fc := newTestChain(t)
	creator := addr(0xA1)
	fc.putAccount(t, creator, 100_000_000_000)
	fc.putPool(t, KeyForTreasuryPool(), 1_000_000)

	const fee = 1000
	for nonce := uint64(1); nonce <= 2; nonce++ {
		resp := c.DeliverMessageCreateMarket(&MessageCreateMarket{
			CreatorAddress: creator, B0: MIN_B0, ExpiryTime: 5000, Nonce: nonce, Question: "q?",
		}, fee, "h")
		if resp.Error != nil {
			t.Fatalf("create %d: %v", nonce, resp.Error)
		}
	}
	want := uint64(1_000_000) + 2*(fee-ComputeBps(fee, TX_TREASURY_SPLIT_BPS))
	if got := fc.pool(KeyForTreasuryPool()); got != want {
		t.Fatalf("treasury = %d, want %d (existing balance was overwritten)", got, want)
	}
}

// Bug 2: when the disputer wins the panel vote the market must reach a terminal,
// claimable state (VOIDED -> full refunds) and the disputer's bond must come back.
func TestDisputerWinVoidsMarket(t *testing.T) {
	c, fc := newTestChain(t)
	mid, disputer, caller := addr(0x01), addr(0xD1), addr(0xC1)
	panel := [][]byte{addr(0x51), addr(0x52), addr(0x53)}
	const bond = 777_000_000

	fc.set(KeyForMarket(mid), mustMarshal(t, &MarketState{Status: STATUS_DISPUTED, ExpiryTime: 10, OpenTime: 1, BEff: MIN_B0, Creator: addr(0xA1)}))
	fc.set(KeyForProposal(mid), mustMarshal(t, &ProposalRecord{ResolverAddr: addr(0x99), ProposedOutcome: true, ProposalBond: 1, ProposalBlock: 11}))
	fc.set(KeyForDispute(mid), mustMarshal(t, &DisputeRecord{DisputerAddress: disputer, DisputeBond: bond, DisputeBlock: 20, PanelSize: 3, PanelMembers: panel}))
	for i, m := range panel {
		fc.set(KeyForVoteReveal(mid, m), mustMarshal(t, &VoteReveal{VoterAddr: m, Vote: i < 2})) // 2 of 3 side with the disputer
	}
	SetGlobalHeight(20 + COMMIT_PHASE_BLOCKS + REVEAL_PHASE_BLOCKS + 5)

	if resp := c.DeliverMessageTallyVotes(&MessageTallyVotes{MarketId: mid, CallerAddr: caller}, 0); resp.Error != nil {
		t.Fatal(resp.Error)
	}
	m := &MarketState{}
	if pe := Unmarshal(fc.get(KeyForMarket(mid)), m); pe != nil {
		t.Fatal(pe)
	}
	if m.Status != STATUS_VOIDED {
		t.Fatalf("status = %d, want VOIDED (%d): market would be stuck with funds locked", m.Status, STATUS_VOIDED)
	}
	if got := fc.account(disputer); got != bond {
		t.Fatalf("disputer refund = %d, want %d", got, bond)
	}
}

// Bug 3: the creator bond is escrowed in TreasuryReserve, never inside the market pool,
// so finalize must not shrink the pool that winners are paid from.
func TestFinalizeDoesNotStripBondFromPool(t *testing.T) {
	c, fc := newTestChain(t)
	mid, creator, caller, resolver := addr(0x02), addr(0xA1), addr(0xC1), addr(0x99)
	const pool = 6_000_000_000 // larger than CREATOR_BOND

	fc.set(KeyForMarket(mid), mustMarshal(t, &MarketState{Status: STATUS_PROPOSED, ExpiryTime: 10, OpenTime: 1, BEff: MIN_B0, Creator: creator, TotalPositions: 1}))
	fc.set(KeyForProposal(mid), mustMarshal(t, &ProposalRecord{ResolverAddr: resolver, ProposedOutcome: true, ProposalBond: 1, ProposalBlock: 11}))
	fc.set(KeyForTreasuryReserve(mid), mustMarshal(t, &TreasuryReserve{LockedReserve: FINALIZATION_BOUNTY, CreatorBond: CREATOR_BOND}))
	fc.putPool(t, KeyForMarketPool(mid), pool)
	SetGlobalHeight(500_000)

	if resp := c.DeliverMessageFinalizeMarket(&MessageFinalizeMarket{MarketId: mid, CallerAddr: caller}, 0, "h"); resp.Error != nil {
		t.Fatal(resp.Error)
	}
	m := &MarketState{}
	if pe := Unmarshal(fc.get(KeyForMarket(mid)), m); pe != nil {
		t.Fatal(pe)
	}
	if m.FinalizedPoolAmount != pool {
		t.Fatalf("FinalizedPoolAmount = %d, want %d (bond wrongly removed from bettors' pot)", m.FinalizedPoolAmount, pool)
	}
	if got := fc.account(creator); got != CREATOR_BOND {
		t.Fatalf("creator bond refund = %d, want %d", got, CREATOR_BOND)
	}
}

// Bug 4: the post-claim sweep to treasury must not fire while other winners are
// still inside their claim window (grace is measured from finalization, not expiry).
func TestClaimsSurviveFirstClaimantSweep(t *testing.T) {
	c, fc := newTestChain(t)
	mid, a, b := addr(0x03), addr(0xE1), addr(0xE2)

	fc.set(KeyForMarket(mid), mustMarshal(t, &MarketState{Status: STATUS_FINALIZED, ExpiryTime: 10, OpenTime: 1, BEff: MIN_B0,
		QYes: 10_000_000, QNo: 5_000_000, TotalPositions: 2, FinalizedPoolAmount: 10_000_000}))
	fc.set(KeyForOutcome(mid), mustMarshal(t, &OutcomeState{WinningOutcome: true, ResolvedAt: 500_000}))
	fc.set(KeyForPosition(mid, a), mustMarshal(t, &PositionState{SharesYes: 2_000_000, CostPaid: 1}))
	fc.set(KeyForPosition(mid, b), mustMarshal(t, &PositionState{SharesYes: 3_000_000, CostPaid: 1}))
	fc.putPool(t, KeyForMarketPool(mid), 10_000_000)
	SetGlobalHeight(500_100) // 100 blocks after finalization

	for i, who := range [][]byte{a, b} {
		if resp := c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: who}, 0); resp.Error != nil {
			t.Fatalf("claimant %d failed: %v", i, resp.Error)
		}
	}
	if got := fc.account(a); got != 2_000_000 {
		t.Fatalf("A payout = %d", got)
	}
	if got := fc.account(b); got != 3_000_000 {
		t.Fatalf("B payout = %d", got)
	}
}

// Voided markets refund cost in full and sweep the remainder once everyone has claimed.
func TestVoidedMarketRefundsAndSweeps(t *testing.T) {
	c, fc := newTestChain(t)
	mid, a := addr(0x04), addr(0xE1)
	fc.set(KeyForMarket(mid), mustMarshal(t, &MarketState{Status: STATUS_VOIDED, ExpiryTime: 10, OpenTime: 1, BEff: MIN_B0, TotalPositions: 1}))
	fc.set(KeyForPosition(mid, a), mustMarshal(t, &PositionState{SharesYes: 2_000_000, CostPaid: 500}))
	fc.putPool(t, KeyForMarketPool(mid), 10_000)
	SetGlobalHeight(999_999)
	if resp := c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: a}, 0); resp.Error != nil {
		t.Fatal(resp.Error)
	}
	if got := fc.account(a); got != 500 {
		t.Fatalf("refund = %d", got)
	}
	if got := fc.pool(KeyForMarketPool(mid)); got != 0 {
		t.Fatalf("pool not swept: %d", got)
	}
	if got := fc.pool(KeyForTreasuryPool()); got != 9_500 {
		t.Fatalf("treasury = %d", got)
	}
}
