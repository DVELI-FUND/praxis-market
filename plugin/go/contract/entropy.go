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
var AUDIT_FIX_HEIGHT uint64 = ^uint64(0)

// PANEL_ENTROPY_KEY_V2 is the real accumulator key (KeyForPanelEntropy was never called before).
var PANEL_ENTROPY_KEY_V2 = KeyForPanelEntropy()

func auditFixActive(height uint64) bool { return height >= AUDIT_FIX_HEIGHT }

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
