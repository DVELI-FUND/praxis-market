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
		0xc8, 0xca, 0x64, 0xbb, 0x28, 0x7d, 0x90, 0x32,
		0xb3, 0x7c, 0xf2, 0x0f, 0x85, 0x3b, 0xf6, 0x47,
		0xe4, 0xe5, 0x16, 0xbf,
	}
	PRAXIS_GENESIS_COMMUNITY_ADDR = []byte{
		0x3b, 0x62, 0x93, 0xd5, 0x05, 0x9d, 0xc5, 0xf5,
		0x52, 0xfd, 0xb6, 0x60, 0x44, 0xbf, 0x31, 0xa1,
		0xe7, 0x0d, 0x5d, 0xbd,
	}
	PRAXIS_GENESIS_INVESTOR_ADDR = []byte{
		0x11, 0x40, 0xa1, 0xc5, 0xe5, 0xe8, 0x2c, 0xaf,
		0x8e, 0xae, 0x6d, 0xdb, 0xd1, 0x04, 0xb5, 0x58,
		0x49, 0xbd, 0x9b, 0x23,
	}
	PRAXIS_GENESIS_FOUNDATION_ADDR = []byte{
		0xab, 0x41, 0x0e, 0xfe, 0x7b, 0xbf, 0x9d, 0x9f,
		0x95, 0xd6, 0x5b, 0xfa, 0x72, 0x5f, 0xeb, 0x25,
		0xad, 0xe5, 0x3f, 0x22,
	}
)
