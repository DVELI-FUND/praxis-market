package contract

import (
"fmt"
"testing"
)

func withCancelFix(t *testing.T, h uint64) {
t.Helper()
old := CANCEL_FIX_HEIGHT
CANCEL_FIX_HEIGHT = h
t.Cleanup(func() { CANCEL_FIX_HEIGHT = old })
}

// legacyCancelled builds a market, then cancels it with every fix DISABLED (what mainnet
// did). Returns the market id, creator balance after the cancel and the stranded seed.
func legacyCancelled(t *testing.T) (c *Contract, fc *fakeChain, mid []byte, creator []byte, balAfter, seed uint64) {
t.Helper()
withCancelFix(t, noFix)
prev := AUDIT_FIX_HEIGHT
AUDIT_FIX_HEIGHT = noFix
t.Cleanup(func() { AUDIT_FIX_HEIGHT = prev })
c, fc = newTestChain(t)
creator = addr(0xA1)
fc.putAccount(t, creator, 100_000_000_000)
SetGlobalHeight(50)
mid = DeriveMarketId(creator, 1)
if r := c.DeliverMessageCreateMarket(&MessageCreateMarket{CreatorAddress: creator, B0: MIN_B0, ExpiryTime: 5000, Nonce: 1, Question: "q?"}, 1000, "h"); r.Error != nil {
t.Fatal(r.Error)
}
seed = fc.pool(KeyForMarketPool(mid))
SetGlobalHeight(100)
if r := c.DeliverMessageCancelMarket(&MessageCancelMarket{MarketId: mid, CreatorAddress: creator}, 1000, "h"); r.Error != nil {
t.Fatal(r.Error)
}
if seed == 0 || fc.pool(KeyForMarketPool(mid)) != seed {
t.Fatalf("expected legacy cancel to strand seed %d, pool=%d", seed, fc.pool(KeyForMarketPool(mid)))
}
return c, fc, mid, creator, fc.account(creator), seed
}

func TestReclaimCancelledSeedRecoversStrandedLiquidity(t *testing.T) {
c, fc, mid, creator, bal, seed := legacyCancelled(t)
msg := &MessageReclaimStake{MarketId: mid, ClaimantAddress: creator}

// Before activation: behaviour unchanged (rejected, no state change) — replay-safe.
SetGlobalHeight(150)
if r := c.DeliverMessageReclaimStake(msg, 0); r.Error == nil || fmt.Sprint(r.Error) != fmt.Sprint(ErrMarketNotReclaimable()) {
t.Fatalf("pre-activation must reject, got %v", r.Error)
}
if fc.account(creator) != bal || fc.pool(KeyForMarketPool(mid)) != seed {
t.Fatal("rejected reclaim changed state")
}

withCancelFix(t, 200)
SetGlobalHeight(300)

// Someone else cannot take it.
if r := c.DeliverMessageReclaimStake(&MessageReclaimStake{MarketId: mid, ClaimantAddress: addr(0xB2)}, 0); r.Error == nil || fmt.Sprint(r.Error) != fmt.Sprint(ErrUnauthorized()) {
t.Fatalf("non-creator must be rejected, got %v", r.Error)
}
if fc.pool(KeyForMarketPool(mid)) != seed {
t.Fatal("non-creator call moved the pool")
}

// Creator recovers exactly the seed.
if r := c.DeliverMessageReclaimStake(msg, 0); r.Error != nil {
t.Fatalf("recovery failed: %v", r.Error)
}
if got := fc.account(creator); got != bal+seed {
t.Fatalf("creator balance %d, want %d", got, bal+seed)
}
if fc.pool(KeyForMarketPool(mid)) != 0 {
t.Fatal("pool not emptied")
}

// Single use.
if r := c.DeliverMessageReclaimStake(msg, 0); r.Error == nil || fmt.Sprint(r.Error) != fmt.Sprint(ErrNoStakeToReclaim()) {
t.Fatalf("second reclaim must fail, got %v", r.Error)
}
if fc.account(creator) != bal+seed {
t.Fatal("double pay")
}
}

func TestCancelAfterFixReturnsBondReserveAndSeed(t *testing.T) {
withCancelFix(t, 0)
c, fc := newTestChain(t)
creator := addr(0xA2)
fc.putAccount(t, creator, 100_000_000_000)
SetGlobalHeight(50)
const fee = 1000
mid := DeriveMarketId(creator, 1)
if r := c.DeliverMessageCreateMarket(&MessageCreateMarket{CreatorAddress: creator, B0: MIN_B0, ExpiryTime: 5000, Nonce: 1, Question: "q?"}, fee, "h"); r.Error != nil {
t.Fatal(r.Error)
}
afterCreate := fc.account(creator)
if r := c.DeliverMessageCancelMarket(&MessageCancelMarket{MarketId: mid, CreatorAddress: creator}, fee, "h"); r.Error != nil {
t.Fatal(r.Error)
}
// Everything locked at creation (B0 liquidity incl. bounty, plus CREATOR_BOND) comes back; only the tx fee is lost.
if got, want := fc.account(creator), afterCreate+MIN_B0+CREATOR_BOND-fee; got != want {
t.Fatalf("balance %d, want %d", got, want)
}
if fc.pool(KeyForMarketPool(mid)) != 0 {
t.Fatal("pool not emptied")
}
}

func TestCancelFixGateIsIndependentAndDefaultsOff(t *testing.T) {
if cancelFixActive(CANCEL_FIX_HEIGHT - 1) || !cancelFixActive(CANCEL_FIX_HEIGHT) {
t.Fatal("cancel fix gate boundary wrong at its activation height")
}
withCancelFix(t, 10)
if !cancelFixActive(10) || cancelFixActive(9) {
t.Fatal("gate boundary wrong")
}
if auditFixActive(AUDIT_FIX_HEIGHT - 1) {
t.Fatal("cancel gate must not enable the entropy/audit gate below its own height")
}
}
