package contract

import "testing"

// ── helpers ──────────────────────────────────────────────────────────────────

func fixAt(t *testing.T, h uint64) {
	t.Helper()
	old, oldR := RESOLVER_FIX_HEIGHT, RESOLVER_REWARD_FIX_HEIGHT
	RESOLVER_FIX_HEIGHT, RESOLVER_REWARD_FIX_HEIGHT = h, noFix
	t.Cleanup(func() { RESOLVER_FIX_HEIGHT, RESOLVER_REWARD_FIX_HEIGHT = old, oldR })
}

func putMsg(t *testing.T, fc *fakeChain, key []byte, m interface{}) {
	t.Helper()
	raw, pe := SafeMarshal(m)
	if pe != nil {
		t.Fatal(pe)
	}
	fc.set(key, raw)
}

func getRec(t *testing.T, fc *fakeChain, a []byte) *ResolverRecord {
	t.Helper()
	r := &ResolverRecord{}
	if v := fc.get(KeyForResolverRecord(a)); len(v) > 0 {
		if pe := Unmarshal(v, r); pe != nil {
			t.Fatal(pe)
		}
	}
	return r
}

func getMarket(t *testing.T, fc *fakeChain, mid []byte) *MarketState {
	t.Helper()
	m := &MarketState{}
	if pe := Unmarshal(fc.get(KeyForMarket(mid)), m); pe != nil {
		t.Fatal(pe)
	}
	return m
}

func seedResolver(t *testing.T, fc *fakeChain, a []byte, rrs, stake uint64, active bool) {
	t.Helper()
	putMsg(t, fc, KeyForResolverRecord(a), &ResolverRecord{ResolverAddress: a, RrsScore: rrs, StakeAmount: stake, IsActive: active})
}

func lockOf(fc *fakeChain, a []byte) uint64 { return fc.pool(KeyForResolverLock(a)) }

const testBond = 60_000_000

func ok(t *testing.T, r *PluginDeliverResponse) {
	t.Helper()
	if r.Error != nil {
		t.Fatalf("unexpected error: %+v", r.Error)
	}
}

func bothModes(t *testing.T, f func(t *testing.T, fixed bool)) {
	for _, fixed := range []bool{false, true} {
		h := noFix
		if fixed {
			h = 1
		}
		fixAt(t, h)
		f(t, fixed)
	}
}

// finalizable seeds a PROPOSED, undisputed market.
func finalizable(t *testing.T) (*Contract, *fakeChain, []byte, []byte, []byte) {
	c, fc := newTestChain(t)
	creator, resolver := addr(0xC1), addr(0xD1)
	mid := DeriveMarketId(creator, 1)
	putMsg(t, fc, KeyForMarket(mid), &MarketState{Status: STATUS_PROPOSED, Creator: creator, OpenTime: 1, ExpiryTime: 10, QYes: 1000, QNo: 1000})
	putMsg(t, fc, KeyForProposal(mid), &ProposalRecord{ResolverAddr: resolver, ProposedOutcome: true, ProposalBond: testBond, ProposalBlock: 20})
	putMsg(t, fc, KeyForTreasuryReserve(mid), &TreasuryReserve{LockedReserve: FINALIZATION_BOUNTY, CreatorBond: CREATOR_BOND})
	seedResolver(t, fc, resolver, 10, MIN_RESOLVER_STAKE-testBond, true)
	putMsg(t, fc, KeyForMarketPool(mid), &Pool{Amount: 5_000_000})
	SetGlobalHeight(20 + MIN_DISPUTE_BLOCKS + 5)
	return c, fc, mid, creator, resolver
}

// ── finalize: bond to stake + account aliasing ───────────────────────────────

func TestV2FinalizeBondAndSelfFinalizeBounty(t *testing.T) {
	bothModes(t, func(t *testing.T, fixed bool) {
		c, fc, mid, creator, resolver := finalizable(t)
		fc.putAccount(t, resolver, 1_000) // resolver finalizes its own proposal
		ok(t, c.DeliverMessageFinalizeMarket(&MessageFinalizeMarket{MarketId: mid, CallerAddr: resolver}, 0, "h"))
		stake, bal := getRec(t, fc, resolver).StakeAmount, fc.account(resolver)
		if fixed {
			if stake != MIN_RESOLVER_STAKE || bal != 1_000+FINALIZATION_BOUNTY {
				t.Fatalf("fixed: stake %d bal %d", stake, bal)
			}
		} else if stake != MIN_RESOLVER_STAKE-testBond || bal != 1_000 {
			t.Fatalf("legacy documented bug changed: stake %d bal %d", stake, bal)
		}
		if got := fc.account(creator); got != CREATOR_BOND {
			t.Fatalf("creator bond %d", got)
		}
	})
}

func TestV2FlatDisputeWindowOnFinalize(t *testing.T) {
	bothModes(t, func(t *testing.T, fixed bool) {
		c, fc, mid, creator, _ := finalizable(t)
		// 1-year-ish market: legacy window = duration/10, fixed = flat 48h.
		m := getMarket(t, fc, mid)
		m.ExpiryTime = 3_000_000
		putMsg(t, fc, KeyForMarket(mid), m)
		SetGlobalHeight(20 + MIN_DISPUTE_BLOCKS + 5)
		r := c.DeliverMessageFinalizeMarket(&MessageFinalizeMarket{MarketId: mid, CallerAddr: addr(0xAA)}, 0, "h")
		if fixed && r.Error != nil {
			t.Fatalf("fixed: flat window must allow finalize, got %+v", r.Error)
		}
		if !fixed && r.Error == nil {
			t.Fatal("legacy: expected the long 10% window to block finalize")
		}
		_ = creator
	})
}

// ── dispute filing rules ─────────────────────────────────────────────────────

func disputable(t *testing.T) (*Contract, *fakeChain, []byte, []byte, []byte) {
	c, fc := newTestChain(t)
	creator, proposer, disputer := addr(0xC1), addr(0xD1), addr(0xE1)
	mid := DeriveMarketId(creator, 1)
	putMsg(t, fc, KeyForMarket(mid), &MarketState{Status: STATUS_PROPOSED, Creator: creator, OpenTime: 1, ExpiryTime: 3_000_000, QYes: 1000, QNo: 1000})
	putMsg(t, fc, KeyForProposal(mid), &ProposalRecord{ResolverAddr: proposer, ProposedOutcome: true, ProposalBond: testBond, ProposalBlock: 20})
	seedResolver(t, fc, proposer, 10, MIN_RESOLVER_STAKE, true)
	seedResolver(t, fc, addr(0xF1), 10, MIN_RESOLVER_STAKE, true)  // eligible
	seedResolver(t, fc, addr(0xF2), 10, 0, false)                  // fully exited
	seedResolver(t, fc, addr(0xF3), 10, MIN_RESOLVER_STAKE/2, true) // under-staked
	fc.putAccount(t, disputer, 1_000_000_000)
	SetGlobalHeight(100)
	return c, fc, mid, proposer, disputer
}

func TestV2DisputeMinBondAndPanelEligibility(t *testing.T) {
	// legacy: the resolver scan matches nothing, so no dispute can ever be filed.
	fixAt(t, noFix)
	c, _, mid, _, disputer := disputable(t)
	if r := c.DeliverMessageFileDispute(&MessageFileDispute{MarketId: mid, DisputerAddress: disputer, DisputeBond: MIN_B0}, 0, "tx"); r.Error == nil {
		t.Fatal("legacy: expected disputes to be impossible (panel scan matches nothing)")
	}
	var fc *fakeChain
	var d *DisputeRecord

	fixAt(t, 1)
	c, fc, mid, _, disputer = disputable(t)
	if r := c.DeliverMessageFileDispute(&MessageFileDispute{MarketId: mid, DisputerAddress: disputer, DisputeBond: 1}, 0, "tx"); r.Error == nil {
		t.Fatal("fixed: dust dispute bond must be rejected")
	}
	ok(t, c.DeliverMessageFileDispute(&MessageFileDispute{MarketId: mid, DisputerAddress: disputer, DisputeBond: MIN_B0}, 0, "tx"))
	d = &DisputeRecord{}
	Unmarshal(fc.get(KeyForDispute(mid)), d)
	if len(d.PanelMembers) != 1 || !bytesEqual(d.PanelMembers[0], addr(0xF1)) {
		t.Fatalf("fixed: panel must be only the active, staked resolver, got %d", len(d.PanelMembers))
	}
	if lockOf(fc, addr(0xF1)) != 1 {
		t.Fatal("fixed: panel member must be locked")
	}
	// flat window: filing after 48h is rejected even on a very long market
	c, fc, mid, _, disputer = disputable(t)
	SetGlobalHeight(20 + MIN_DISPUTE_BLOCKS + 2)
	if r := c.DeliverMessageFileDispute(&MessageFileDispute{MarketId: mid, DisputerAddress: disputer, DisputeBond: MIN_B0}, 0, "tx"); r.Error == nil {
		t.Fatal("fixed: dispute after the flat 48h window must be rejected")
	}
}

// ── tally ────────────────────────────────────────────────────────────────────

type tallyScene struct {
	c                                  *Contract
	fc                                 *fakeChain
	mid, creator, proposer, disputer   []byte
	panel                              [][]byte
}

func newTally(t *testing.T, votes map[byte]int) *tallyScene { // votes: 1=yes(disputer) 0=no -1=absent
	c, fc := newTestChain(t)
	s := &tallyScene{c: c, fc: fc, creator: addr(0xC1), proposer: addr(0xD1), disputer: addr(0xE1)}
	s.mid = DeriveMarketId(s.creator, 1)
	putMsg(t, fc, KeyForMarket(s.mid), &MarketState{Status: STATUS_DISPUTED, Creator: s.creator, OpenTime: 1, ExpiryTime: 10})
	putMsg(t, fc, KeyForProposal(s.mid), &ProposalRecord{ResolverAddr: s.proposer, ProposalBond: testBond, ProposalBlock: 20})
	for _, b := range []byte{0xF1, 0xF2, 0xF3} {
		s.panel = append(s.panel, addr(b))
		seedResolver(t, fc, addr(b), 10, MIN_RESOLVER_STAKE, true)
		putMsg(t, fc, KeyForResolverLock(addr(b)), &Pool{Amount: 1})
		switch votes[b] {
		case 1:
			putMsg(t, fc, KeyForVoteReveal(s.mid, addr(b)), &VoteReveal{VoterAddr: addr(b), Vote: true})
		case 0:
			putMsg(t, fc, KeyForVoteReveal(s.mid, addr(b)), &VoteReveal{VoterAddr: addr(b), Vote: false})
		}
	}
	seedResolver(t, fc, s.proposer, 60, MIN_RESOLVER_STAKE-testBond, true)
	putMsg(t, fc, KeyForResolverLock(s.proposer), &Pool{Amount: 1})
	putMsg(t, fc, KeyForDispute(s.mid), &DisputeRecord{DisputerAddress: s.disputer, DisputeBond: 120_000_000, DisputeBlock: 10, VoteStatus: VOTE_PENDING, PanelSize: 3, PanelMembers: s.panel})
	putMsg(t, fc, KeyForTreasuryReserve(s.mid), &TreasuryReserve{LockedReserve: FINALIZATION_BOUNTY, CreatorBond: CREATOR_BOND})
	putMsg(t, fc, KeyForCreatorFeePool(s.mid), &Pool{Amount: 100})
	putMsg(t, fc, KeyForResolverFeePool(s.mid), &Pool{Amount: 200})
	putMsg(t, fc, KeyForMarketPool(s.mid), &Pool{Amount: 5_000_000})
	SetGlobalHeight(10 + COMMIT_PHASE_BLOCKS + REVEAL_PHASE_BLOCKS + 5)
	return s
}

func (s *tallyScene) tally(t *testing.T) { ok(t, s.c.DeliverMessageTallyVotes(&MessageTallyVotes{MarketId: s.mid, CallerAddr: addr(0xAA)}, 0)) }

func TestV2TallyDisputerWinsRewardsVotersPenalisesLoser(t *testing.T) {
	fixAt(t, 1)
	s := newTally(t, map[byte]int{0xF1: 1, 0xF2: 1, 0xF3: -1})
	s.tally(t)
	fc := s.fc
	if getMarket(t, fc, s.mid).Status != STATUS_VOIDED {
		t.Fatal("market must be VOIDED")
	}
	if rrs := getRec(t, fc, s.proposer).RrsScore; rrs != 10 {
		t.Fatalf("losing proposer RRS %d, want 10", rrs)
	}
	if rrs := getRec(t, fc, addr(0xF3)).RrsScore; rrs != 0 {
		t.Fatalf("non-voter RRS %d, want 0", rrs)
	}
	// 50% of the proposer's bond to winning voters (equal weights), 50% to the disputer
	if fc.account(addr(0xF1)) != testBond/4 || fc.account(addr(0xF2)) != testBond/4 {
		t.Fatalf("voter rewards %d / %d", fc.account(addr(0xF1)), fc.account(addr(0xF2)))
	}
	if got := fc.account(s.disputer); got != 120_000_000+testBond/2 {
		t.Fatalf("disputer got %d", got)
	}
	if got := fc.account(s.creator); got != CREATOR_BOND+FINALIZATION_BOUNTY {
		t.Fatalf("creator escrow %d", got)
	}
	if fc.pool(KeyForTreasuryPool()) != 300 {
		t.Fatalf("treasury %d, want swept fee pools", fc.pool(KeyForTreasuryPool()))
	}
	for _, a := range append(s.panel, s.proposer) {
		if lockOf(fc, a) != 0 {
			t.Fatalf("lock not released for %x", a[:1])
		}
	}
}

func TestV2TallyNoQuorumRefundsDisputerAndProposalStands(t *testing.T) {
	fixAt(t, 1)
	s := newTally(t, map[byte]int{0xF1: 1, 0xF2: -1, 0xF3: -1})
	s.tally(t)
	fc := s.fc
	d := &DisputeRecord{}
	Unmarshal(fc.get(KeyForDispute(s.mid)), d)
	if d.VoteStatus != VOTE_NO_QUORUM || getMarket(t, fc, s.mid).Status != STATUS_DISPUTED {
		t.Fatalf("expected NO_QUORUM on a still-DISPUTED market, got %d", d.VoteStatus)
	}
	if getRec(t, fc, addr(0xF2)).RrsScore != 0 || getRec(t, fc, addr(0xF1)).RrsScore != 10 {
		t.Fatal("only non-voters are penalised")
	}
	for _, a := range s.panel {
		if lockOf(fc, a) != 0 {
			t.Fatal("panel locks must be released")
		}
	}
	// the proposal stands: finalize pays the proposer, refunds the disputer, returns the bond
	ok(t, s.c.DeliverMessageFinalizeMarket(&MessageFinalizeMarket{MarketId: s.mid, CallerAddr: addr(0xAA)}, 0, "h"))
	if getMarket(t, fc, s.mid).Status != STATUS_FINALIZED {
		t.Fatal("must finalize")
	}
	if fc.account(s.disputer) != 120_000_000 {
		t.Fatalf("disputer refund %d", fc.account(s.disputer))
	}
	rec := getRec(t, fc, s.proposer)
	if rec.RrsScore != 70 || rec.StakeAmount != MIN_RESOLVER_STAKE {
		t.Fatalf("proposer rrs %d stake %d", rec.RrsScore, rec.StakeAmount)
	}
	if lockOf(fc, s.proposer) != 0 {
		t.Fatal("proposer lock must be released at finalize")
	}
}

func TestV2TallyProposerWinsSplitsBondAndPaysSlash(t *testing.T) {
	fixAt(t, 1)
	s := newTally(t, map[byte]int{0xF1: 0, 0xF2: 0, 0xF3: -1})
	s.tally(t)
	fc := s.fc
	if rrs := getRec(t, fc, s.proposer).RrsScore; rrs != 80 {
		t.Fatalf("winning proposer RRS %d, want 80", rrs)
	}
	if fc.account(addr(0xF1)) != 30_000_000 || fc.account(addr(0xF2)) != 30_000_000 {
		t.Fatalf("voter rewards %d / %d", fc.account(addr(0xF1)), fc.account(addr(0xF2)))
	}
	if fc.account(s.disputer) != 0 {
		t.Fatal("losing disputer gets nothing back")
	}
	ok(t, s.c.DeliverMessageFinalizeMarket(&MessageFinalizeMarket{MarketId: s.mid, CallerAddr: addr(0xAA)}, 0, "h"))
	if len(fc.get(KeyForSlashRecord(s.disputer))) != 0 {
		t.Fatal("fixed mode must not write the legacy per-disputer slash key")
	}
	slash := &SlashRecord{}
	if pe := Unmarshal(fc.get(KeyForSlashRecordV2(s.mid, s.disputer)), slash); pe != nil || slash.SlashAmount != 60_000_000 {
		t.Fatalf("slash record: %v amount %d", pe, slash.SlashAmount)
	}
	fc.putAccount(t, s.proposer, 5)
	ok(t, s.c.DeliverMessageClaimSlash(&MessageClaimSlash{MarketId: s.mid, ClaimantAddress: s.proposer}, 0))
	if got := fc.account(s.proposer); got != 5+60_000_000+200 {
		t.Fatalf("winner paid %d", got)
	}
	if rrs := getRec(t, fc, s.proposer).RrsScore; rrs != 80 {
		t.Fatalf("winner RRS must not be penalised, got %d", rrs)
	}
}

func TestV2ClaimSlashStillReadsLegacyRecord(t *testing.T) {
	fixAt(t, 1)
	c, fc := newTestChain(t)
	creator, resolver, disputer := addr(0xC1), addr(0xD1), addr(0xE1)
	mid := DeriveMarketId(creator, 1)
	putMsg(t, fc, KeyForMarket(mid), &MarketState{Status: STATUS_FINALIZED, Creator: creator})
	putMsg(t, fc, KeyForProposal(mid), &ProposalRecord{ResolverAddr: resolver})
	putMsg(t, fc, KeyForDispute(mid), &DisputeRecord{DisputerAddress: disputer, DisputeBond: 5_000_000, VoteStatus: VOTE_TALLIED})
	putMsg(t, fc, KeyForSlashRecord(disputer), &SlashRecord{SlashedAddress: disputer, SlashAmount: 5_000_000})
	putMsg(t, fc, KeyForTreasuryReserve(mid), &TreasuryReserve{})
	seedResolver(t, fc, resolver, 30, MIN_RESOLVER_STAKE, true)
	SetGlobalHeight(100)
	ok(t, c.DeliverMessageClaimSlash(&MessageClaimSlash{MarketId: mid, ClaimantAddress: resolver}, 0))
	if fc.account(resolver) != 5_000_000 {
		t.Fatalf("legacy slash record not paid: %d", fc.account(resolver))
	}
}

// ── locks ────────────────────────────────────────────────────────────────────

func TestV2ProposerLockBlocksFullExitUntilFinalized(t *testing.T) {
	fixAt(t, 1)
	c, fc := newTestChain(t)
	creator, res := addr(0xC1), addr(0xD1)
	mid := DeriveMarketId(creator, 1)
	putMsg(t, fc, KeyForMarket(mid), &MarketState{Status: STATUS_OPEN, Creator: creator, OpenTime: 1, ExpiryTime: 50, QYes: 1000, QNo: 1000})
	putMsg(t, fc, KeyForTreasuryReserve(mid), &TreasuryReserve{LockedReserve: FINALIZATION_BOUNTY, CreatorBond: CREATOR_BOND})
	seedResolver(t, fc, res, 10, MIN_RESOLVER_STAKE, true)
	fc.putAccount(t, res, 1_000_000)
	SetGlobalHeight(60)
	ok(t, c.DeliverMessageProposeOutcome(&MessageProposeOutcome{MarketId: mid, ResolverAddress: res, ProposedOutcome: true, ProposalBond: MIN_B0}, 0, "p"))
	if lockOf(fc, res) != 1 {
		t.Fatal("proposer must be locked")
	}
	if r := c.DeliverMessageUnstakeResolver(&MessageUnstakeResolver{ResolverAddress: res}, 0); r.Error == nil {
		t.Fatal("full exit must be refused while a proposal is open")
	}
	SetGlobalHeight(60 + MIN_DISPUTE_BLOCKS + 1)
	ok(t, c.DeliverMessageFinalizeMarket(&MessageFinalizeMarket{MarketId: mid, CallerAddr: addr(0xAA)}, 0, "f"))
	if lockOf(fc, res) != 0 {
		t.Fatal("lock must clear at finalize")
	}
	ok(t, c.DeliverMessageUnstakeResolver(&MessageUnstakeResolver{ResolverAddress: res}, 0))
}

func TestV2InactiveResolverCannotPropose(t *testing.T) {
	fixAt(t, 1)
	c, fc := newTestChain(t)
	creator, res := addr(0xC1), addr(0xD1)
	mid := DeriveMarketId(creator, 1)
	putMsg(t, fc, KeyForMarket(mid), &MarketState{Status: STATUS_OPEN, Creator: creator, OpenTime: 1, ExpiryTime: 50})
	seedResolver(t, fc, res, 10, MIN_RESOLVER_STAKE, false)
	SetGlobalHeight(60)
	if r := c.DeliverMessageProposeOutcome(&MessageProposeOutcome{MarketId: mid, ResolverAddress: res, ProposedOutcome: true, ProposalBond: MIN_B0}, 0, "p"); r.Error == nil {
		t.Fatal("inactive resolver must not propose")
	}
}

// ── proposal window / reclaim ────────────────────────────────────────────────

func openExpired(t *testing.T) (*Contract, *fakeChain, []byte, []byte, []byte) {
	c, fc := newTestChain(t)
	creator, bettor := addr(0xC1), addr(0xB1)
	mid := DeriveMarketId(creator, 1)
	putMsg(t, fc, KeyForMarket(mid), &MarketState{Status: STATUS_OPEN, Creator: creator, OpenTime: 1, ExpiryTime: 50, QYes: 500, QNo: 500, TotalPositions: 1})
	putMsg(t, fc, KeyForPosition(mid, bettor), &PositionState{SharesYes: 100, CostPaid: 1_000_000})
	putMsg(t, fc, KeyForMarketPool(mid), &Pool{Amount: 9_000_000})
	putMsg(t, fc, KeyForTreasuryReserve(mid), &TreasuryReserve{LockedReserve: FINALIZATION_BOUNTY, CreatorBond: CREATOR_BOND})
	fc.putAccount(t, bettor, 10)
	return c, fc, mid, creator, bettor
}

func TestV2ReclaimWaitsForProposalWindowThenCancels(t *testing.T) {
	bothModes(t, func(t *testing.T, fixed bool) {
		c, fc, mid, _, bettor := openExpired(t)
		SetGlobalHeight(50 + 400) // past the legacy 300-block window, inside the 24h window
		r := c.DeliverMessageReclaimStake(&MessageReclaimStake{MarketId: mid, ClaimantAddress: bettor}, 0)
		if fixed && r.Error == nil {
			t.Fatal("fixed: reclaim inside the proposal window must be rejected")
		}
		if !fixed {
			ok(t, r)
			if getMarket(t, fc, mid).Status != STATUS_OPEN {
				t.Fatal("legacy: market stays OPEN after reclaim (documented bug)")
			}
			return
		}
		SetGlobalHeight(50 + PROPOSAL_WINDOW_V2 + 1)
		ok(t, c.DeliverMessageReclaimStake(&MessageReclaimStake{MarketId: mid, ClaimantAddress: bettor}, 0))
		if getMarket(t, fc, mid).Status != STATUS_CANCELLED {
			t.Fatal("fixed: reclaim must flip the market to CANCELLED")
		}
		if fc.account(bettor) != 10+1_000_000 {
			t.Fatalf("refund %d", fc.account(bettor))
		}
	})
}

func TestV2AutoCancelUsesProposalWindow(t *testing.T) {
	bothModes(t, func(t *testing.T, fixed bool) {
		c, _, mid, _, _ := openExpired(t)
		SetGlobalHeight(50 + 400)
		m, err := c.CheckAutoCancel(mid)
		if err != nil {
			t.Fatal(err)
		}
		if fixed && m != nil {
			t.Fatal("fixed: no auto-cancel inside the 24h proposal window")
		}
		if !fixed && m == nil {
			t.Fatal("legacy: auto-cancel after 300 blocks")
		}
		SetGlobalHeight(50 + PROPOSAL_WINDOW_V2 + 1)
		if m, _ = c.CheckAutoCancel(mid); fixed && m == nil {
			t.Fatal("fixed: auto-cancel once the window has passed")
		}
	})
}

// ── forfeit + claim grace ────────────────────────────────────────────────────

func TestV2ForfeitPositionGate(t *testing.T) {
	bothModes(t, func(t *testing.T, fixed bool) {
		c, fc := newTestChain(t)
		creator, bettor := addr(0xC1), addr(0xB1)
		mid := DeriveMarketId(creator, 1)
		putMsg(t, fc, KeyForMarket(mid), &MarketState{Status: STATUS_FINALIZED, Creator: creator, QYes: 500, QNo: 500, TotalPositions: 1})
		putMsg(t, fc, KeyForPosition(mid, bettor), &PositionState{SharesNo: 100, CostPaid: 1_000_000})
		putMsg(t, fc, KeyForMarketPool(mid), &Pool{Amount: 9_000_000})
		fc.putAccount(t, bettor, 10)
		r := c.DeliverMessageForfeitPosition(&MessageForfeitPosition{MarketId: mid, ResolverAddress: bettor}, 0)
		if fixed && r.Error == nil {
			t.Fatal("fixed: forfeit on a FINALIZED market by a non-resolver must fail")
		}
		if !fixed && (r.Error != nil || fc.account(bettor) != 10+1_000_000) {
			t.Fatal("legacy: loser could take their cost back after finalization")
		}
	})
	fixAt(t, 1)
	c, fc := newTestChain(t)
	creator, res := addr(0xC1), addr(0xD1)
	mid := DeriveMarketId(creator, 2)
	putMsg(t, fc, KeyForMarket(mid), &MarketState{Status: STATUS_OPEN, Creator: creator, ExpiryTime: 50, QYes: 500, QNo: 500, TotalPositions: 2})
	putMsg(t, fc, KeyForPosition(mid, res), &PositionState{SharesYes: 100, CostPaid: 1_000_000})
	putMsg(t, fc, KeyForMarketPool(mid), &Pool{Amount: 9_000_000})
	seedResolver(t, fc, res, 10, MIN_RESOLVER_STAKE, true)
	fc.putAccount(t, res, 10)
	SetGlobalHeight(60)
	ok(t, c.DeliverMessageForfeitPosition(&MessageForfeitPosition{MarketId: mid, ResolverAddress: res}, 0))
	if m := getMarket(t, fc, mid); m.QYes != 400 || m.TotalPositions != 1 || fc.account(res) != 10+1_000_000 {
		t.Fatalf("forfeit totals wrong: QYes %d TP %d bal %d", m.QYes, m.TotalPositions, fc.account(res))
	}
}

func TestV2ClaimGraceExtended(t *testing.T) {
	bothModes(t, func(t *testing.T, fixed bool) {
		c, fc := newTestChain(t)
		creator, w1, w2 := addr(0xC1), addr(0xB1), addr(0xB2)
		mid := DeriveMarketId(creator, 1)
		putMsg(t, fc, KeyForMarket(mid), &MarketState{Status: STATUS_FINALIZED, Creator: creator, QYes: 200, QNo: 100, TotalPositions: 2, FinalizedPoolAmount: 2_000_000})
		putMsg(t, fc, KeyForOutcome(mid), &OutcomeState{WinningOutcome: true, ResolvedAt: 100})
		putMsg(t, fc, KeyForMarketPool(mid), &Pool{Amount: 2_000_000})
		putMsg(t, fc, KeyForPosition(mid, w1), &PositionState{SharesYes: 50, CostPaid: 1})
		putMsg(t, fc, KeyForPosition(mid, w2), &PositionState{SharesYes: 50, CostPaid: 1})
		fc.putAccount(t, w1, 10)
		fc.putAccount(t, w2, 10)
		SetGlobalHeight(100 + CLAIM_GRACE_PERIOD + 10)
		ok(t, c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: w1}, 0))
		r := c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: w2}, 0)
		if fixed && r.Error != nil {
			t.Fatalf("fixed: second winner must still be payable, got %v", r.Error)
		}
		if !fixed && r.Error == nil {
			t.Fatal("legacy: expected second winner swept after 1000 blocks")
		}
	})
}
