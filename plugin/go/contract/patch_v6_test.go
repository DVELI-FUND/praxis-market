package contract

import "testing"

func TestV6DisputeWindowGate(t *testing.T) {
	prev := TEST_MODE
	TEST_MODE = false
	t.Cleanup(func() { TEST_MODE = prev })
	if got := ComputeDisputeBlocksAt(PATCH_V6_HEIGHT-1, 0, 1_000_000); got != MIN_DISPUTE_BLOCKS {
		t.Fatalf("before V6: got %d want %d", got, MIN_DISPUTE_BLOCKS)
	}
	if got := ComputeDisputeBlocksAt(PATCH_V6_HEIGHT, 0, 1_000_000); got != DISPUTE_BLOCKS_V6 {
		t.Fatalf("at V6: got %d want %d", got, DISPUTE_BLOCKS_V6)
	}
}

func TestV6ClaimGraceGate(t *testing.T) {
	v2 := &MarketState{EngineV2: true}
	old := &MarketState{}
	if got := v2ClaimGrace(v2, CLAIM_GRACE_PERIOD_V2, PATCH_V6_HEIGHT-1); got != V2_CLAIM_GRACE_BLOCKS {
		t.Fatalf("v2 before V6: got %d", got)
	}
	if got := v2ClaimGrace(v2, CLAIM_GRACE_PERIOD_V2, PATCH_V6_HEIGHT); got != CLAIM_GRACE_PERIOD_V2 {
		t.Fatalf("v2 at V6: got %d", got)
	}
	if got := v2ClaimGrace(old, CLAIM_GRACE_PERIOD_V2, PATCH_V6_HEIGHT-1); got != CLAIM_GRACE_PERIOD_V2 {
		t.Fatalf("legacy before V6: got %d", got)
	}
}
