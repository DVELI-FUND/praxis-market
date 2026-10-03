package contract

import (
	"math"
	"math/rand"
	"testing"
)

// float64 reference (test only)
func refCost(q []uint64, b uint64) float64 {
	m := 0.0
	for _, v := range q {
		m = math.Max(m, float64(v))
	}
	s := 0.0
	for _, v := range q {
		s += math.Exp((float64(v) - m) / float64(b))
	}
	return m + float64(b)*math.Log(s)
}

func TestBinaryMatchesReference(t *testing.T) {
	r := rand.New(rand.NewSource(1))
	for i := 0; i < 3000; i++ {
		b := uint64(60_000_000 + r.Int63n(5_000_000_000))
		q := []uint64{uint64(r.Int63n(int64(3 * b))), uint64(r.Int63n(int64(3 * b)))}
		sh := uint64(1_000_000 + r.Int63n(int64(b)))
		idx := r.Intn(2)
		got, err := TradeCostN(q, b, idx, sh)
		if err != nil {
			t.Fatal(err)
		}
		q2 := []uint64{q[0], q[1]}
		q2[idx] += sh
		want := refCost(q2, b) - refCost(q, b)
		if math.Abs(float64(got)-want) > 3 { // float64 ref itself has ~1e-16 relative noise
			t.Fatalf("i=%d got=%d want=%.4f", i, got, want)
		}
	}
}

func TestPricesSumAndOrder(t *testing.T) {
	r := rand.New(rand.NewSource(2))
	for n := 2; n <= 10; n++ {
		for k := 0; k < 300; k++ {
			b := uint64(60_000_000 + r.Int63n(1_000_000_000))
			q := make([]uint64, n)
			for i := range q {
				q[i] = uint64(r.Int63n(int64(4 * b)))
			}
			p, err := PricesN(q, b)
			if err != nil {
				t.Fatal(err)
			}
			var s uint64
			for i := range p {
				s += p[i]
				for j := range p {
					if q[i] > q[j] && p[i] < p[j] {
						t.Fatalf("price order violated")
					}
				}
			}
			if s > 1_000_000 || s+uint64(n) < 1_000_000 {
				t.Fatalf("n=%d sum=%d", n, s)
			}
		}
	}
}

func TestUniformStartIsEqualPrices(t *testing.T) {
	for n := 2; n <= 10; n++ {
		q := make([]uint64, n)
		p, _ := PricesN(q, 100_000_000)
		for i := range p {
			if p[i] != p[0] {
				t.Fatalf("unequal")
			}
		}
		if d := int64(p[0]) - int64(1_000_000/n); d < -1 || d > 1 {
			t.Fatalf("n=%d p=%d", n, p[0])
		}
	}
}

func TestSeedCoversWorstCase(t *testing.T) {
	for n := 2; n <= 10; n++ {
		seed := uint64(60_000_000 - 50_000_000 + 1_000_000_000) // arbitrary
		b, err := SeedBForN(seed, n)
		if err != nil {
			t.Fatal(err)
		}
		base, _ := BaseCostN(make([]uint64, n), b)
		if base > seed {
			t.Fatalf("n=%d base %d > seed %d", n, base, seed)
		}
		if seed-base > 3 {
			t.Fatalf("n=%d seed wasted: %d", n, seed-base)
		}
		if n == 10 {
			t.Logf("n=10 b=%d for seed=%d (b/seed=%.4f, 1/ln10=%.4f)", b, seed, float64(b)/float64(seed), 1/math.Log(10))
		}
	}
}

// Core solvency property: after any sequence of trades, pool >= max q_i.
func TestPoolAlwaysCoversMaxPayout(t *testing.T) {
	r := rand.New(rand.NewSource(3))
	for n := 2; n <= 10; n++ {
		for run := 0; run < 15; run++ {
			seed := uint64(10_000_000 + r.Int63n(2_000_000_000))
			b, _ := SeedBForN(seed, n)
			q := make([]uint64, n)
			pool := seed
			for step := 0; step < 120; step++ {
				idx := r.Intn(n)
				var sh uint64
				switch r.Intn(3) {
				case 0:
					sh = 1_000_000
				case 1:
					sh = uint64(1_000_000 + r.Int63n(int64(b)/4+1))
				default:
					sh = uint64(1_000_000 + r.Int63n(int64(3*b)))
				}
				c, err := TradeCostN(q, b, idx, sh)
				if err != nil {
					t.Fatal(err)
				}
				pool += c
				q[idx] += sh
				var mx uint64
				for _, v := range q {
					if v > mx {
						mx = v
					}
				}
				if pool < mx {
					t.Fatalf("INSOLVENT n=%d step=%d pool=%d maxq=%d", n, step, pool, mx)
				}
			}
		}
	}
}

func TestNoFreeSharesAndMonotonic(t *testing.T) {
	b := uint64(500_000_000)
	q := []uint64{0, 0, 60 * b} // one option extremely lopsided
	c, err := TradeCostN(q, b, 2, 1_000_000)
	if err != nil || c < 1 {
		t.Fatalf("free share: c=%d err=%v", c, err)
	}
	// cost increases with size
	var last uint64
	for _, sh := range []uint64{1_000_000, 2_000_000, 10_000_000, 100_000_000} {
		c, _ := TradeCostN([]uint64{0, 0, 0}, b, 1, sh)
		if c <= last {
			t.Fatalf("not monotonic")
		}
		last = c
	}
	// buying all-in on one option never costs more than 1 per share
	c2, _ := TradeCostN([]uint64{0, 0, 0}, b, 0, 5*b)
	if c2 > 5*b {
		t.Fatalf("cost > payout")
	}
}

func TestRejectsBadInput(t *testing.T) {
	if _, err := TradeCostN([]uint64{0}, 1, 0, 1); err == nil {
		t.Fatal("n=1 accepted")
	}
	if _, err := TradeCostN(make([]uint64, 11), 1, 0, 1); err == nil {
		t.Fatal("n=11 accepted")
	}
	if _, err := TradeCostN([]uint64{0, 0}, 0, 0, 1); err == nil {
		t.Fatal("b=0 accepted")
	}
}
