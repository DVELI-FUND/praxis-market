package contract

import (
    "fmt"
    "testing"
)

const noFix = ^uint64(0)

// cancelScenario creates a binary market at height 50, then cancels at height h
// with AUDIT_FIX_HEIGHT = fixHeight.
func cancelScenario(t *testing.T, fixHeight, h uint64) (before, after, poolBefore, poolAfter uint64, errStr string) {
    prev := AUDIT_FIX_HEIGHT
    AUDIT_FIX_HEIGHT = fixHeight
    t.Cleanup(func() { AUDIT_FIX_HEIGHT = prev })
    c, fc := newTestChain(t)
    creator := addr(0xA1)
    fc.putAccount(t, creator, 100_000_000_000)
    SetGlobalHeight(50)
    const fee = 1000
    mid := DeriveMarketId(creator, 1)
    if r := c.DeliverMessageCreateMarket(&MessageCreateMarket{CreatorAddress: creator, B0: MIN_B0, ExpiryTime: 5000, Nonce: 1, Question: "q?"}, fee, "h"); r.Error != nil {
        t.Fatal(r.Error)
    }
    before = fc.account(creator)
    poolBefore = fc.pool(KeyForMarketPool(mid))
    SetGlobalHeight(h)
    r := c.DeliverMessageCancelMarket(&MessageCancelMarket{MarketId: mid, CreatorAddress: creator}, fee, "h")
    if r.Error != nil {
        errStr = fmt.Sprint(r.Error)
    }
    after = fc.account(creator)
    poolAfter = fc.pool(KeyForMarketPool(mid))
    return
}

func TestCancelBelowHeightRejectsExpired(t *testing.T) {
    before, after, pb, pa, e := cancelScenario(t, noFix, 9000)
    if e != fmt.Sprint(ErrMarketExpired()) {
        t.Fatalf("legacy path must reject expired cancel, got %q", e)
    }
    if after != before || pa != pb {
        t.Fatalf("rejected cancel changed state: bal %d->%d pool %d->%d", before, after, pb, pa)
    }
}

func TestCancelLegacyVsGatedDelta(t *testing.T) {
    const fee = 1000
    _, legacyAfter, pb, legacyPool, e := cancelScenario(t, noFix, 100)
    if e != "" {
        t.Fatalf("legacy cancel before expiry failed: %s", e)
    }
    if pb == 0 || legacyPool != pb {
        t.Fatalf("legacy must leave the pool untouched: before %d after %d", pb, legacyPool)
    }
    _, gatedAfter, _, gatedPool, e := cancelScenario(t, 0, 100)
    if e != "" {
        t.Fatalf("gated cancel failed: %s", e)
    }
    if gatedPool != 0 {
        t.Fatalf("gated pool left %d", gatedPool)
    }
    if gatedAfter != legacyAfter+pb-fee {
        t.Fatalf("gated balance %d, want legacy %d + seed %d - fee %d", gatedAfter, legacyAfter, pb, fee)
    }
}

func TestCancelGatedAllowsExpired(t *testing.T) {
    _, _, _, pa, e := cancelScenario(t, 0, 9000)
    if e != "" || pa != 0 {
        t.Fatalf("gated post-expiry cancel: err %q pool %d", e, pa)
    }
}
