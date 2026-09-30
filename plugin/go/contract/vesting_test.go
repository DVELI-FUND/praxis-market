package contract

import "testing"

func TestVestingSchedule(t *testing.T) {
	T := GENESIS_INVESTOR_AMOUNT
	C, D := GENESIS_VEST_CLIFF_BLOCKS, GENESIS_VEST_DURATION_BLOCKS
	if v := computeVestedAmount(T, 0, C-1); v != 0 {
		t.Fatalf("before cliff: %d", v)
	}
	if v := computeVestedAmount(T, 0, C+D); v != T {
		t.Fatalf("fully vested: %d", v)
	}
	if v := computeVestedAmount(T, 0, C+D/2); v != T/2 {
		t.Fatalf("midpoint: %d", v)
	}
	if v := computeVestedAmount(T, 3000000, 3000001); v != 0 {
		t.Fatalf("late mint unlocked %d", v)
	}
	var prev uint64
	for h := uint64(0); h <= C+D+10; h += 997 {
		v := computeVestedAmount(T, 0, h)
		if v < prev || v > T {
			t.Fatalf("h=%d v=%d prev=%d", h, v, prev)
		}
		prev = v
	}
}
