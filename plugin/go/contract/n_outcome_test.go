package contract

import (
	"strings"
	"testing"
)

const nTestB0 = 500_000_000

func nSetup(t *testing.T) (*Contract, *fakeChain, []byte) {
	t.Helper()
	c, fc := newTestChain(t)
	creator := addr(0xA1)
	fc.putAccount(t, creator, 100_000_000_000)
	fc.putPool(t, KeyForTreasuryPool(), 1_000_000)
	return c, fc, creator
}

func nCreate(t *testing.T, c *Contract, creator []byte, nonce uint64, opts []string) []byte {
	t.Helper()
	resp := c.DeliverMessageCreateMarket(&MessageCreateMarket{
		CreatorAddress: creator, B0: nTestB0, ExpiryTime: 5000, Nonce: nonce,
		Question: "Who wins?", Options: opts,
	}, 1000, "h")
	if resp.Error != nil {
		t.Fatalf("create: %v", resp.Error)
	}
	return DeriveMarketId(creator, nonce)
}

func nMarket(t *testing.T, fc *fakeChain, mid []byte) *MarketState {
	t.Helper()
	m := &MarketState{}
	if pe := Unmarshal(fc.get(KeyForMarket(mid)), m); pe != nil {
		t.Fatal(pe)
	}
	return m
}

func nPos(t *testing.T, fc *fakeChain, mid, who []byte) *PositionState {
	t.Helper()
	p := &PositionState{}
	if pe := Unmarshal(fc.get(KeyForPosition(mid, who)), p); pe != nil {
		t.Fatal(pe)
	}
	return p
}

func nBuy(c *Contract, mid, who []byte, idx uint32, shares uint64) *PluginDeliverResponse {
	return c.DeliverMessageSubmitPrediction(&MessageSubmitPrediction{
		MarketId: mid, BettorAddress: who, OutcomeIndex: idx, Shares: shares, MaxCost: 50_000_000,
	}, 0, "h")
}

func TestNOutcomeCreate(t *testing.T) {
	c, fc, creator := nSetup(t)
	mid := nCreate(t, c, creator, 1, []string{"Alice", "Bob", "Nobody"})
	m := nMarket(t, fc, mid)
	if len(m.Options) != 3 || len(m.Q) != 3 {
		t.Fatalf("options=%d q=%d, want 3/3", len(m.Options), len(m.Q))
	}
	for i, q := range m.Q {
		if q != 0 {
			t.Fatalf("q[%d]=%d, want 0 (standard LMSR starts at zero)", i, q)
		}
	}
	if m.BEff == 0 || m.QYes != 0 || m.QNo != 0 || m.PayoutMode != PAYOUT_MODE_STANDARD {
		t.Fatalf("bad market: %+v", m)
	}
	pool := fc.pool(KeyForMarketPool(mid))
	if want := uint64(nTestB0) - FINALIZATION_BOUNTY; pool != want {
		t.Fatalf("pool=%d want %d", pool, want)
	}
	base, err := BaseCostN(m.Q, m.BEff)
	if err != nil || base > pool {
		t.Fatalf("seed does not cover b*ln(N): base=%d pool=%d err=%v", base, pool, err)
	}
}

func TestNOutcomeCreateRejectsAndLegacy(t *testing.T) {
	c, fc, creator := nSetup(t)
	eleven := make([]string, 11)
	for i := range eleven {
		eleven[i] = string(rune('a' + i))
	}
	bad := []struct {
		name string
		msg  MessageCreateMarket
	}{
		{"one option", MessageCreateMarket{Options: []string{"x"}}},
		{"eleven options", MessageCreateMarket{Options: eleven}},
		{"duplicate", MessageCreateMarket{Options: []string{"a", "a"}}},
		{"empty label", MessageCreateMarket{Options: []string{"a", ""}}},
		{"blank label", MessageCreateMarket{Options: []string{"a", "  "}}},
		{"long label", MessageCreateMarket{Options: []string{"a", strings.Repeat("x", 65)}}},
		{"payout mode 1", MessageCreateMarket{Options: []string{"a", "b"}, PayoutMode: 1}},
		{"seed too small", MessageCreateMarket{Options: []string{"a", "b"}, B0: MIN_B0}},
		{"legacy payout mode", MessageCreateMarket{PayoutMode: 1}},
	}
	for i, tc := range bad {
		msg := tc.msg
		msg.CreatorAddress, msg.ExpiryTime, msg.Nonce, msg.Question = creator, 5000, uint64(100+i), "q?"
		if msg.B0 == 0 {
			msg.B0 = nTestB0
		}
		if resp := c.DeliverMessageCreateMarket(&msg, 1000, "h"); resp.Error == nil {
			t.Errorf("%s: expected rejection", tc.name)
		}
	}
	// legacy binary create is unchanged
	resp := c.DeliverMessageCreateMarket(&MessageCreateMarket{
		CreatorAddress: creator, B0: nTestB0, ExpiryTime: 5000, Nonce: 1, Question: "q?",
	}, 1000, "h")
	if resp.Error != nil {
		t.Fatalf("legacy create: %v", resp.Error)
	}
	m := nMarket(t, fc, DeriveMarketId(creator, 1))
	if len(m.Options) != 0 || len(m.Q) != 0 || m.QYes == 0 || m.QYes != m.QNo {
		t.Fatalf("legacy market changed: %+v", m)
	}
}

func TestNOutcomeSubmit(t *testing.T) {
	c, fc, creator := nSetup(t)
	buyer := addr(0xB1)
	fc.putAccount(t, buyer, 100_000_000_000)
	mid := nCreate(t, c, creator, 1, []string{"Alice", "Bob", "Nobody"})
	m0 := nMarket(t, fc, mid)
	poolBefore := fc.pool(KeyForMarketPool(mid))
	shares := 2 * PRECISION_SCALE
	want, err := TradeCostN(m0.Q, m0.BEff, 1, shares)
	if err != nil {
		t.Fatal(err)
	}
	if resp := nBuy(c, mid, buyer, 1, shares); resp.Error != nil {
		t.Fatalf("submit: %v", resp.Error)
	}
	m := nMarket(t, fc, mid)
	if m.Q[1] != shares || m.Q[0] != 0 || m.Q[2] != 0 || m.TotalPositions != 1 {
		t.Fatalf("market after buy: q=%v positions=%d", m.Q, m.TotalPositions)
	}
	p := nPos(t, fc, mid, buyer)
	if len(p.Shares) != 3 || p.Shares[1] != shares || p.Shares[0] != 0 || p.Shares[2] != 0 || p.CostPaid != want {
		t.Fatalf("position: %+v want cost %d", p, want)
	}
	if got := fc.pool(KeyForMarketPool(mid)); got != poolBefore+want {
		t.Fatalf("pool=%d want %d", got, poolBefore+want)
	}
	pr, err := PricesN(m.Q, m.BEff)
	if err != nil || !(pr[1] > pr[0]) || pr[0] != pr[2] {
		t.Fatalf("prices %v err=%v", pr, err)
	}
	if resp := nBuy(c, mid, buyer, 3, shares); resp.Error == nil {
		t.Fatal("index 3 on a 3-option market must be rejected")
	}
	if resp := nBuy(c, mid, buyer, 0, PRECISION_SCALE-1); resp.Error == nil {
		t.Fatal("sub-minimum shares must be rejected")
	}
}

func TestNOutcomeClaim(t *testing.T) {
	c, fc, creator := nSetup(t)
	alice, bob := addr(0xB1), addr(0xB2)
	fc.putAccount(t, alice, 100_000_000_000)
	fc.putAccount(t, bob, 100_000_000_000)
	mid := nCreate(t, c, creator, 1, []string{"Alice", "Bob", "Nobody"})
	if resp := nBuy(c, mid, alice, 0, 3*PRECISION_SCALE); resp.Error != nil {
		t.Fatal(resp.Error)
	}
	if resp := nBuy(c, mid, bob, 1, 2*PRECISION_SCALE); resp.Error != nil {
		t.Fatal(resp.Error)
	}
	m := nMarket(t, fc, mid)
	pool := fc.pool(KeyForMarketPool(mid))
	for i, q := range m.Q { // solvency: pool covers a 1-unit payout to ANY winning option
		if pool < q {
			t.Fatalf("pool %d < q[%d] %d", pool, i, q)
		}
	}
	m.Status = STATUS_FINALIZED
	fc.set(KeyForMarket(mid), mustMarshal(t, m))
	fc.set(KeyForOutcome(mid), mustMarshal(t, &OutcomeState{WinningIndex: 0, ResolvedAt: 500_000}))
	SetGlobalHeight(500_100)

	aBefore, bBefore, tBefore := fc.account(alice), fc.account(bob), fc.pool(KeyForTreasuryPool())
	if resp := c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: alice}, 0); resp.Error != nil {
		t.Fatalf("alice claim: %v", resp.Error)
	}
	if got := fc.account(alice) - aBefore; got != 3*PRECISION_SCALE {
		t.Fatalf("alice payout=%d want %d", got, 3*PRECISION_SCALE)
	}
	if resp := c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: alice}, 0); resp.Error == nil {
		t.Fatal("double claim must fail")
	}
	if resp := c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: bob}, 0); resp.Error != nil {
		t.Fatalf("bob claim: %v", resp.Error)
	}
	if fc.account(bob) != bBefore {
		t.Fatalf("losing option must pay 0, bob balance moved %d -> %d", bBefore, fc.account(bob))
	}
	if got := fc.pool(KeyForMarketPool(mid)); got != 0 {
		t.Fatalf("pool not swept after all claimed: %d", got)
	}
	if got, want := fc.pool(KeyForTreasuryPool()), tBefore+pool-3*PRECISION_SCALE; got != want {
		t.Fatalf("treasury=%d want %d", got, want)
	}
}
