package contract

import "testing"

// finalizedMarketForClaims runs create -> buy -> propose -> finalize and returns the
// market id, the winning bettor and the finalization height.
func finalizedMarketForClaims(t *testing.T, c *Contract, fc *fakeChain, creator []byte, nonce uint64) ([]byte, []byte, uint64) {
	t.Helper()
	b1, resolver := addr(0xB1), addr(0x99)
	fc.putAccount(t, b1, 100_000_000_000)
	mid := nCreate(t, c, creator, nonce, []string{"A", "B"})
	if r := nBuy(c, mid, b1, 1, 3*PRECISION_SCALE); r.Error != nil {
		t.Fatal(r.Error)
	}
	m := nMarket(t, fc, mid)
	nRegisterResolver(t, fc, resolver, 1_000_000_000)
	SetGlobalHeight(m.ExpiryTime + 10)
	if r := c.DeliverMessageProposeOutcome(&MessageProposeOutcome{MarketId: mid, ResolverAddress: resolver, ProposedIndex: 1, ProposalBond: ComputeMinBond(m)}, 0, "h"); r.Error != nil {
		t.Fatalf("propose: %v", r.Error)
	}
	pr := &ProposalRecord{}
	if pe := Unmarshal(fc.get(KeyForProposal(mid)), pr); pe != nil {
		t.Fatal(pe)
	}
	SetGlobalHeight(pr.ProposalBlock + ComputeDisputeBlocks(m.OpenTime, m.ExpiryTime) + 1)
	if r := c.DeliverMessageFinalizeMarket(&MessageFinalizeMarket{MarketId: mid, CallerAddr: addr(0xC1)}, 0, "h"); r.Error != nil {
		t.Fatalf("finalize: %v", r.Error)
	}
	oc := &OutcomeState{}
	if pe := Unmarshal(fc.get(KeyForOutcome(mid)), oc); pe != nil || oc.ResolvedAt == 0 {
		t.Fatalf("no resolved_at: %v", pe)
	}
	return mid, b1, oc.ResolvedAt
}

func TestV2ClaimWindowIs24h(t *testing.T) {
	c, fc, creator := nSetup(t)
	v2Gate(t, fc)
	mid, b1, at := finalizedMarketForClaims(t, c, fc, creator, 1)
	if !nMarket(t, fc, mid).EngineV2 {
		t.Fatal("expected a v2 market")
	}
	// last block of the window: still paid
	SetGlobalHeight(at + V2_CLAIM_GRACE_BLOCKS)
	before := fc.account(b1)
	if r := c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: b1}, 0); r.Error != nil {
		t.Fatalf("claim inside window: %v", r.Error)
	}
	if fc.account(b1) <= before {
		t.Fatal("winner was not paid inside the 24h window")
	}
}

func TestV2ClaimAfter24hSweepsToTreasury(t *testing.T) {
	c, fc, creator := nSetup(t)
	v2Gate(t, fc)
	mid, b1, at := finalizedMarketForClaims(t, c, fc, creator, 2)
	pool := fc.pool(KeyForMarketPool(mid))
	tr, before := fc.pool(KeyForTreasuryPool()), fc.account(b1)
	SetGlobalHeight(at + V2_CLAIM_GRACE_BLOCKS + 1)
	if r := c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: b1}, 0); r.Error != nil {
		t.Fatalf("sweep call: %v", r.Error)
	}
	if fc.account(b1) != before {
		t.Fatal("nobody may be paid after the window")
	}
	if fc.pool(KeyForMarketPool(mid)) != 0 || fc.pool(KeyForTreasuryPool())-tr != pool {
		t.Fatalf("pool %d not swept to treasury", pool)
	}
}

// "Moving forward": a market created BEFORE engine v2 keeps its 30-day window.
func TestLegacyMarketKeeps30DayClaimWindow(t *testing.T) {
	c, fc, creator := nSetup(t)
	v2Gate(t, fc)
	SetGlobalHeight(100)
	old := ENGINE_V2_HEIGHT
	ENGINE_V2_HEIGHT = 1 << 40 // not active yet: this market is created as legacy
	mid, b1, at := func() ([]byte, []byte, uint64) {
		defer func() { ENGINE_V2_HEIGHT = old }()
		return finalizedMarketForClaims(t, c, fc, creator, 3)
	}()
	if nMarket(t, fc, mid).EngineV2 {
		t.Fatal("expected a legacy market")
	}
	SetGlobalHeight(at + V2_CLAIM_GRACE_BLOCKS + 1) // past 24h, far inside 30 days
	before := fc.account(b1)
	if r := c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: b1}, 0); r.Error != nil {
		t.Fatalf("legacy claim: %v", r.Error)
	}
	if fc.account(b1) <= before {
		t.Fatal("legacy market winner must still be paid after 24h")
	}
}
