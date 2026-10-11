package contract

import (
	"math"
	"math/big"
	"math/rand"
	"testing"
)

var v2Alphas = []uint64{0, 2_500, 10_000, 30_000}

func maxOf(q []uint64) uint64 {
	var m uint64
	for _, v := range q {
		if v > m {
			m = v
		}
	}
	return m
}

func parseBF(t *testing.T, s string) *big.Float {
	f, _, err := big.ParseFloat(s, 10, 200, big.ToNearestEven)
	if err != nil {
		t.Fatal(err)
	}
	return f
}

// Engine vs 80-digit mpmath: charged cost must be ceil(true) or ceil(true)+1 (margin),
// never below; price floor within 1 unit; Σprice within N+1 units of truth.
func TestV2GoldenAgainstMpmath(t *testing.T) {
	for i, g := range v2GoldenVectors {
		e := EngineV2{B0: g.B0, AlphaPPM: g.A}
		got, err := TradeCostV2(g.Q, e, g.Idx, g.S)
		if err == errV2TooDear {
			// only legal if the true cost really exceeds the payout
			if parseBF(t, g.Delta).Cmp(new(big.Float).SetUint64(g.S)) <= 0 {
				t.Fatalf("#%d rejected though true cost <= shares", i)
			}
			continue
		}
		if err != nil {
			t.Fatalf("#%d err %v", i, err)
		}
		tr := parseBF(t, g.Delta)
		fl, _ := tr.Int(nil)
		ceil := new(big.Int).Set(fl)
		if tr.Cmp(new(big.Float).SetInt(fl)) > 0 {
			ceil.Add(ceil, big.NewInt(1))
		}
		if ceil.Sign() == 0 {
			ceil.SetInt64(1)
		}
		gb := new(big.Int).SetUint64(got)
		if gb.Cmp(ceil) < 0 || gb.Cmp(new(big.Int).Add(ceil, big.NewInt(1))) > 0 {
			t.Fatalf("#%d n=%d a=%d got=%d true=%s ceil=%s", i, len(g.Q), g.A, got, g.Delta, ceil)
		}
		p, _ := PricesV2(g.Q, e)
		if d := int64(p[g.Idx]) - int64(g.P0); d < -1 || d > 1 {
			t.Fatalf("#%d price got=%d want=%d", i, p[g.Idx], g.P0)
		}
		var sum uint64
		for _, v := range p {
			sum += v
		}
		want, _ := parseBF(t, g.Psum).Float64()
		if math.Abs(float64(sum)-want) > float64(len(g.Q))+1 {
			t.Fatalf("#%d price sum got=%d want=%.3f", i, sum, want)
		}
	}
}

// alpha=0 must reproduce the audited lmsr_n.go engine (within the 1-unit margin).
func TestV2AlphaZeroMatchesTradeCostN(t *testing.T) {
	r := rand.New(rand.NewSource(11))
	for i := 0; i < 1500; i++ {
		n := 2 + r.Intn(9)
		b := uint64(60_000_000 + r.Int63n(2_000_000_000))
		q := make([]uint64, n)
		for j := range q {
			q[j] = uint64(r.Int63n(int64(3 * b)))
		}
		s := uint64(1_000_000 + r.Int63n(int64(b)))
		idx := r.Intn(n)
		a, e1 := TradeCostN(q, b, idx, s)
		c, e2 := TradeCostV2(q, EngineV2{B0: b}, idx, s)
		if e1 != nil || e2 != nil {
			t.Fatalf("errs %v %v", e1, e2)
		}
		if c < a || c > a+1 {
			t.Fatalf("i=%d v1=%d v2=%d", i, a, c)
		}
	}
}

// T2: Σp_i = 1 + N·α·H(π) <= 1 + N·α·ln N; every price > 0; order preserved.
func TestV2PricesTheorem(t *testing.T) {
	r := rand.New(rand.NewSource(12))
	for _, a := range v2Alphas {
		for n := 2; n <= 10; n++ {
			for k := 0; k < 120; k++ {
				b := uint64(60_000_000 + r.Int63n(1_000_000_000))
				q := make([]uint64, n)
				for i := range q {
					q[i] = uint64(r.Int63n(int64(4 * b)))
				}
				e := EngineV2{B0: b, AlphaPPM: a}
				p, err := PricesV2(q, e)
				if err != nil {
					t.Fatal(err)
				}
				var s float64
				for i := range p {
					s += float64(p[i])
					for j := range p {
						if q[i] > q[j] && p[i] < p[j] {
							t.Fatal("order violated")
						}
					}
				}
				hi := 1e6 * (1 + float64(a)/1e6*float64(n)*math.Log(float64(n)))
				if s > hi+float64(n) || s < 1e6-float64(n) {
					t.Fatalf("a=%d n=%d sum=%.0f hi=%.0f", a, n, s, hi)
				}
			}
		}
	}
}

// T3+T4: random buys AND sells; invariant pool >= C(q) >= max q; loss <= seed.
func TestV2SolvencyAndMaxLoss(t *testing.T) {
	r := rand.New(rand.NewSource(13))
	for _, a := range v2Alphas {
		for n := 2; n <= 10; n++ {
			for run := 0; run < 6; run++ {
				seed := uint64(30_000_000 + r.Int63n(3_000_000_000))
				b0, err := SeedForV2(seed, n)
				if err != nil {
					t.Fatal(err)
				}
				e := EngineV2{B0: b0, AlphaPPM: a}
				q := make([]uint64, n)
				pool := seed
				for step := 0; step < 150; step++ {
					idx := r.Intn(n)
					if r.Intn(4) == 0 && q[idx] >= 1_000_000 {
						s := 1_000_000 + uint64(r.Int63n(int64(q[idx]-1_000_000)+1))
						ref, err := RefundV2(q, e, idx, s)
						if err != nil {
							t.Fatal(err)
						}
						pool -= ref
						q[idx] -= s
					} else {
						s := uint64(1_000_000 + r.Int63n(int64(3*b0)))
						c, err := TradeCostV2(q, e, idx, s)
						if err == errV2TooDear {
							continue
						}
						if err != nil {
							t.Fatal(err)
						}
						pool += c
						q[idx] += s
					}
					ev := evaluateV2(q, e)
					poolF := new(big.Int).Lsh(new(big.Int).SetUint64(pool), fracBits)
					if poolF.Cmp(ev.cost) < 0 {
						t.Fatalf("pool < C(q): a=%d n=%d step=%d", a, n, step)
					}
					if pool < maxOf(q) {
						t.Fatalf("INSOLVENT a=%d n=%d step=%d pool=%d maxq=%d", a, n, step, pool, maxOf(q))
					}
				}
				// settle on every option: creator loss never exceeds the seed
				for w := 0; w < n; w++ {
					if q[w] > pool {
						t.Fatal("winner payout > pool")
					}
					loss := int64(q[w]) - int64(pool-seed)
					if loss > int64(seed) {
						t.Fatalf("creator loss %d > seed %d", loss, seed)
					}
				}
			}
		}
	}
}

// T5: buy then sell the same shares never returns more than was paid.
func TestV2RoundTripNeverProfits(t *testing.T) {
	r := rand.New(rand.NewSource(14))
	for i := 0; i < 2500; i++ {
		n := 2 + r.Intn(9)
		a := v2Alphas[r.Intn(len(v2Alphas))]
		b := uint64(60_000_000 + r.Int63n(3_000_000_000))
		e := EngineV2{B0: b, AlphaPPM: a}
		q := make([]uint64, n)
		for j := range q {
			q[j] = uint64(r.Int63n(int64(2 * b)))
		}
		idx := r.Intn(n)
		s := uint64(1_000_000 + r.Int63n(int64(b)))
		c, err := TradeCostV2(q, e, idx, s)
		if err != nil {
			continue
		}
		q[idx] += s
		back, err := RefundV2(q, e, idx, s)
		if err != nil || back > c {
			t.Fatalf("i=%d paid=%d back=%d err=%v", i, c, back, err)
		}
	}
}

// T1: splitting a trade into pieces costs the same total (±1 unit per piece).
func TestV2PathIndependence(t *testing.T) {
	r := rand.New(rand.NewSource(15))
	for i := 0; i < 400; i++ {
		n := 2 + r.Intn(9)
		a := v2Alphas[r.Intn(len(v2Alphas))]
		b := uint64(100_000_000 + r.Int63n(2_000_000_000))
		e := EngineV2{B0: b, AlphaPPM: a}
		q := make([]uint64, n)
		idx := r.Intn(n)
		total := uint64(5_000_000 + r.Int63n(int64(2*b)))
		one, err := TradeCostV2(q, e, idx, total)
		if err != nil {
			continue
		}
		parts := 2 + r.Intn(5)
		var sum, done uint64
		ok := true
		for p := 0; p < parts; p++ {
			s := total / uint64(parts)
			if p == parts-1 {
				s = total - done
			}
			c, err := TradeCostV2(q, e, idx, s)
			if err != nil {
				ok = false
				break
			}
			sum += c
			q[idx] += s
			done += s
		}
		if ok && (sum+uint64(parts) < one || one+uint64(parts) < sum) {
			t.Fatalf("i=%d one=%d split=%d", i, one, sum)
		}
	}
}

// T6 + fairness: a buy never costs more than its payout; a complete set (one share of
// every outcome) never costs less than the 1 unit/share it redeems for.
func TestV2BettorSafetyAndNoSetArbitrage(t *testing.T) {
	r := rand.New(rand.NewSource(16))
	for i := 0; i < 1500; i++ {
		n := 2 + r.Intn(9)
		a := v2Alphas[r.Intn(len(v2Alphas))]
		b := uint64(60_000_000 + r.Int63n(2_000_000_000))
		e := EngineV2{B0: b, AlphaPPM: a}
		q := make([]uint64, n)
		for j := range q {
			q[j] = uint64(r.Int63n(int64(6 * b)))
		}
		s := uint64(1_000_000 + r.Int63n(int64(b)))
		var total uint64
		valid := true
		for j := 0; j < n; j++ {
			c, err := TradeCostV2(q, e, j, s)
			if err != nil {
				valid = false // rejected as >payout: also fine
				break
			}
			if c > s {
				t.Fatalf("cost %d > shares %d", c, s)
			}
			total += c
			q[j] += s
		}
		if valid && total+uint64(n) < s {
			t.Fatalf("complete set cheaper than payout: a=%d n=%d total=%d s=%d", a, n, total, s)
		}
	}
}

// ADLMSR purpose: after volume, the same trade moves the price less than fixed-b.
func TestADLMSRDeeperAfterVolume(t *testing.T) {
	seed := uint64(1_000_000_000) // 1,000 PRX
	b0, _ := SeedForV2(seed, 2)
	fixed := EngineV2{B0: b0}
	adapt := EngineV2{B0: b0, AlphaPPM: DEFAULT_ALPHA_PPM}
	q := []uint64{0, 0}
	// push 50,000 PRX of one-sided + balanced flow
	q[0], q[1] = 30_000_000_000, 20_000_000_000
	pf, _ := ProbsV2(q, fixed)
	pa, _ := ProbsV2(q, adapt)
	if pa[0] >= pf[0] {
		t.Fatalf("adaptive should be less extreme: fixed=%d adaptive=%d", pf[0], pa[0])
	}
	cf, _ := TradeCostV2(q, fixed, 0, 100_000_000)
	ca, _ := TradeCostV2(q, adapt, 0, 100_000_000)
	t.Logf("100 PRX of shares at 50k PRX volume: fixed cost=%d adaptive cost=%d (units)", cf, ca)
	t.Logf("probs fixed=%v adaptive=%v", pf, pa)
}

func TestV2RejectsBadInput(t *testing.T) {
	good := EngineV2{B0: 100_000_000}
	if _, err := TradeCostV2([]uint64{0}, good, 0, 1); err == nil {
		t.Fatal("n=1")
	}
	if _, err := TradeCostV2(make([]uint64, 11), good, 0, 1); err == nil {
		t.Fatal("n=11")
	}
	if _, err := TradeCostV2([]uint64{0, 0}, EngineV2{}, 0, 1); err == nil {
		t.Fatal("b0=0")
	}
	if _, err := TradeCostV2([]uint64{0, 0}, EngineV2{B0: 1, AlphaPPM: MAX_ALPHA_PPM + 1}, 0, 1); err == nil {
		t.Fatal("alpha too big")
	}
	if _, err := TradeCostV2([]uint64{^uint64(0), 0}, good, 0, 1); err == nil {
		t.Fatal("overflow")
	}
	if _, err := RefundV2([]uint64{5, 0}, good, 0, 6); err == nil {
		t.Fatal("oversell")
	}
}

func TestV2SharesForBudgetAndResidualSplit(t *testing.T) {
	e := EngineV2{B0: 500_000_000, AlphaPPM: DEFAULT_ALPHA_PPM}
	q := []uint64{100_000_000, 40_000_000, 0}
	for _, budget := range []uint64{1_000_000, 25_000_000, 400_000_000} {
		s, err := SharesForBudgetV2(q, e, 1, budget)
		if err != nil || s == 0 {
			t.Fatalf("budget %d: %v %d", budget, err, s)
		}
		c, err := TradeCostV2(q, e, 1, s)
		if err != nil || c > budget {
			t.Fatalf("budget %d got cost %d err %v", budget, c, err)
		}
		if c2, err := TradeCostV2(q, e, 1, s+1); err == nil && c2 <= budget {
			t.Fatalf("not maximal for budget %d", budget)
		}
	}
	for _, res := range []uint64{0, 1, 7, 999_999_999, ^uint64(0) / 3} {
		for _, seed := range []uint64{0, 5, 1_000_000, ^uint64(0) / 2} {
			c, rr, tr := SettleResidualV2(res, seed, 5000, 2000)
			if c+rr+tr != res {
				t.Fatalf("not conserved res=%d seed=%d", res, seed)
			}
			if res <= seed && (rr != 0 || tr != 0 || c != res) {
				t.Fatalf("loss/flat market must return everything to creator")
			}
		}
	}
	c, rr, tr := SettleResidualV2(1_500, 1_000, 5000, 2000)
	if c != 1_250 || rr != 100 || tr != 150 {
		t.Fatalf("profit split wrong %d %d %d", c, rr, tr)
	}
}

func BenchmarkTradeCostV2N10(b *testing.B) {
	e := EngineV2{B0: 1_000_000_000, AlphaPPM: DEFAULT_ALPHA_PPM}
	q := []uint64{5e9, 1e9, 3e9, 0, 7e8, 2e9, 4e9, 9e8, 6e9, 1e8}
	for i := 0; i < b.N; i++ {
		if _, err := TradeCostV2(q, e, 3, 10_000_000); err != nil {
			b.Fatal(err)
		}
	}
}

func TestAlphaForFriction(t *testing.T) {
	for n := 2; n <= 10; n++ {
		a, err := AlphaForFrictionV2(n, DEFAULT_FRICTION_PPM)
		if err != nil {
			t.Fatal(err)
		}
		if f := float64(a) / 1e6 * math.Log(float64(n)); f > 0.01 || f < 0.00999 {
			t.Fatalf("n=%d alpha=%d friction=%.6f", n, a, f)
		}
	}
}
