package contract

import (
	"math/rand"
	"testing"
)

// End-to-end solvency fuzz: random trades on N-option markets (through the real submit
// handler), then finalize on a random winner and claim every position. Invariants:
//  - pool always >= max payout owed to any single winning option
//  - every winner's claim succeeds (no "insufficient pool funds")
//  - payouts never exceed the pool, and the remainder is non-negative
func TestNOutcomeSolvencyFuzz(t *testing.T) {
	for seed := int64(1); seed <= 12; seed++ {
		r := rand.New(rand.NewSource(seed))
		n := 2 + r.Intn(9) // 2..10 options
		c, fc, creator := nSetup(t)
		opts := make([]string, n)
		for i := range opts {
			opts[i] = string(rune('A' + i))
		}
		fc.putAccount(t, creator, 100_000_000_000)
		b0 := uint64(FINALIZATION_BOUNTY+MIN_SEED_N) + uint64(r.Int63n(2_000_000_000))
		resp := c.DeliverMessageCreateMarket(&MessageCreateMarket{
			CreatorAddress: creator, B0: b0, ExpiryTime: 5000, Nonce: uint64(seed), Question: "q", Options: opts,
		}, 1000, "h")
		if resp.Error != nil {
			t.Fatalf("seed %d create: %v", seed, resp.Error)
		}
		mid := DeriveMarketId(creator, uint64(seed))

		bettors := make([][]byte, 40)
		for i := range bettors {
			bettors[i] = addr(byte(0x10 + i))
			fc.putAccount(t, bettors[i], 1_000_000_000_000)
		}
		for i := 0; i < 400; i++ {
			who := bettors[r.Intn(len(bettors))]
			idx := uint32(r.Intn(n))
			if r.Intn(3) == 0 {
				idx = 0 // concentrate flow to stress a dominant option
			}
			shares := uint64(1_000_000) * uint64(1+r.Intn(30))
			resp := c.DeliverMessageSubmitPrediction(&MessageSubmitPrediction{
				MarketId: mid, BettorAddress: who, OutcomeIndex: idx, Shares: shares, MaxCost: ^uint64(0) / 4,
			}, 0, "h")
			_ = resp // cap / balance rejections are fine; state stays consistent either way
			m := nMarket(t, fc, mid)
			var maxQ uint64
			for _, q := range m.Q {
				if q > maxQ {
					maxQ = q
				}
			}
			if pool := fc.pool(KeyForMarketPool(mid)); pool < maxQ {
				t.Fatalf("seed %d step %d: pool %d < max q %d (insolvent)", seed, i, pool, maxQ)
			}
		}

		m := nMarket(t, fc, mid)
		win := uint32(r.Intn(n))
		pool := fc.pool(KeyForMarketPool(mid))
		m.Status = STATUS_FINALIZED
		m.FinalizedPoolAmount = pool
		fc.set(KeyForMarket(mid), mustMarshal(t, m))
		fc.set(KeyForOutcome(mid), mustMarshal(t, &OutcomeState{WinningIndex: win, ResolvedAt: 500_000}))
		SetGlobalHeight(500_100)

		var paid uint64
		for _, who := range bettors {
			pos := &PositionState{}
			if v := fc.get(KeyForPosition(mid, who)); len(v) > 0 {
				_ = Unmarshal(v, pos)
			}
			if int(win) >= len(pos.Shares) || pos.Shares[win] == 0 {
				continue
			}
			before := fc.account(who)
			resp := c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: who}, 0)
			if resp.Error != nil {
				t.Fatalf("seed %d n=%d: winner claim failed: %v", seed, n, resp.Error)
			}
			if got := fc.account(who) - before; got != pos.Shares[win] {
				t.Fatalf("seed %d: payout %d != shares %d", seed, got, pos.Shares[win])
			}
			paid += pos.Shares[win]
		}
		if paid > pool {
			t.Fatalf("seed %d: paid %d > pool %d", seed, paid, pool)
		}
		if paid != m.Q[win] {
			t.Fatalf("seed %d: paid %d != q[win] %d (some winner could not claim)", seed, paid, m.Q[win])
		}
	}
}
