package contract

import (
    "fmt"
    "testing"
)

func setFix(t *testing.T, h uint64) {
    prev := AUDIT_FIX_HEIGHT
    AUDIT_FIX_HEIGHT = h
    t.Cleanup(func() { AUDIT_FIX_HEIGHT = prev })
}

// Legacy reclaim: the creator's reserve is paid OUT OF THE POOL, bond untouched.
func TestReclaimBelowHeightLegacyBehaviour(t *testing.T) {
    setFix(t, noFix)
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
    if got := fc.account(creator); got != uint64(FINALIZATION_BOUNTY) {
        t.Fatalf("creator got %d, want %d", got, uint64(FINALIZATION_BOUNTY))
    }
    if p := fc.pool(KeyForMarketPool(mid)); p != uint64(pool)-uint64(FINALIZATION_BOUNTY) {
        t.Fatalf("legacy pool %d, want %d (reserve drawn from pool)", p, uint64(pool)-uint64(FINALIZATION_BOUNTY))
    }
    tr := &TreasuryReserve{}
    if pe := Unmarshal(fc.get(KeyForTreasuryReserve(mid)), tr); pe != nil {
        t.Fatal(pe)
    }
    if tr.LockedReserve != 0 || tr.CreatorBond != uint64(CREATOR_BOND) {
        t.Fatalf("legacy treasury reserve=%d bond=%d, want 0 / %d", tr.LockedReserve, tr.CreatorBond, uint64(CREATOR_BOND))
    }
}

func tenOpts() []string {
    o := make([]string, 10)
    for i := range o {
        o[i] = fmt.Sprintf("option %d", i+1)
    }
    return o
}

// 10-option market, zero positions, cancelled: creator must recover the FULL stake.
func nCancelRun(t *testing.T, fixH, h uint64) (start, after, poolAfter uint64, errStr string) {
    setFix(t, fixH)
    c, fc, creator := nSetup(t)
    start = fc.account(creator)
    SetGlobalHeight(50)
    mid := nCreate(t, c, creator, 1, tenOpts())
    SetGlobalHeight(h)
    r := c.DeliverMessageCancelMarket(&MessageCancelMarket{MarketId: mid, CreatorAddress: creator}, 1000, "h")
    if r.Error != nil {
        errStr = fmt.Sprint(r.Error)
    }
    return start, fc.account(creator), fc.pool(KeyForMarketPool(mid)), errStr
}

func TestCancelTenOptionsGatedRecoversFullSeed(t *testing.T) {
    for _, h := range []uint64{100, 9000} {
        start, after, pool, e := nCancelRun(t, 0, h)
        if e != "" {
            t.Fatalf("height %d: %s", h, e)
        }
        if pool != 0 {
            t.Fatalf("height %d: pool left %d", h, pool)
        }
        // create fee + cancel fee are the only permitted losses
        if after != start-2*1000 {
            t.Fatalf("height %d: balance %d, want %d (stake not fully recovered)", h, after, start-2*1000)
        }
    }
}

func TestCancelTenOptionsLegacyUnchanged(t *testing.T) {
    start, after, pool, e := nCancelRun(t, noFix, 100)
    if e != "" {
        t.Fatal(e)
    }
    if pool == 0 || after >= start-2*1000 {
        t.Fatalf("legacy should strand the seed: pool %d, balance %d, start %d", pool, after, start)
    }
    _, _, _, e = nCancelRun(t, noFix, 9000)
    if e != fmt.Sprint(ErrMarketExpired()) {
        t.Fatalf("legacy expired cancel: got %q", e)
    }
}
