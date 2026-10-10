package contract

import (
	"encoding/hex"
	"testing"
)

// v5On activates V5 (and the V4/V3 gates it depends on) with the given allowlist.
func v5On(t *testing.T, fc *fakeChain, allow ...[]byte) {
	t.Helper()
	v4On(t, fc)
	oH, oA := PATCH_V5_HEIGHT, CREATOR_ALLOWLIST_HEX
	PATCH_V5_HEIGHT = 1
	CREATOR_ALLOWLIST_HEX = nil
	for _, a := range allow {
		CREATOR_ALLOWLIST_HEX = append(CREATOR_ALLOWLIST_HEX, hex.EncodeToString(a))
	}
	t.Cleanup(func() { PATCH_V5_HEIGHT, CREATOR_ALLOWLIST_HEX = oH, oA })
}

func v5Create(c *Contract, creator []byte, nonce uint64) *PluginDeliverResponse {
	return c.DeliverMessageCreateMarket(&MessageCreateMarket{
		CreatorAddress: creator, B0: nTestB0, ExpiryTime: 5000, Nonce: nonce, Question: "q",
	}, 1000, "h")
}

func TestV5_GateBoundary(t *testing.T) {
	_, fc := newTestChain(t)
	v4On(t, fc)
	o := PATCH_V5_HEIGHT
	PATCH_V5_HEIGHT = 200
	defer func() { PATCH_V5_HEIGHT = o }()
	if patchV5Active(199) || !patchV5Active(200) {
		t.Fatal("V5 gate boundary wrong")
	}
}

func TestV5_RequiresV4(t *testing.T) {
	oV4, oV5 := PATCH_V4_HEIGHT, PATCH_V5_HEIGHT
	PATCH_V4_HEIGHT, PATCH_V5_HEIGHT = ^uint64(0), 1
	defer func() { PATCH_V4_HEIGHT, PATCH_V5_HEIGHT = oV4, oV5 }()
	if patchV5Active(1 << 40) {
		t.Fatal("v5 must not activate without v4")
	}
}

func TestV5_DefaultAllowlistWellFormed(t *testing.T) {
	for _, h := range CREATOR_ALLOWLIST_HEX {
		b, err := hex.DecodeString(h)
		if err != nil || len(b) != 20 {
			t.Fatalf("bad allowlist entry %q (need 40 hex chars)", h)
		}
	}
}

// Before the gate height nothing changes: any creator, bond charged.
func TestV5_PreActivationUnchanged(t *testing.T) {
	c, fc, creator := nSetup(t)
	v4On(t, fc)
	before := fc.account(creator)
	if r := v5Create(c, creator, 1); r.Error != nil {
		t.Fatalf("create: %v", r.Error)
	}
	if spent := before - fc.account(creator); spent != nTestB0+1000+CREATOR_BOND {
		t.Fatalf("pre-V5 spend %d want B0+fee+bond", spent)
	}
}

func TestV5_NonAllowlistedCreatorRejected(t *testing.T) {
	c, fc, creator := nSetup(t)
	v5On(t, fc, addr(0xA2))
	before := fc.account(creator)
	r := v5Create(c, creator, 1)
	if r.Error == nil || r.Error.Code != 232 {
		t.Fatalf("want ErrCreatorNotAllowed, got %v", r.Error)
	}
	if fc.account(creator) != before {
		t.Fatal("a rejected create must not move funds")
	}
}

func TestV5_EmptyAllowlistFailsClosed(t *testing.T) {
	c, fc, creator := nSetup(t)
	v5On(t, fc) // no addresses
	if r := v5Create(c, creator, 1); r.Error == nil {
		t.Fatal("empty allowlist must reject everyone")
	}
}

func TestV5_AllowlistedCreatorNoBond(t *testing.T) {
	c, fc, creator := nSetup(t)
	v5On(t, fc, creator)
	before := fc.account(creator)
	if r := v5Create(c, creator, 1); r.Error != nil {
		t.Fatalf("create: %v", r.Error)
	}
	if spent := before - fc.account(creator); spent != nTestB0+1000 {
		t.Fatalf("V5 spend %d want B0+fee (no bond)", spent)
	}
	tr := &TreasuryReserve{}
	if pe := Unmarshal(fc.get(KeyForTreasuryReserve(DeriveMarketId(creator, 1))), tr); pe != nil {
		t.Fatal(pe)
	}
	if tr.CreatorBond != 0 || tr.LockedReserve != FINALIZATION_BOUNTY {
		t.Fatalf("reserve bond=%d locked=%d", tr.CreatorBond, tr.LockedReserve)
	}
}

// A market created BEFORE V5 still gets its bond back at finalize after V5 activates.
func TestV5_LegacyBondStillReturnedAtFinalize(t *testing.T) {
	c, fc, mid, creator, _ := finalizable(t)
	v5On(t, fc)
	putMsg(t, fc, KeyForMarket(mid), &MarketState{Status: STATUS_PROPOSED, Creator: creator, OpenTime: 1, ExpiryTime: 10,
		BEff: 100_000_000, QYes: 50_000_000 + 30_000_000, QNo: 50_000_000 + 10_000_000, TotalPositions: 2})
	fc.putPool(t, KeyForMarketPool(mid), 125_000_000)
	ok(t, c.DeliverMessageFinalizeMarket(&MessageFinalizeMarket{MarketId: mid, CallerAddr: addr(0xAA)}, 0, "h"))
	if got := fc.account(creator); got != CREATOR_BOND+95_000_000 {
		t.Fatalf("creator got %d want legacy bond + 95M surplus", got)
	}
}
