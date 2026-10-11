package contract

import (
	"errors"
	"math/big"
)

// ═══════════════════════════════════════════════════════════════════════════════
// LMSR v2 / ADLMSR v2 — one integer-only engine, N >= 2 outcomes (binary = N=2).
//
//   b(q) = b0 + alpha * S,   S = Σ q_i                (depth grows with volume)
//   C(q) = b(q) * ln( Σ exp(q_i / b(q)) )
//
//   alpha = 0  → "LMSR v2"   : classic fixed-b LMSR (exact same C as lmsr_n.go)
//   alpha > 0  → "ADLMSR v2" : adaptive-depth LMSR (liquidity-sensitive)
//
// Units: q_i, b0 in micro-units (PRECISION_SCALE). One winning share pays exactly 1
// micro-PRX. alpha is in parts-per-million (AlphaPPM / 1_000_000).
//
// Theorems (all machine-checked in lmsr_v2_test.go):
//  T1 path independence : C is a function of q only, so trade order never matters.
//  T2 prices            : p_i = dC/dq_i = π_i + α·H(π) > 0, π = softmax(q/b),
//                         H = Shannon entropy. Each share costs at most α·ln N above
//                         its probability; the overround is Σp_i = 1 + N·α·H(π).
//  T3 solvency          : C(q) >= max_i q_i for every b>0 (log-sum-exp >= max), and
//                         every buy is charged >= C(q')-C(q). So pool_t >= C(q_t) >=
//                         max q_i whenever the seed >= C(0) = b0·ln N. Independent of alpha.
//  T4 creator max loss  : <= C(0) = b0·ln N = the seed (same as fixed-b LMSR).
//  T5 no free lunch     : buy rounds UP, refund rounds DOWN, both with a one-sided
//                         numeric-error margin, so buy->sell never profits and the
//                         pool never loses a unit to rounding.
//  T6 bettor safety     : a buy is rejected if cost > shares (guaranteed loss).
//
// All arithmetic is math/big fixed point (fracBits fractional bits) — no float64,
// byte-identical on every validator. Reuses fxLn / fxExpNeg from lmsr_n.go.
// ═══════════════════════════════════════════════════════════════════════════════

const (
	ALPHA_DEN_PPM     uint64 = 1_000_000
	MAX_ALPHA_PPM     uint64 = 30_000 // hard cap 3.00%
	DEFAULT_ALPHA_PPM uint64 = 10_000 // 1.00%
	// Default per-share friction target: alpha is chosen so that the extra price a
	// bettor pays above the probability never exceeds 1% of a share's payout.
	DEFAULT_FRICTION_PPM uint64 = 10_000
)

var (
	errV2        = errors.New("lmsr-v2: invalid input")
	errV2TooDear = errors.New("lmsr-v2: cost exceeds payout")
)

// EngineV2 are the immutable per-market parameters (stored at creation).
type EngineV2 struct {
	B0       uint64 // base depth in micro-units (from SeedBForN)
	AlphaPPM uint64 // 0 = fixed-b LMSR v2
}

func (e EngineV2) validFor(q []uint64) bool {
	return e.B0 > 0 && e.AlphaPPM <= MAX_ALPHA_PPM && len(q) >= MIN_OUTCOMES && len(q) <= MAX_OUTCOMES
}

type evalV2 struct {
	bF   *big.Int   // b(q) << fracBits
	m    uint64     // max q_i
	t    []*big.Int // (m - q_i)/b   (fixed point)
	ex   []*big.Int // exp(-t_i)
	sum  *big.Int   // Σ ex
	lnZ  *big.Int   // ln(sum)
	cost *big.Int   // C(q) << fracBits
}

func depthFxV2(q []uint64, e EngineV2) *big.Int {
	bF := new(big.Int).Lsh(new(big.Int).SetUint64(e.B0), fracBits)
	if e.AlphaPPM == 0 {
		return bF
	}
	s := new(big.Int)
	for _, v := range q {
		s.Add(s, new(big.Int).SetUint64(v))
	}
	s.Mul(s, new(big.Int).SetUint64(e.AlphaPPM))
	s.Lsh(s, fracBits)
	s.Quo(s, new(big.Int).SetUint64(ALPHA_DEN_PPM))
	return bF.Add(bF, s)
}

func evaluateV2(q []uint64, e EngineV2) *evalV2 {
	var m uint64
	for _, v := range q {
		if v > m {
			m = v
		}
	}
	r := &evalV2{bF: depthFxV2(q, e), m: m, sum: new(big.Int)}
	r.t = make([]*big.Int, len(q))
	r.ex = make([]*big.Int, len(q))
	for i, v := range q {
		t := new(big.Int).SetUint64(m - v)
		t.Lsh(t, 2*fracBits)
		t.Quo(t, r.bF)
		r.t[i] = t
		r.ex[i] = fxExpNeg(t)
		r.sum.Add(r.sum, r.ex[i])
	}
	r.lnZ = fxLn(r.sum) // sum >= 1 because the max term is exp(0)
	c := new(big.Int).Mul(r.bF, r.lnZ)
	c.Rsh(c, fracBits)
	c.Add(c, new(big.Int).Lsh(new(big.Int).SetUint64(m), fracBits))
	r.cost = c
	return r
}

// marginF is a one-sided bound (>> any accumulated truncation error) on the numeric
// error of one evaluateV2: b * 2^-60 value units, expressed in fixed point.
func marginF(bF *big.Int) *big.Int {
	m := new(big.Int).Rsh(bF, 60)
	return m.Add(m, big.NewInt(1))
}

// BaseCostV2 returns ceil(C(0)) = ceil(b0·ln N): the minimum seed a market needs.
// Independent of alpha because b(0) = b0.
func BaseCostV2(n int, b0 uint64) (uint64, error) {
	return BaseCostN(make([]uint64, n), b0)
}

// AlphaForFrictionV2 returns the largest alpha (ppm) such that the worst-case extra
// price per share alpha·ln N <= frictionPPM/1e6 (floored, capped at MAX_ALPHA_PPM).
// Use it at create_market so deep N-outcome markets get a smaller alpha than binary.
func AlphaForFrictionV2(n int, frictionPPM uint64) (uint64, error) {
	if n < MIN_OUTCOMES || n > MAX_OUTCOMES || frictionPPM == 0 {
		return 0, errV2
	}
	lnN := fxLn(new(big.Int).Mul(big.NewInt(int64(n)), fxOne))
	a := new(big.Int).Lsh(new(big.Int).SetUint64(frictionPPM), fracBits)
	a.Quo(a, lnN)
	if !a.IsUint64() || a.Uint64() > MAX_ALPHA_PPM {
		return MAX_ALPHA_PPM, nil
	}
	return a.Uint64(), nil
}

// SeedForV2 returns b0 with b0·ln N <= seed (identical to SeedBForN).
func SeedForV2(seed uint64, n int) (uint64, error) { return SeedBForN(seed, n) }

// TradeCostV2 returns the cost of buying `shares` of outcome idx.
// Charged amount >= true (C(q')-C(q)); minimum 1; rejected if > shares (T6).
func TradeCostV2(q []uint64, e EngineV2, idx int, shares uint64) (uint64, error) {
	if !e.validFor(q) || idx < 0 || idx >= len(q) || shares == 0 {
		return 0, errV2
	}
	if q[idx] > ^uint64(0)-shares {
		return 0, errV2
	}
	q2 := make([]uint64, len(q))
	copy(q2, q)
	q2[idx] += shares
	a, b := evaluateV2(q, e), evaluateV2(q2, e)
	d := new(big.Int).Sub(b.cost, a.cost)
	d.Add(d, marginF(a.bF))
	d.Add(d, marginF(b.bF))
	if d.Sign() < 0 {
		d.SetInt64(0)
	}
	d.Add(d, new(big.Int).Sub(fxOne, big.NewInt(1)))
	d.Rsh(d, fracBits)
	if d.Sign() == 0 {
		d.SetInt64(1)
	}
	if !d.IsUint64() {
		return 0, errV2
	}
	if d.Uint64() > shares {
		return 0, errV2TooDear
	}
	return d.Uint64(), nil
}

// RefundV2 returns what selling `shares` of outcome idx back to the curve pays:
// floor(C(q)-C(q')) minus the error margin. Never exceeds the true value (T5).
func RefundV2(q []uint64, e EngineV2, idx int, shares uint64) (uint64, error) {
	if !e.validFor(q) || idx < 0 || idx >= len(q) || shares == 0 || q[idx] < shares {
		return 0, errV2
	}
	q2 := make([]uint64, len(q))
	copy(q2, q)
	q2[idx] -= shares
	a, b := evaluateV2(q, e), evaluateV2(q2, e)
	d := new(big.Int).Sub(a.cost, b.cost)
	d.Sub(d, marginF(a.bF))
	d.Sub(d, marginF(b.bF))
	if d.Sign() <= 0 {
		return 0, nil
	}
	d.Rsh(d, fracBits)
	if !d.IsUint64() {
		return 0, errV2
	}
	return d.Uint64(), nil
}

// ProbsV2 returns π_i = softmax(q/b) in PRECISION_SCALE units (1_000_000 = 100%),
// floored. This is the "probability" to display; Σ is within N units of 1_000_000.
func ProbsV2(q []uint64, e EngineV2) ([]uint64, error) {
	if !e.validFor(q) {
		return nil, errV2
	}
	r := evaluateV2(q, e)
	out := make([]uint64, len(q))
	for i := range q {
		p := new(big.Int).Mul(r.ex[i], new(big.Int).SetUint64(PRECISION_SCALE))
		p.Quo(p, r.sum)
		out[i] = p.Uint64()
	}
	return out, nil
}

// PricesV2 returns the instantaneous marginal price p_i = π_i + α·H(π) of one more
// share of each outcome, in PRECISION_SCALE units, floored (T2). For alpha = 0 it
// equals ProbsV2.
func PricesV2(q []uint64, e EngineV2) ([]uint64, error) {
	if !e.validFor(q) {
		return nil, errV2
	}
	r := evaluateV2(q, e)
	// H = Σ π_j (t_j + lnZ)   because  ln π_j = -(t_j + lnZ)
	h := new(big.Int)
	pis := make([]*big.Int, len(q))
	for j := range q {
		pi := new(big.Int).Lsh(r.ex[j], fracBits)
		pi.Quo(pi, r.sum)
		pis[j] = pi
		w := new(big.Int).Add(r.t[j], r.lnZ)
		w.Mul(w, pi)
		w.Rsh(w, fracBits)
		h.Add(h, w)
	}
	h.Mul(h, new(big.Int).SetUint64(e.AlphaPPM))
	h.Quo(h, new(big.Int).SetUint64(ALPHA_DEN_PPM))
	out := make([]uint64, len(q))
	for i := range q {
		p := new(big.Int).Add(pis[i], h)
		p.Mul(p, new(big.Int).SetUint64(PRECISION_SCALE))
		p.Rsh(p, fracBits)
		out[i] = p.Uint64()
	}
	return out, nil
}

// SharesForBudgetV2 (OFF-CHAIN helper for quotes) returns the largest share count
// whose TradeCostV2 is <= budget. Cost is strictly increasing in shares, so a
// bracket + bisection is exact.
func SharesForBudgetV2(q []uint64, e EngineV2, idx int, budget uint64) (uint64, error) {
	if !e.validFor(q) || idx < 0 || idx >= len(q) || budget == 0 {
		return 0, errV2
	}
	limit := ^uint64(0) - q[idx]
	if limit > 1<<62 {
		limit = 1 << 62
	}
	ok := func(s uint64) bool {
		c, err := TradeCostV2(q, e, idx, s)
		return err == nil && c <= budget
	}
	lo, hi := uint64(0), budget
	if hi > limit {
		hi = limit
	}
	for hi < limit && ok(hi) {
		lo = hi
		if hi > limit/2 {
			hi = limit
		} else {
			hi *= 2
		}
	}
	for lo < hi {
		mid := lo + (hi-lo+1)/2
		if ok(mid) {
			lo = mid
		} else {
			hi = mid - 1
		}
	}
	return lo, nil
}

// SettleResidualV2 divides the market's post-payout residual. The creator's seed is
// returned FIRST (capped by the residual); only profit above the seed is split
// creator / resolver / treasury. Conservation is exact: creator+resolver+treasury ==
// residual. The treasury takes the rounding remainder.
func SettleResidualV2(residual, seed, creatorBps, resolverBps uint64) (creator, resolver, treasury uint64) {
	if creatorBps+resolverBps > 10_000 {
		return 0, 0, residual
	}
	back := seed
	if back > residual {
		back = residual
	}
	profit := residual - back
	c := mulDiv(profit, creatorBps, 10_000)
	resolver = mulDiv(profit, resolverBps, 10_000)
	treasury = profit - c - resolver
	creator = back + c
	return
}
