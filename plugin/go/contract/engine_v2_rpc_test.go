package contract

import "testing"

func quoteMatchesBuy(t *testing.T, c *Contract, fc *fakeChain, mid []byte, idx uint32, shares uint64) {
	t.Helper()
	b := addr(0xB7)
	fc.putAccount(t, b, 100_000_000_000)
	m := nMarket(t, fc, mid)
	q, pe := buildQuoteN("x", m, idx, shares, nil)
	if pe != nil {
		t.Fatal(pe)
	}
	before := fc.account(b)
	if r := nBuy(c, mid, b, idx, shares); r.Error != nil {
		t.Fatal(r.Error)
	}
	if got := before - fc.account(b); got != q.Total {
		t.Fatalf("quote total %d != actual charge %d", q.Total, got)
	}
	if q.Total != q.Cost+q.CreatorFee+q.ResolverFee+q.ProtocolFee {
		t.Fatal("total != parts")
	}
}

func TestQuoteMatchesActualChargeV2(t *testing.T) {
	c, fc, creator := nSetup(t)
	v2Gate(t, fc)
	mid := nCreate(t, c, creator, 1, []string{"A", "B", "C"})
	quoteMatchesBuy(t, c, fc, mid, 1, 5*PRECISION_SCALE)
	quoteMatchesBuy(t, c, fc, mid, 0, 2*PRECISION_SCALE)
	if v := engineViewOf(nMarket(t, fc, mid)); v.Version != 2 || v.AlphaPPM == 0 || v.Depth <= v.B0 {
		t.Fatalf("v2 view wrong: %+v", v)
	}
}

func TestQuoteMatchesActualChargeLegacyN(t *testing.T) {
	SetGlobalHeight(100)
	c, fc, creator := nSetup(t) // gate off => original N-outcome engine
	mid := nCreate(t, c, creator, 1, []string{"A", "B", "C"})
	quoteMatchesBuy(t, c, fc, mid, 2, 3*PRECISION_SCALE)
	v := engineViewOf(nMarket(t, fc, mid))
	if v.Version != 1 || v.AlphaPPM != 0 || v.Depth != v.B0 {
		t.Fatalf("v1 view wrong: %+v", v)
	}
	var sp uint64
	for _, p := range v.Probs {
		sp += p
	}
	if sp+3 < PRECISION_SCALE || sp > PRECISION_SCALE {
		t.Fatalf("probs sum %d", sp)
	}
}

func TestBudgetQuoteIsMaximalAndPositionCap(t *testing.T) {
	c, fc, creator := nSetup(t)
	v2Gate(t, fc)
	mid := nCreate(t, c, creator, 1, []string{"Yes", "No"})
	m := nMarket(t, fc, mid)
	for _, budget := range []uint64{3_000_000, 20_000_000, 40_000_000} {
		s := maxSharesForBudget(m, 0, budget)
		if s < PRECISION_SCALE {
			t.Fatalf("budget %d -> %d shares", budget, s)
		}
		if _, _, _, _, tot, e := quoteTotal(m, 0, s); e != nil || tot > budget {
			t.Fatalf("budget %d exceeded: total %d err %v", budget, tot, e)
		}
		if _, _, _, _, tot, e := quoteTotal(m, 0, s+1); e == nil && tot <= budget {
			t.Fatalf("budget %d not maximal at %d shares", budget, s)
		}
	}
	// position-cap preview agrees with the real handler decision
	big := m.Q[0] + 50_000_000_000
	q, pe := buildQuoteN("x", m, 0, big, &PositionState{Shares: make([]uint64, 2)})
	if pe == nil && q.PositionCapOK != nil && *q.PositionCapOK {
		t.Fatal("an enormous single-address buy must fail the cap preview")
	}
	if _, pe := buildQuoteN("x", m, 5, PRECISION_SCALE, nil); pe == nil {
		t.Fatal("out-of-range outcome must be rejected")
	}
	if _, pe := buildQuoteN("x", &MarketState{}, 0, PRECISION_SCALE, nil); pe == nil {
		t.Fatal("legacy binary must be rejected")
	}
}
