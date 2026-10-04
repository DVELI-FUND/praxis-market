package contract

import "testing"

// Empty market abandoned past the reclaim window: creator recovers everything.
func TestReclaimEmptyMarketRefundsCreator(t *testing.T) {
prevFix := AUDIT_FIX_HEIGHT; AUDIT_FIX_HEIGHT = 0; t.Cleanup(func() { AUDIT_FIX_HEIGHT = prevFix })
c, fc := newTestChain(t)
creator := addr(0xA1)
const start = 100_000_000_000
const fee = 1000
fc.putAccount(t, creator, start)
SetGlobalHeight(50)
mid := DeriveMarketId(creator, 1)
if r := c.DeliverMessageCreateMarket(&MessageCreateMarket{CreatorAddress: creator, B0: MIN_B0, ExpiryTime: 100, Nonce: 1, Question: "q?"}, fee, "h"); r.Error != nil {
t.Fatal(r.Error)
}
SetGlobalHeight(100 + RESOLUTION_DELAY_BLOCKS + GRACE_PERIOD_BLOCKS + 5)
if r := c.DeliverMessageReclaimStake(&MessageReclaimStake{MarketId: mid, ClaimantAddress: creator}, fee); r.Error != nil {
t.Fatal(r.Error)
}
if got, want := fc.account(creator), uint64(start-fee); got != want {
t.Fatalf("balance %d, want %d", got, want)
}
if p := fc.pool(KeyForMarketPool(mid)); p != 0 {
t.Fatalf("pool left %d", p)
}
}

// Market with bettors: creator's reserve must come from escrow, NOT from the pool.
func TestReclaimDoesNotDrainPoolForReserve(t *testing.T) {
prevFix := AUDIT_FIX_HEIGHT; AUDIT_FIX_HEIGHT = 0; t.Cleanup(func() { AUDIT_FIX_HEIGHT = prevFix })
c, fc := newTestChain(t)
mid, creator := addr(0x07), addr(0xA1)
const pool = 6_000_000_000
fc.set(KeyForMarket(mid), mustMarshal(t, &MarketState{Status: STATUS_OPEN, ExpiryTime: 10, OpenTime: 1, BEff: MIN_B0, Creator: creator, TotalPositions: 1}))
fc.set(KeyForTreasuryReserve(mid), mustMarshal(t, &TreasuryReserve{LockedReserve: FINALIZATION_BOUNTY, CreatorBond: CREATOR_BOND}))
fc.putPool(t, KeyForMarketPool(mid), pool)
SetGlobalHeight(10 + RESOLUTION_DELAY_BLOCKS + GRACE_PERIOD_BLOCKS + 5)
if r := c.DeliverMessageReclaimStake(&MessageReclaimStake{MarketId: mid, ClaimantAddress: creator}, 0); r.Error != nil {
t.Fatal(r.Error)
}
if got := fc.account(creator); got != FINALIZATION_BOUNTY {
t.Fatalf("creator got %d, want %d", got, FINALIZATION_BOUNTY)
}
if p := fc.pool(KeyForMarketPool(mid)); p != pool {
t.Fatalf("pool %d, want untouched %d (bettors' funds were drained)", p, pool)
}
tr := &TreasuryReserve{}
if pe := Unmarshal(fc.get(KeyForTreasuryReserve(mid)), tr); pe != nil {
t.Fatal(pe)
}
if tr.LockedReserve != 0 || tr.CreatorBond != CREATOR_BOND {
t.Fatalf("treasury reserve=%d bond=%d, want 0 and %d (bond policy unchanged with positions)", tr.LockedReserve, tr.CreatorBond, CREATOR_BOND)
}
}
