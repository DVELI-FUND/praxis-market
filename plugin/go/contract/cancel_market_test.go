package contract

import "testing"

func TestCancelEmptyMarketRefundsEverything(t *testing.T) {
prevFix := AUDIT_FIX_HEIGHT; AUDIT_FIX_HEIGHT = 0; t.Cleanup(func() { AUDIT_FIX_HEIGHT = prevFix })
for _, h := range []uint64{100, 9000} {
c, fc := newTestChain(t)
creator := addr(0xA1)
const start = 100_000_000_000
fc.putAccount(t, creator, start)
SetGlobalHeight(50)
const fee = 1000
mid := DeriveMarketId(creator, 1)
if r := c.DeliverMessageCreateMarket(&MessageCreateMarket{CreatorAddress: creator, B0: MIN_B0, ExpiryTime: 5000, Nonce: 1, Question: "q?"}, fee, "h"); r.Error != nil {
t.Fatal(r.Error)
}
SetGlobalHeight(h)
if r := c.DeliverMessageCancelMarket(&MessageCancelMarket{MarketId: mid, CreatorAddress: creator}, fee, "h"); r.Error != nil {
t.Fatalf("cancel at %d: %v", h, r.Error)
}
if got, want := fc.account(creator), uint64(start-2*fee); got != want {
t.Fatalf("height %d: balance %d, want %d", h, got, want)
}
if p := fc.pool(KeyForMarketPool(mid)); p != 0 {
t.Fatalf("pool left %d", p)
}
}
}
