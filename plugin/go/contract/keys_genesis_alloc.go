package contract

// ─────────────────────────────────────────────────────────────────────────────
// GENESIS ALLOCATION STATE KEYS (0x2E – 0x30)
//   0x2E  GenesisInvestorAlloc    singleton — GenesisVestingAlloc proto
//   0x2F  GenesisFoundationAlloc  singleton — GenesisVestingAlloc proto
//   0x30  GenesisCommunityAlloc   singleton — Pool proto (reused; liquid, no vesting)
// ─────────────────────────────────────────────────────────────────────────────

var (
genesisInvestorAllocPrefix   = []byte{0x2E}
genesisFoundationAllocPrefix = []byte{0x2F}
genesisCommunityAllocPrefix  = []byte{0x30}
)

func KeyForGenesisInvestorAlloc() []byte {
return JoinLenPrefix(genesisInvestorAllocPrefix, []byte("/gia/"))
}
func KeyForGenesisFoundationAlloc() []byte {
return JoinLenPrefix(genesisFoundationAllocPrefix, []byte("/gfa/"))
}
func KeyForGenesisCommunityAlloc() []byte {
return JoinLenPrefix(genesisCommunityAllocPrefix, []byte("/gca/"))
}
