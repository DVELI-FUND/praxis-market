package main

import (
"testing"
"time"

contract "github.com/canopy-network/canopy/plugin/go/contract"
)

// TestClaimResolverRewardLive is a one-off live verification of the reward-context
// endpoint's math against a real claim_resolver_reward tx. It claims epoch 1 for the
// hardcoded resolver (205f68c279331cd17b9d41727f09eed7162b0389), which reward-context
// reported as: pool=2000, total_weighted_resolutions=1, computed_payout=2000, eligible=true.
//
// Prediction: balance delta = payout - fee = 2000 - 10000 = -8000 (net DECREASE,
// since the tx fee exceeds this tiny testnet-scale reward). If the actual delta
// doesn't match that exactly, the payout formula or fee assumption is wrong.
func TestClaimResolverRewardLive(t *testing.T) {
const resolverAddr = "205f68c279331cd17b9d41727f09eed7162b0389"
const claimEpoch = uint64(4)
const expectedPayout = int64(2000) // epoch 4
const expectedFee = int64(testFee)

key, err := keystoreGetKey(resolverAddr, "")
if err != nil {
t.Fatalf("key: %v", err)
}

balBefore := int64(getBalance(resolverAddr))
t.Logf("Balance before claim: %d", balBefore)

h, _ := getHeight()
msg := &contract.MessageClaimResolverReward{
ResolverAddress: hexDecode(resolverAddr),
Epoch:           claimEpoch,
}
hash := submitTx(t, key, "claim_resolver_reward", "MessageClaimResolverReward", msg, h)
if err := waitForTx(resolverAddr, hash, 60*time.Second); err != nil {
t.Fatalf("claim_resolver_reward failed: %v", err)
}
t.Logf("Claim tx hash: %s", hash)

balAfter := int64(getBalance(resolverAddr))
t.Logf("Balance after claim: %d", balAfter)

delta := balAfter - balBefore
expectedDelta := expectedPayout - expectedFee
t.Logf("Actual delta: %d | Expected delta: %d (payout %d - fee %d)", delta, expectedDelta, expectedPayout, expectedFee)

if delta != expectedDelta {
t.Fatalf("MISMATCH: reward-context predicted delta %d, actual on-chain delta was %d", expectedDelta, delta)
}
t.Log("MATCH: reward-context's computed_payout matches the real on-chain claim exactly")
}
