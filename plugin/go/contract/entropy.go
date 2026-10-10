package contract

import (
	"crypto/sha256"
	"encoding/binary"
)

// ─────────────────────────────────────────────────────────────────────────────
// Panel-entropy repair (audit fix), height-gated.
//
// Before this fix PANEL_ENTROPY_KEY (constants.go) was never initialised, so BeginBlock
// read/wrote an EMPTY key and silently ignored every error, and file_dispute unmarshalled
// a raw 8-byte hash as a PanelEntropyAccum protobuf. The accumulator therefore never
// reached the dispute handler as intended.
//
// The repaired path below uses a real key, a proper PanelEntropyAccum encoding and fails
// closed. It changes state transitions, so it MUST NOT apply to blocks that were already
// produced with the old behaviour (a node replaying history would diverge). It only
// activates at AUDIT_FIX_HEIGHT. Left at MaxUint64 it is DISABLED and every block
// behaves exactly as before.
//
// To activate: pick a block height comfortably in the future of the live chain, set
// AUDIT_FIX_HEIGHT to it, release, and have every validator running the plugin upgrade
// before that height is reached.
//
// NOTE: this restores correctness/availability only. The accumulator is still a pure
// function of block height (SHA256(prev || height)), so panel selection is NOT
// unpredictable to someone who computes it ahead of time. See the audit report.
// ─────────────────────────────────────────────────────────────────────────────

// AUDIT_FIX_HEIGHT is the first block height that uses the repaired entropy path.
var AUDIT_FIX_HEIGHT uint64 = 64483

// PANEL_ENTROPY_KEY_V2 is the real accumulator key (KeyForPanelEntropy was never called before).
var PANEL_ENTROPY_KEY_V2 = KeyForPanelEntropy()

// AMOUNT_LOG_CANCEL_HEIGHT: from this height cancel_market tx-log entries carry the real
// PRX amount (Cost field). cancel_market was wired to amount logging first, in
// plugin-go-v2026.277 (commit 56a55810, which introduced this gate).
const AMOUNT_LOG_CANCEL_HEIGHT uint64 = 33_000

func amountLogCancelActive(height uint64) bool { return height >= AMOUNT_LOG_CANCEL_HEIGHT }

// AMOUNT_LOG_MARKET_CLAIM_HEIGHT: same for create_market/claim_winnings, which were wired
// one release later (commit 01336d73). Reusing 33000 is wrong — the chain had passed it by
// then, so canonical logged Cost=0 while a HEAD replay logs the amount and diverges (first
// seen at height 33196). Consensus-critical; anchored to the 01336d73 build (≈ height 33450),
// confirm against the real deploy height.
var AMOUNT_LOG_MARKET_CLAIM_HEIGHT uint64 = 33450

func amountLogMarketClaimActive(height uint64) bool {
	if AMOUNT_LOG_MARKET_CLAIM_HEIGHT == ^uint64(0) {
		return false
	}
	return height >= AMOUNT_LOG_MARKET_CLAIM_HEIGHT
}

func auditFixActive(height uint64) bool { return height >= AUDIT_FIX_HEIGHT }

// CANCEL_FIX_HEIGHT: first height where creator liquidity is returned.
// cancel_market refunds bond + reserve + LMSR seed; reclaim_stake pays
// the seed stranded in earlier cancelled markets. MaxUint64 = DISABLED.
// Set well ahead of the live tip; all nodes must be upgraded first.
var CANCEL_FIX_HEIGHT uint64 = 40805

func cancelFixActive(height uint64) bool {
return height >= CANCEL_FIX_HEIGHT || auditFixActive(height)
}

// entropyKeyFor returns the key file_dispute must read at the given height.
func entropyKeyFor(height uint64) []byte {
	if auditFixActive(height) {
		return PANEL_ENTROPY_KEY_V2
	}
	return PANEL_ENTROPY_KEY
}

// nextEntropy is the pure accumulator step: SHA256(prev || height)[:8]. Never returns 0
// so that "0" can mean "missing" to readers (a 2^-64 event).
func nextEntropy(prev, height uint64) uint64 {
	input := append(uint64ToBytes(prev), uint64ToBytes(height)...)
	sum := sha256.Sum256(input)
	next := binary.BigEndian.Uint64(sum[:8])
	if next == 0 {
		next = 1
	}
	return next
}

// advancePanelEntropyV2 reads the accumulator, advances it for this block and writes it
// back. Every failure is returned: BeginBlock must fail closed so all validators agree.
func (c *Contract) advancePanelEntropyV2(height uint64) *PluginError {
	qid := nextQueryId()
	resp, err := c.plugin.StateRead(c, &PluginStateReadRequest{
		Keys: []*PluginKeyRead{{QueryId: qid, Key: PANEL_ENTROPY_KEY_V2}},
	})
	if err != nil {
		return err
	}
	if resp == nil {
		return ErrInternal()
	}
	if resp.Error != nil {
		return resp.Error
	}
	var prev uint64
	for _, r := range resp.Results {
		if r.QueryId == qid && len(r.Entries) > 0 && len(r.Entries[0].Value) > 0 {
			acc := &PanelEntropyAccum{}
			if pe := Unmarshal(r.Entries[0].Value, acc); pe != nil {
				return pe
			}
			prev = acc.Accumulator
		}
	}
	raw, pe := SafeMarshal(&PanelEntropyAccum{Accumulator: nextEntropy(prev, height)})
	if pe != nil {
		return pe
	}
	wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{
		Sets: []*PluginSetOp{{Key: PANEL_ENTROPY_KEY_V2, Value: raw}},
	})
	return errCheckWrite(wr, werr)
}


// CREATE_MARKET_FIX_HEIGHT: first height whose create_market uses the repaired treasury
// read. Before plugin-go-v2026.276 the treasury Pool was unmarshalled from the market-index
// bytes (wire-type mismatch), so create_market errored and FAILED whenever the index was
// non-empty; the fix (v2026.276, un-gated) made it SUCCEED, so a HEAD replay diverges at the
// first affected create_market (height 5698). Below the gate the original erroring read is
// reproduced. Consensus-critical; anchored to the v2026.276 build (≈ height 26000), confirm
// against the real deploy height.
var CREATE_MARKET_FIX_HEIGHT uint64 = 26000

func createMarketFixActive(height uint64) bool {
	if CREATE_MARKET_FIX_HEIGHT == ^uint64(0) {
		return false
	}
	return height >= CREATE_MARKET_FIX_HEIGHT
}

// RESOLVER_REWARD_FIX_HEIGHT: first height whose EPOCHS use per-epoch resolver
// reward accounting (see resolver_epoch.go). Before it, claim_resolver_reward keeps the
// legacy all-time GlobalStats math. MaxUint64 = DISABLED. Consensus-critical:
// set well ahead of the live tip and upgrade every node first.
var RESOLVER_REWARD_FIX_HEIGHT uint64 = 59000

// resolverEpochFixed reports whether an epoch is settled with per-epoch accounting.
// Keyed on the epoch's first block so an epoch is never split between the two schemes.
func resolverEpochFixed(epoch uint64) bool {
	if RESOLVER_REWARD_FIX_HEIGHT == ^uint64(0) {
		return false
	}
	return epoch*PRIS_EPOCH_BLOCKS >= RESOLVER_REWARD_FIX_HEIGHT
}
