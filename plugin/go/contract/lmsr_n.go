package contract

import (
	"errors"
	"math/big"
)

// ═══════════════════════════════════════════════════════════════════════════════
// N-outcome LMSR — integer fixed-point engine (NEW markets only).
// Legacy binary markets keep using lmsr.go (float64) untouched.
//
// Units: q[i] and b are in the same micro-units as today (PRECISION_SCALE).
// One share unit pays exactly 1 micro-PRX when its option wins ("standard" mode).
//
//   C(q) = b * ln( Σ exp(q_i / b) )  =  m + b * ln( Σ exp((q_i - m)/b) ),  m = max q_i
//
// All arithmetic is math/big integers with FRAC_BITS fractional bits: no float64,
// no platform-dependent rounding, so every validator gets identical bytes.
//
// Solvency (standard mode): pool_0 = seed >= b*ln(N) = C(0).
// Each trade charges ceil(C(q') - C(q)), so pool_t >= C(q_t) >= max_i q_i,
// i.e. the pool always covers a 1-unit-per-share payout to any winning option.
// ═══════════════════════════════════════════════════════════════════════════════

const (
	MIN_OUTCOMES = 2
	MAX_OUTCOMES = 10
	fracBits     = 96
	expCutoff    = 70 // exp(-70) < 2^-96, treated as 0
)

var (
	fxOne  = new(big.Int).Lsh(big.NewInt(1), fracBits)
	fxLn2  = atanhSeries2(big.NewInt(1), big.NewInt(3)) // ln2 = 2*atanh(1/3)
	errLmN = errors.New("lmsr-n: invalid input")
)

// atanhSeries2 returns 2*atanh(num/den) in fixed point, |num/den| <= 1/3.
func atanhSeries2(num, den *big.Int) *big.Int {
	z := new(big.Int).Lsh(num, fracBits)
	z.Quo(z, den) // z in F
	z2 := new(big.Int).Mul(z, z)
	z2.Rsh(z2, fracBits)
	term := new(big.Int).Set(z)
	sum := new(big.Int)
	for k := int64(0); k < 80; k++ {
		sum.Add(sum, new(big.Int).Quo(term, big.NewInt(2*k+1)))
		term.Mul(term, z2)
		term.Rsh(term, fracBits)
		if term.Sign() == 0 {
			break
		}
	}
	return sum.Lsh(sum, 1)
}

// fxLn returns ln(y) for y >= 1 (fixed point).
func fxLn(y *big.Int) *big.Int {
	e := y.BitLen() - (fracBits + 1)
	m := new(big.Int).Set(y)
	if e > 0 {
		m.Rsh(m, uint(e))
	} else if e < 0 {
		m.Lsh(m, uint(-e))
	}
	num := new(big.Int).Sub(m, fxOne)
	den := new(big.Int).Add(m, fxOne)
	z := new(big.Int).Lsh(num, fracBits)
	z.Quo(z, den)
	z2 := new(big.Int).Mul(z, z)
	z2.Rsh(z2, fracBits)
	term := new(big.Int).Set(z)
	sum := new(big.Int)
	for k := int64(0); k < 100; k++ {
		sum.Add(sum, new(big.Int).Quo(term, big.NewInt(2*k+1)))
		term.Mul(term, z2)
		term.Rsh(term, fracBits)
		if term.Sign() == 0 {
			break
		}
	}
	sum.Lsh(sum, 1)
	res := new(big.Int).Mul(big.NewInt(int64(e)), fxLn2)
	return res.Add(res, sum)
}

// fxExpNeg returns exp(-t) for t >= 0 (fixed point in/out).
func fxExpNeg(t *big.Int) *big.Int {
	if t.Cmp(new(big.Int).Lsh(big.NewInt(expCutoff), fracBits)) >= 0 {
		return new(big.Int)
	}
	k, r := new(big.Int).QuoRem(t, fxLn2, new(big.Int)) // t = k*ln2 + r, 0<=r<ln2
	// exp(-r) = Σ (-r)^n / n!
	sum := new(big.Int).Set(fxOne)
	term := new(big.Int).Set(fxOne)
	for n := int64(1); n < 60; n++ {
		term.Mul(term, r)
		term.Rsh(term, fracBits)
		term.Quo(term, big.NewInt(n))
		if term.Sign() == 0 {
			break
		}
		if n%2 == 1 {
			sum.Sub(sum, term)
		} else {
			sum.Add(sum, term)
		}
	}
	return sum.Rsh(sum, uint(k.Uint64()))
}

// costFx returns C(q) in fixed point (micro-units << fracBits).
func costFx(q []uint64, b uint64) *big.Int {
	var m uint64
	for _, v := range q {
		if v > m {
			m = v
		}
	}
	bb := new(big.Int).SetUint64(b)
	sum := new(big.Int)
	for _, v := range q {
		t := new(big.Int).SetUint64(m - v)
		t.Lsh(t, fracBits)
		t.Quo(t, bb)
		sum.Add(sum, fxExpNeg(t))
	}
	c := new(big.Int).Mul(bb, fxLn(sum))
	return c.Add(c, new(big.Int).Lsh(new(big.Int).SetUint64(m), fracBits))
}

func validN(q []uint64, b uint64) bool {
	return b > 0 && len(q) >= MIN_OUTCOMES && len(q) <= MAX_OUTCOMES
}

// SeedBForN returns the LMSR liquidity parameter b such that b*ln(N) <= seed.
// The pool is funded with `seed`, so the maker's worst-case loss is covered.
func SeedBForN(seed uint64, n int) (uint64, error) {
	if n < MIN_OUTCOMES || n > MAX_OUTCOMES || seed == 0 {
		return 0, errLmN
	}
	lnN := fxLn(new(big.Int).Mul(big.NewInt(int64(n)), fxOne))
	b := new(big.Int).Lsh(new(big.Int).SetUint64(seed), fracBits)
	b.Quo(b, lnN)
	if b.Sign() == 0 {
		return 0, errLmN
	}
	b.Sub(b, big.NewInt(1)) // keep b*ln(N) strictly <= seed despite rounding
	if b.Sign() <= 0 {
		return 0, errLmN
	}
	return b.Uint64(), nil
}

// BaseCostN returns ceil(C(q)) — the pool a market in state q needs to be solvent.
func BaseCostN(q []uint64, b uint64) (uint64, error) {
	if !validN(q, b) {
		return 0, errLmN
	}
	c := costFx(q, b)
	c.Add(c, new(big.Int).Sub(fxOne, big.NewInt(1)))
	return c.Rsh(c, fracBits).Uint64(), nil
}

// TradeCostN returns ceil(C(q + shares on idx) - C(q)). Rounded UP so the maker
// never undercharges and a non-zero trade always costs >= 1 unit (no free shares).
func TradeCostN(q []uint64, b uint64, idx int, shares uint64) (uint64, error) {
	if !validN(q, b) || idx < 0 || idx >= len(q) || shares == 0 {
		return 0, errLmN
	}
	if q[idx] > ^uint64(0)-shares {
		return 0, errLmN
	}
	q2 := make([]uint64, len(q))
	copy(q2, q)
	q2[idx] += shares
	d := new(big.Int).Sub(costFx(q2, b), costFx(q, b))
	if d.Sign() < 0 {
		return 0, errLmN
	}
	d.Add(d, new(big.Int).Sub(fxOne, big.NewInt(1)))
	d.Rsh(d, fracBits)
	if d.Sign() == 0 {
		d.SetInt64(1)
	}
	if !d.IsUint64() {
		return 0, errLmN
	}
	return d.Uint64(), nil
}

// PricesN returns each option's price in PRECISION_SCALE units (1_000_000 = 100%),
// floored; their sum is within N units of 1_000_000.
func PricesN(q []uint64, b uint64) ([]uint64, error) {
	if !validN(q, b) {
		return nil, errLmN
	}
	var m uint64
	for _, v := range q {
		if v > m {
			m = v
		}
	}
	bb := new(big.Int).SetUint64(b)
	exps := make([]*big.Int, len(q))
	sum := new(big.Int)
	for i, v := range q {
		t := new(big.Int).SetUint64(m - v)
		t.Lsh(t, fracBits)
		t.Quo(t, bb)
		exps[i] = fxExpNeg(t)
		sum.Add(sum, exps[i])
	}
	out := make([]uint64, len(q))
	for i := range q {
		p := new(big.Int).Mul(exps[i], big.NewInt(1_000_000))
		p.Quo(p, sum)
		out[i] = p.Uint64()
	}
	return out, nil
}
