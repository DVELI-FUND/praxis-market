package contract

// ─────────────────────────────────────────────────────────────────────────────
// GENESIS ALLOCATION CONSTANTS — one-time, minted via Genesis() on top of
// Terminal's own 100,000,000 PRX genesis supply. NOT counted in core
// Supply.total (fsm/genesis.go commits Supply before plugin Genesis() runs) —
// disclose this separately, same as Terminal docs recommend for any builder-
// level allocation.
//
// Total: 25,000,000 PRX
//   Liquidity seeding : 7,000,000 PRX — liquid, day-1 market creation wallet
//   Community         : 5,000,000 PRX — liquid, claim-gated, no cooldown
//   Investor          : 6,500,000 PRX — locked, 6mo cliff + 18mo linear vest
//   Foundation        : 6,500,000 PRX — locked, 6mo cliff + 18mo linear vest
// ─────────────────────────────────────────────────────────────────────────────

const (
GENESIS_LIQUIDITY_AMOUNT  uint64 = 7_000_000_000_000 // 7,000,000 PRX in micro-PRX
GENESIS_COMMUNITY_AMOUNT  uint64 = 5_000_000_000_000 // 5,000,000 PRX
GENESIS_INVESTOR_AMOUNT   uint64 = 6_500_000_000_000 // 6,500,000 PRX
GENESIS_FOUNDATION_AMOUNT uint64 = 6_500_000_000_000 // 6,500,000 PRX

// Vesting shape for Investor/Foundation. Block time is 10s (live Terminal
// config, confirmed via explorer). 6-month cliff (182.5 days), then
// 18-month linear release (547.5 days), fully unlocked at ~24 months.
GENESIS_VEST_CLIFF_BLOCKS    uint64 = 1_576_800
GENESIS_VEST_DURATION_BLOCKS uint64 = 4_730_400
)

var (
PRAXIS_LIQUIDITY_SEED_ADDR = []byte{
0x03, 0x9b, 0x45, 0xd8, 0x22, 0xa3, 0xeb, 0xd2,
0xb6, 0x6e, 0xd3, 0x84, 0x7b, 0xba, 0x5e, 0x2b,
0xbe, 0x42, 0x41, 0x90,
}
PRAXIS_GENESIS_COMMUNITY_ADDR = []byte{
0x86, 0x9e, 0x66, 0x4c, 0x50, 0xc5, 0xc1, 0x9f,
0x7d, 0x56, 0xdb, 0xef, 0x03, 0x96, 0x0b, 0x11,
0x6b, 0xc5, 0x4a, 0xcc,
}
PRAXIS_GENESIS_INVESTOR_ADDR = []byte{
0xad, 0x7c, 0xbf, 0x82, 0xb6, 0x5f, 0x58, 0x4a,
0x9a, 0x86, 0x2c, 0xae, 0xd1, 0xab, 0x51, 0xf9,
0xf6, 0x69, 0x2d, 0x2a,
}
PRAXIS_GENESIS_FOUNDATION_ADDR = []byte{
0x2e, 0xd7, 0x6c, 0xbe, 0x2e, 0x3f, 0x38, 0x48,
0x77, 0xe8, 0x4e, 0xd1, 0x99, 0x9d, 0x0c, 0x15,
0x94, 0x80, 0xb6, 0x11,
}
)
