package contract

import "encoding/hex"

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH V5 — creator allowlist + no creator bond for NEW markets.
// One height gate, default DISABLED. Same activation rules as V3/V4: set it to a
// height comfortably in the future and have EVERY validator on the new binary
// before then. Requires PATCH_V4 to be active.
//
//   1. create_market is accepted only from addresses in CREATOR_ALLOWLIST_HEX.
//   2. New markets are created with CreatorBond = 0 (no 5,000 PRX lock-up).
//
// Markets created BEFORE activation keep their stored CreatorBond; every existing
// return / slash / escrow path is untouched and treats a zero bond as a no-op.
// ═══════════════════════════════════════════════════════════════════════════════

var PATCH_V5_HEIGHT uint64 = 80000

func patchV5Active(h uint64) bool {
return PATCH_V5_HEIGHT != ^uint64(0) && h >= PATCH_V5_HEIGHT && patchV4Active(h)
}

// CREATOR_ALLOWLIST_HEX lists the 20-byte addresses (40 hex chars, lowercase, no 0x)
// that may sign create_market once V5 is active. EMPTY = nobody can create (fail
// closed). Changing this list is a consensus change: rebuild every validator.
var CREATOR_ALLOWLIST_HEX = []string{
"0790d558482cc8495962e8996e5e6311c5889fef", // current market-creator wallet; add the other creator addresses below
}

func creatorAllowed(a []byte) bool {
for _, h := range CREATOR_ALLOWLIST_HEX {
b, err := hex.DecodeString(h)
if err != nil || len(b) != 20 {
continue // malformed entry never matches (fail closed)
}
if bytesEqual(a, b) {
return true
}
}
return false
}

func ErrCreatorNotAllowed() *PluginError {
return &PluginError{Code: 232, Module: errModule, Msg: "creator address not allowed to create markets"}
}

// v5CreateGate rejects create_market from a non-allowlisted creator once V5 is active.
func v5CreateGate(creator []byte, h uint64) *PluginError {
if patchV5Active(h) && !creatorAllowed(creator) {
return ErrCreatorNotAllowed()
}
return nil
}

// v5CreateBond is the bond charged for a market created at height h.
func v5CreateBond(h uint64) uint64 {
if patchV5Active(h) {
return 0
}
return CREATOR_BOND
}
