package contract

import (
	"crypto/sha256"
	"encoding/binary"
	"sort"
)

// ─────────────────────────────────────────────────────────────────────────────
// Resolver / dispute / creator fixes, v2 — ONE height gate.
//
// These change state transitions, so they MUST NOT apply to blocks already
// produced. Left at MaxUint64 they are DISABLED and every handler behaves
// byte-for-byte as before. scripts/set_activation.sh sets this (and
// AUDIT_FIX_HEIGHT, which switches on the repaired panel-entropy accumulator).
//
// What the gate changes:
//   (resolver reward epochs: already handled by RESOLVER_REWARD_FIX_HEIGHT)
//   finalize_market   proposal bond returns to the proposer's STAKE; caller /
//                     proposer / creator / disputer account aliasing fixed;
//                     NO_QUORUM disputes finalize as undisputed (bond refunded);
//                     slash record is per-market and carries only the
//                     proposer's share.
//   claim_slash       winner is paid the slash + the resolver fee pool, and is
//                     NOT penalised; reads the per-market slash record.
//   tally_votes       rewritten: quorum, non-voter RRS penalty, panel reward
//                     (50% of the loser's bond to winning-side voters), loser
//                     proposer penalised, fee pools swept on void, locks freed.
//   file_dispute      candidate scan actually matches resolver records (it matched
//                     nothing, so NO dispute could ever be filed); flat 48h window; minimum dispute bond; panel limited to
//                     active, staked resolvers; seed bound to market/disputer/tx;
//                     panel members get an unstake lock.
//   propose_outcome   proposer must be active; proposer gets an unstake lock.
//   unstake_resolver  full exit refused while the resolver has open obligations.
//   claim_winnings    CLAIM_GRACE_PERIOD_V2 (30 days) instead of 1,000 blocks;
//                     auto-cancel waits PROPOSAL_WINDOW_V2 instead of 300 blocks.
//   reclaim_stake     same window; flips the market to CANCELLED so a late
//                     proposal can no longer dilute winners.
//   forfeit_position  only a registered resolver, on an expired OPEN market
//                     with no proposal; share totals kept consistent.
// ─────────────────────────────────────────────────────────────────────────────

var RESOLVER_FIX_HEIGHT uint64 = 64483

func resolverFixActive(height uint64) bool { return height >= RESOLVER_FIX_HEIGHT }

const (
	// CLAIM_GRACE_PERIOD_V2 ≈ 30 days at 10s blocks.
	CLAIM_GRACE_PERIOD_V2 uint64 = 259_200
	// PROPOSAL_WINDOW_V2 ≈ 24h at 10s blocks: how long after expiry resolvers
	// have to propose before bettors can cancel/reclaim.
	PROPOSAL_WINDOW_V2 uint64 = 8_640
	// VOTE_NO_QUORUM: reveal quorum not reached; the proposal stands undisputed.
	VOTE_NO_QUORUM uint32 = 4
	// NONVOTE_RRS_PENALTY is taken from every panel member who did not reveal.
	NONVOTE_RRS_PENALTY uint64 = 10
	// VOTER_SHARE_BPS of the losing side's bond is paid to winning-side voters.
	VOTER_SHARE_BPS uint64 = 5000
	// LOSING_PROPOSER_RRS_PENALTY applies when the disputer wins.
	LOSING_PROPOSER_RRS_PENALTY uint64 = 50
)

func addSat(a, b uint64) uint64 {
	if a > ^uint64(0)-b {
		return ^uint64(0)
	}
	return a + b
}

func subOrZero(a, b uint64) uint64 {
	if a < b {
		return 0
	}
	return a - b
}

// ComputeDisputeBlocksAt: flat 48h (MIN_DISPUTE_BLOCKS) once the fix is active.
func ComputeDisputeBlocksAt(now, openTime, expiryTime uint64) uint64 {
	if resolverFixActive(now) && !TEST_MODE {
		return MIN_DISPUTE_BLOCKS
	}
	return ComputeDisputeBlocks(openTime, expiryTime)
}

// panelSeedV2 binds the panel draw to the market, proposer, disputer, filing tx and
// block, so it is no longer "accumulator XOR height". NOTE: still deterministic —
// see the delivery notes: a delayed draw needs a new tx type.
func panelSeedV2(entropy uint64, marketId []byte, p *ProposalRecord, disputer []byte, txHash string, now uint64) uint64 {
	h := sha256.New()
	h.Write(uint64ToBytes(entropy))
	h.Write(marketId)
	h.Write(p.ResolverAddr)
	h.Write(uint64ToBytes(p.ProposalBlock))
	h.Write(disputer)
	h.Write([]byte(txHash))
	h.Write(uint64ToBytes(now))
	return binary.BigEndian.Uint64(h.Sum(nil)[:8])
}

func ErrResolverLocked() *PluginError {
	return &PluginError{Code: 220, Module: errModule, Msg: "resolver has open proposals or dispute panels"}
}

// resolverScanPrefix: stored keys are length-prefixed (0x01 0x16 0x14 <addr>), so the
// candidate scan in file_dispute must use JoinLenPrefix(prefix). The legacy raw {0x16}
// prefix matches nothing, which makes every dispute fail with
// ErrInsufficientPanelCandidates on a live chain.
func resolverScanPrefix(now uint64) []byte {
	if resolverFixActive(now) {
		return JoinLenPrefix(resolverRecordPrefix)
	}
	return resolverRecordPrefix
}

// ── read helpers ─────────────────────────────────────────────────────────────

func (c *Contract) readKeys(keys map[uint64][]byte) (map[uint64][]byte, *PluginError) {
	reads := make([]*PluginKeyRead, 0, len(keys))
	for q, k := range keys {
		reads = append(reads, &PluginKeyRead{QueryId: q, Key: k})
	}
	sort.Slice(reads, func(i, j int) bool { return reads[i].QueryId < reads[j].QueryId })
	resp, err := c.plugin.StateRead(c, &PluginStateReadRequest{Keys: reads})
	if err != nil {
		return nil, err
	}
	if resp == nil {
		return nil, ErrInternal()
	}
	if resp.Error != nil {
		return nil, resp.Error
	}
	out := make(map[uint64][]byte, len(keys))
	for _, r := range resp.Results {
		if len(r.Entries) > 0 && len(r.Entries[0].Value) > 0 {
			out[r.QueryId] = r.Entries[0].Value
		}
	}
	return out, nil
}

func unmarshalIf(raw []byte, ptr any) *PluginError {
	if len(raw) == 0 {
		return nil
	}
	return Unmarshal(raw, ptr)
}

// ── resolver obligation locks ────────────────────────────────────────────────

func (c *Contract) lockOps(addrs [][]byte, delta int) ([]*PluginSetOp, *PluginError) {
	seen := map[string]bool{}
	qids := map[string]uint64{}
	keys := map[uint64][]byte{}
	var order [][]byte
	for _, a := range addrs {
		if len(a) != 20 || seen[string(a)] {
			continue
		}
		seen[string(a)] = true
		q := nextQueryId()
		qids[string(a)] = q
		keys[q] = KeyForResolverLock(a)
		order = append(order, a)
	}
	if len(order) == 0 {
		return nil, nil
	}
	vals, err := c.readKeys(keys)
	if err != nil {
		return nil, err
	}
	ops := make([]*PluginSetOp, 0, len(order))
	for _, a := range order {
		p := &Pool{}
		if pe := unmarshalIf(vals[qids[string(a)]], p); pe != nil {
			return nil, pe
		}
		if delta > 0 {
			p.Amount++
		} else if p.Amount > 0 {
			p.Amount--
		}
		raw, pe := SafeMarshal(p)
		if pe != nil {
			return nil, pe
		}
		ops = append(ops, &PluginSetOp{Key: KeyForResolverLock(a), Value: raw})
	}
	return ops, nil
}

func (c *Contract) resolverLocked(addr []byte) (bool, *PluginError) {
	q := nextQueryId()
	vals, err := c.readKeys(map[uint64][]byte{q: KeyForResolverLock(addr)})
	if err != nil {
		return false, err
	}
	p := &Pool{}
	if pe := unmarshalIf(vals[q], p); pe != nil {
		return false, pe
	}
	return p.Amount > 0, nil
}

// ── account overlay (one object per address, so aliased parties never overwrite) ─

type acctBook struct {
	m     map[string]*Account
	order []string
}

func (c *Contract) loadAccts(addrs [][]byte) (*acctBook, *PluginError) {
	b := &acctBook{m: map[string]*Account{}}
	keys := map[uint64][]byte{}
	qids := map[string]uint64{}
	for _, a := range addrs {
		if len(a) != 20 {
			continue
		}
		if _, dup := b.m[string(a)]; dup {
			continue
		}
		b.m[string(a)] = &Account{}
		b.order = append(b.order, string(a))
		q := nextQueryId()
		qids[string(a)] = q
		keys[q] = KeyForAccount(a)
	}
	if len(keys) == 0 {
		return b, nil
	}
	vals, err := c.readKeys(keys)
	if err != nil {
		return nil, err
	}
	for a, q := range qids {
		if pe := unmarshalIf(vals[q], b.m[a]); pe != nil {
			return nil, pe
		}
	}
	return b, nil
}

func (b *acctBook) credit(addr []byte, amt uint64) *PluginError {
	a := b.m[string(addr)]
	if a == nil || a.Amount > ^uint64(0)-amt {
		return ErrInvalidAmount()
	}
	a.Amount += amt
	return nil
}

func (b *acctBook) ops() ([]*PluginSetOp, *PluginError) {
	out := make([]*PluginSetOp, 0, len(b.order))
	for _, k := range b.order {
		raw, pe := SafeMarshal(b.m[k])
		if pe != nil {
			return nil, pe
		}
		out = append(out, &PluginSetOp{Key: KeyForAccount([]byte(k)), Value: raw})
	}
	return out, nil
}

// splitByWeight divides total across weights; the last entry takes the remainder
// so the amounts always sum to exactly total.
func splitByWeight(total uint64, weights []uint64) []uint64 {
	out := make([]uint64, len(weights))
	var sum uint64
	for _, w := range weights {
		sum = addSat(sum, w)
	}
	if sum == 0 {
		return out
	}
	var paid uint64
	for i := 0; i < len(weights)-1; i++ {
		s := mulDiv(total, weights[i], sum)
		out[i] = s
		paid += s
	}
	if len(weights) > 0 {
		out[len(weights)-1] = total - paid
	}
	return out
}

// ── forfeit_position guard ───────────────────────────────────────────────────

func (c *Contract) forfeitGuard(marketId, resolver []byte, now uint64) (*MarketState, *PluginError) {
	mq, rq, pq := nextQueryId(), nextQueryId(), nextQueryId()
	vals, err := c.readKeys(map[uint64][]byte{
		mq: KeyForMarket(marketId),
		rq: KeyForResolverRecord(resolver),
		pq: KeyForProposal(marketId),
	})
	if err != nil {
		return nil, err
	}
	if len(vals[mq]) == 0 {
		return nil, ErrMarketNotFound()
	}
	market := &MarketState{}
	if pe := Unmarshal(vals[mq], market); pe != nil {
		return nil, pe
	}
	if len(vals[rq]) == 0 {
		return nil, ErrResolverNotRegistered()
	}
	if market.Status != STATUS_OPEN {
		return nil, ErrMarketNotOpen()
	}
	if now <= market.ExpiryTime {
		return nil, ErrMarketNotExpired()
	}
	if len(vals[pq]) > 0 {
		return nil, ErrAlreadyProposed()
	}
	return market, nil
}
