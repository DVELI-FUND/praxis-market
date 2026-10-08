package contract

import "testing"

func setRewardFix(t *testing.T, h uint64) {
	t.Helper()
	prev := RESOLVER_REWARD_FIX_HEIGHT
	RESOLVER_REWARD_FIX_HEIGHT = h
	t.Cleanup(func() { RESOLVER_REWARD_FIX_HEIGHT = prev })
}

// reFinalize seeds a PROPOSED market for `resolver` (RRS preset) and finalizes it.
func reFinalize(t *testing.T, c *Contract, fc *fakeChain, mid, resolver []byte, rrs uint64) {
	t.Helper()
	creator, caller := addr(0xA1), addr(0xC1)
	fc.set(KeyForMarket(mid), mustMarshal(t, &MarketState{Status: STATUS_PROPOSED, ExpiryTime: 10, OpenTime: 1, BEff: MIN_B0, Creator: creator, TotalPositions: 1}))
	fc.set(KeyForProposal(mid), mustMarshal(t, &ProposalRecord{ResolverAddr: resolver, ProposedOutcome: true, ProposalBond: 1, ProposalBlock: 11}))
	fc.set(KeyForTreasuryReserve(mid), mustMarshal(t, &TreasuryReserve{LockedReserve: FINALIZATION_BOUNTY, CreatorBond: CREATOR_BOND}))
	fc.putPool(t, KeyForMarketPool(mid), 6_000_000_000)
	fc.set(KeyForResolverRecord(resolver), mustMarshal(t, &ResolverRecord{ResolverAddress: resolver, RrsScore: rrs, IsActive: true}))
	if r := c.DeliverMessageFinalizeMarket(&MessageFinalizeMarket{MarketId: mid, CallerAddr: caller}, 0, "h"); r.Error != nil {
		t.Fatalf("finalize: %v", r.Error)
	}
}

// Gold (RRS 190 -> 200 after finalize, weight 3) and Bronze (10 -> 20, weight 1) resolve
// in the same epoch. Payouts must be exact pro-rata (3:1) and sum to the whole pool,
// regardless of claim order, and a second claim must fail.
func TestPerEpochResolverRewardExactProRata(t *testing.T) {
	setRewardFix(t, 500)
	c, fc := newTestChain(t)
	gold, bronze := addr(0x91), addr(0x92)
	const finalizeHeight = 500_000
	epoch := uint64(finalizeHeight) / PRIS_EPOCH_BLOCKS
	SetGlobalHeight(finalizeHeight)

	reFinalize(t, c, fc, addr(0x01), gold, 190)
	reFinalize(t, c, fc, addr(0x02), bronze, 10)

	if got := fc.pool(KeyForEpochWeightedTotal(epoch)); got != 4 {
		t.Fatalf("epoch weighted total = %d, want 4", got)
	}
	if got := fc.pool(KeyForResolverEpochScore(epoch, gold)); got != 3 {
		t.Fatalf("gold epoch score = %d, want 3", got)
	}
	if got := fc.pool(KeyForResolverEpochScore(epoch, bronze)); got != 1 {
		t.Fatalf("bronze epoch score = %d, want 1", got)
	}

	const pool = 1_000_000
	fc.putPool(t, KeyForResolverEpochPool(epoch), pool)
	SetGlobalHeight(finalizeHeight + PRIS_EPOCH_BLOCKS) // epoch is now closed

	bBefore, gBefore := fc.account(bronze), fc.account(gold)
	// Bronze claims FIRST: must not shrink gold's share (old code under-paid late claimers).
	if r := c.DeliverMessageClaimResolverReward(&MessageClaimResolverReward{ResolverAddress: bronze, Epoch: epoch}, 0); r.Error != nil {
		t.Fatalf("bronze claim: %v", r.Error)
	}
	if got := fc.account(bronze) - bBefore; got != 250_000 {
		t.Fatalf("bronze payout = %d, want 250000", got)
	}
	if r := c.DeliverMessageClaimResolverReward(&MessageClaimResolverReward{ResolverAddress: gold, Epoch: epoch}, 0); r.Error != nil {
		t.Fatalf("gold claim: %v", r.Error)
	}
	if got := fc.account(gold) - gBefore; got != 750_000 {
		t.Fatalf("gold payout = %d, want 750000", got)
	}
	if left := fc.pool(KeyForResolverEpochPool(epoch)); left != 0 {
		t.Fatalf("epoch pool left = %d, want 0 (payouts must sum to the pool)", left)
	}
	if got := fc.pool(KeyForEpochWeightedTotal(epoch)); got != 0 {
		t.Fatalf("epoch total after claims = %d, want 0", got)
	}

	// Double-claim is impossible.
	if r := c.DeliverMessageClaimResolverReward(&MessageClaimResolverReward{ResolverAddress: gold, Epoch: epoch}, 0); r.Error == nil {
		t.Fatal("second claim of the same epoch must fail")
	}
}

// A resolver with no resolutions in an epoch gets nothing from it, even with a big all-time record.
func TestPerEpochClaimRequiresActivityInThatEpoch(t *testing.T) {
	setRewardFix(t, 500)
	c, fc := newTestChain(t)
	active, idle := addr(0x93), addr(0x94)
	const finalizeHeight = 500_000
	epoch := uint64(finalizeHeight) / PRIS_EPOCH_BLOCKS
	SetGlobalHeight(finalizeHeight)

	reFinalize(t, c, fc, addr(0x03), active, 10)
	fc.set(KeyForResolverRecord(idle), mustMarshal(t, &ResolverRecord{ResolverAddress: idle, RrsScore: 300, SuccessfulResolutions: 99, IsActive: true}))
	fc.putPool(t, KeyForResolverEpochPool(epoch), 1_000_000)
	SetGlobalHeight(finalizeHeight + PRIS_EPOCH_BLOCKS)

	if r := c.DeliverMessageClaimResolverReward(&MessageClaimResolverReward{ResolverAddress: idle, Epoch: epoch}, 0); r.Error == nil {
		t.Fatal("idle resolver must not be paid from an epoch it did not resolve in")
	}
	before := fc.account(active)
	if r := c.DeliverMessageClaimResolverReward(&MessageClaimResolverReward{ResolverAddress: active, Epoch: epoch}, 0); r.Error != nil {
		t.Fatalf("active claim: %v", r.Error)
	}
	if got := fc.account(active) - before; got != 1_000_000 {
		t.Fatalf("sole resolver payout = %d, want the whole pool", got)
	}
}

// Gate disabled (production default): per-epoch keys are never written, legacy stats still are.
func TestPerEpochAccountingOffBelowActivation(t *testing.T) {
	setRewardFix(t, noFix)
	c, fc := newTestChain(t)
	r := addr(0x95)
	SetGlobalHeight(500_000)
	reFinalize(t, c, fc, addr(0x04), r, 10)
	epoch := uint64(500_000) / PRIS_EPOCH_BLOCKS
	if len(fc.get(KeyForEpochWeightedTotal(epoch))) != 0 || len(fc.get(KeyForResolverEpochScore(epoch, r))) != 0 {
		t.Fatal("per-epoch keys must not be written while the fix is disabled")
	}
	gs := &GlobalStats{}
	if pe := Unmarshal(fc.get(KeyForGlobalStats()), gs); pe != nil || gs.TotalWeightedResolutions == 0 {
		t.Fatalf("legacy GlobalStats must still be updated (total=%d err=%v)", gs.TotalWeightedResolutions, pe)
	}
}

// An epoch that starts before the activation height stays on legacy accounting.
func TestEpochStraddlingActivationStaysLegacy(t *testing.T) {
	setRewardFix(t, 500_250) // mid-epoch 1000 (starts at 500_000)
	if resolverEpochFixed(1000) {
		t.Fatal("epoch starting before activation must stay legacy")
	}
	if !resolverEpochFixed(1001) {
		t.Fatal("first epoch starting at/after activation must use per-epoch accounting")
	}
}
