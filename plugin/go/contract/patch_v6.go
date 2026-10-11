package contract

// ════════════════════════════════════════════════════════════════════════════════
// PATCH V6 — shorter dispute window + no 24h claim limit.
// One height gate. Every validator must be on this binary BEFORE PATCH_V6_HEIGHT.
//
//   1. Dispute / finalize window after propose_outcome: 24h (8,640 blocks)
//      instead of 48h (17,280). Applies to every proposal evaluated at or after
//      the activation height, including proposals filed earlier.
//   2. claim_winnings: v2 markets use the default 30-day claim window instead of
//      24h after finalization.
// ════════════════════════════════════════════════════════════════════════════════

var PATCH_V6_HEIGHT uint64 = 90000

// DISPUTE_BLOCKS_V6 = 24h at ~10s/block.
const DISPUTE_BLOCKS_V6 uint64 = 8_640

func patchV6Active(h uint64) bool {
	return PATCH_V6_HEIGHT != ^uint64(0) && h >= PATCH_V6_HEIGHT
}
