package contract

import "testing"

func nRegisterResolver(t *testing.T, fc *fakeChain, who []byte, stake uint64) {
	t.Helper()
	fc.set(KeyForResolverRecord(who), mustMarshal(t, &ResolverRecord{
		ResolverAddress: who, StakeAmount: stake, RrsScore: RRS_GOLD_THRESHOLD, IsActive: true,
	}))
}

func TestNOutcomeProposeFinalizeClaim(t *testing.T) {
	c, fc, creator := nSetup(t)
	b1, b2, conflicted, resolver, caller := addr(0xB1), addr(0xB2), addr(0x98), addr(0x99), addr(0xC1)
	for _, a := range [][]byte{b1, b2, conflicted} {
		fc.putAccount(t, a, 100_000_000_000)
	}
	mid := nCreate(t, c, creator, 1, []string{"Alice", "Bob", "Nobody"})
	if r := nBuy(c, mid, b1, 2, 3*PRECISION_SCALE); r.Error != nil {
		t.Fatal(r.Error)
	}
	if r := nBuy(c, mid, b2, 0, 2*PRECISION_SCALE); r.Error != nil {
		t.Fatal(r.Error)
	}
	if r := nBuy(c, mid, conflicted, 1, PRECISION_SCALE); r.Error != nil {
		t.Fatal(r.Error)
	}
	m := nMarket(t, fc, mid)
	bond := ComputeMinBond(m)
	nRegisterResolver(t, fc, resolver, 1_000_000_000)
	nRegisterResolver(t, fc, conflicted, 1_000_000_000)
	SetGlobalHeight(m.ExpiryTime + 10)

	propose := func(who []byte, idx uint32) *PluginDeliverResponse {
		return c.DeliverMessageProposeOutcome(&MessageProposeOutcome{
			MarketId: mid, ResolverAddress: who, ProposedIndex: idx, ProposalBond: bond,
		}, 0, "h")
	}
	if r := propose(resolver, 3); r.Error == nil {
		t.Fatal("proposed index 3 on a 3-option market must be rejected")
	}
	if r := propose(conflicted, 1); r.Error == nil {
		t.Fatal("COI-1: resolver holding N-outcome shares must be rejected")
	}
	if r := propose(resolver, 2); r.Error != nil {
		t.Fatalf("propose: %v", r.Error)
	}
	pr := &ProposalRecord{}
	if pe := Unmarshal(fc.get(KeyForProposal(mid)), pr); pe != nil {
		t.Fatal(pe)
	}
	if pr.ProposedIndex != 2 {
		t.Fatalf("proposal index=%d want 2", pr.ProposedIndex)
	}

	SetGlobalHeight(pr.ProposalBlock + ComputeDisputeBlocks(m.OpenTime, m.ExpiryTime) + 1)
	if r := c.DeliverMessageFinalizeMarket(&MessageFinalizeMarket{MarketId: mid, CallerAddr: caller}, 0, "h"); r.Error != nil {
		t.Fatalf("finalize: %v", r.Error)
	}
	fm := nMarket(t, fc, mid)
	if fm.Status != STATUS_FINALIZED {
		t.Fatalf("status=%d want FINALIZED", fm.Status)
	}
	o := &OutcomeState{}
	if pe := Unmarshal(fc.get(KeyForOutcome(mid)), o); pe != nil {
		t.Fatal(pe)
	}
	if o.WinningIndex != 2 || o.ResolvedAt == 0 {
		t.Fatalf("outcome=%+v want WinningIndex 2", o)
	}

	b1Before, b2Before := fc.account(b1), fc.account(b2)
	if r := c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: b1}, 0); r.Error != nil {
		t.Fatalf("winner claim: %v", r.Error)
	}
	if got := fc.account(b1) - b1Before; got != 3*PRECISION_SCALE {
		t.Fatalf("winner payout=%d want %d", got, 3*PRECISION_SCALE)
	}
	if r := c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: b2}, 0); r.Error != nil {
		t.Fatalf("loser claim: %v", r.Error)
	}
	if fc.account(b2) != b2Before {
		t.Fatal("loser must receive 0")
	}
}
