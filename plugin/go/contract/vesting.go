package contract

// vesting.go — shared linear-vesting math for genesis Investor/Foundation
// allocations. Cliff then linear release: nothing claimable before
// GENESIS_VEST_CLIFF_BLOCKS elapsed; after that, unlocks linearly over
// GENESIS_VEST_DURATION_BLOCKS; fully unlocked at cliff+duration.
func computeVestedAmount(total, startHeight, currentHeight uint64) uint64 {
if currentHeight <= startHeight {
return 0
}
elapsed := currentHeight - startHeight
if elapsed < GENESIS_VEST_CLIFF_BLOCKS {
return 0
}
if elapsed >= GENESIS_VEST_CLIFF_BLOCKS+GENESIS_VEST_DURATION_BLOCKS {
return total
}
vestedBlocks := elapsed - GENESIS_VEST_CLIFF_BLOCKS
// Quot/rem decomposition — avoids uint64 overflow from total*vestedBlocks
// (total ~6.5e12, vestedBlocks up to ~4.7e6 would overflow uint64 if
// multiplied directly) while preserving full precision.
q := total / GENESIS_VEST_DURATION_BLOCKS
r := total % GENESIS_VEST_DURATION_BLOCKS
return q*vestedBlocks + (r*vestedBlocks)/GENESIS_VEST_DURATION_BLOCKS
}
