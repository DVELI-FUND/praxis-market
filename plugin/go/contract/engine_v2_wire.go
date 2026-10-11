package contract

import "math"

// ═══════════════════════════════════════════════════════════════════════════════
// ENGINE V2 wiring — LMSR v2 / ADLMSR v2 (see lmsr_v2.go for the math).
//
// One height gate, default DISABLED (same convention as PATCH_V3/V4). Markets created
// at or after ENGINE_V2_HEIGHT are v2 markets (MarketState.EngineV2 = true) and are
// ALWAYS N-outcome (binary = 2 options). Markets created before it keep the original
// engine forever: v2 differs from TradeCostN by up to 1 unit, so switching a live
// market's engine would fork consensus.
// ═══════════════════════════════════════════════════════════════════════════════

// ENGINE_V2_HEIGHT: set to a height comfortably in the future, release, and have every
// validator on the new binary BEFORE that height. Requires PATCH_V4 to be active.
var ENGINE_V2_HEIGHT uint64 = 88441

const (
	// Profit above the seed is split creator / resolver / treasury (seed returns first).
	V2_PROFIT_CREATOR_BPS  uint64 = 5000
	V2_PROFIT_RESOLVER_BPS uint64 = 2000 // remainder (30%) goes to the treasury
	// Protocol revenue taken on top of every v2 trade (TUNE BEFORE ACTIVATION).
	V2_PROTOCOL_FEE_BPS uint64 = 50
)

func engineV2Active(h uint64) bool {
	return ENGINE_V2_HEIGHT != ^uint64(0) && h >= ENGINE_V2_HEIGHT && patchV4Active(h)
}

func marketEngineV2(m *MarketState) EngineV2 {
	return EngineV2{B0: m.BEff, AlphaPPM: m.AlphaPpm}
}

// v2AlphaFor is the single hook that decides a new market's alpha. Today: the largest
// alpha keeping the worst-case extra price per share <= 1% of a share's payout, which
// makes alpha smaller for markets with more options. (seed is passed so a seed- or
// duration-based rule can be added here without touching any handler.)
func v2AlphaFor(n int, seed uint64) (uint64, error) {
	_ = seed
	return AlphaForFrictionV2(n, DEFAULT_FRICTION_PPM)
}

// depthV2 returns the live depth b(q) = b0 + alpha*S in micro-units (saturating).
func depthV2(m *MarketState) uint64 {
	b := depthFxV2(m.Q, marketEngineV2(m))
	b.Rsh(b, fracBits)
	if !b.IsUint64() {
		return math.MaxUint64
	}
	return b.Uint64()
}

func v2ProtocolFee(m *MarketState, tradeCost uint64) uint64 {
	if m == nil || !m.EngineV2 {
		return 0
	}
	return ComputeBps(tradeCost, V2_PROTOCOL_FEE_BPS)
}

// v2SettlePay pays the resolver's and treasury's share of a v2 market's profit AFTER
// the handler's main write. If the proposer is not eligible for the resolver fee
// (no pathB/pathQ), that share goes to the treasury so no value is ever lost.
func (c *Contract) v2SettlePay(resolver []byte, resolverPaid bool, resolverShare, treasuryShare uint64) *PluginError {
	if !resolverPaid {
		treasuryShare = addSat(treasuryShare, resolverShare)
		resolverShare = 0
	}
	if resolverShare > 0 {
		if pe := c.creditAccount(resolver, resolverShare); pe != nil {
			return pe
		}
	}
	if treasuryShare > 0 {
		if pe := c.creditTreasury(treasuryShare); pe != nil {
			return pe
		}
	}
	return nil
}
