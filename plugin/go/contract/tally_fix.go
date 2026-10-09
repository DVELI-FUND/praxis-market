package contract

// tallyVotesFixed is the height-gated replacement for tally_votes.
//
//   - quorum: a majority of the drawn panel must reveal; otherwise the dispute is
//     VOTE_NO_QUORUM, the proposal stands, and the disputer's bond is refunded at
//     finalization.
//   - non-voters lose NONVOTE_RRS_PENALTY RRS.
//   - the LOSING side's bond is split: VOTER_SHARE_BPS to winning-side voters
//     (weighted), the rest to the winner (disputer now / proposer via claim_slash).
//   - disputer wins: market VOIDED, proposer takes -50 RRS, creator escrow is
//     returned, creator/resolver fee pools are swept to the treasury.
//   - proposer wins: +20 RRS, one weighted resolution (global + per-epoch).
//   - every panel member's unstake lock is released (proposer's too when voided).
func (c *Contract) tallyVotesFixed(msg *MessageTallyVotes, now uint64) *PluginDeliverResponse {
	mq, dq, pq := nextQueryId(), nextQueryId(), nextQueryId()
	vals, err := c.readKeys(map[uint64][]byte{
		mq: KeyForMarket(msg.MarketId),
		dq: KeyForDispute(msg.MarketId),
		pq: KeyForProposal(msg.MarketId),
	})
	if err != nil {
		return &PluginDeliverResponse{Error: err}
	}
	if len(vals[mq]) == 0 {
		return &PluginDeliverResponse{Error: ErrMarketNotFound()}
	}
	market := &MarketState{}
	if pe := Unmarshal(vals[mq], market); pe != nil {
		return &PluginDeliverResponse{Error: pe}
	}
	if market.Status != STATUS_DISPUTED || len(vals[dq]) == 0 {
		return &PluginDeliverResponse{Error: ErrNotDisputed()}
	}
	dispute := &DisputeRecord{}
	if pe := Unmarshal(vals[dq], dispute); pe != nil {
		return &PluginDeliverResponse{Error: pe}
	}
	if dispute.VoteStatus == VOTE_TALLIED || dispute.VoteStatus == VOTE_NO_QUORUM {
		return &PluginDeliverResponse{}
	}
	proposal := &ProposalRecord{}
	if pe := unmarshalIf(vals[pq], proposal); pe != nil {
		return &PluginDeliverResponse{Error: pe}
	}
	if len(proposal.ResolverAddr) != 20 {
		return &PluginDeliverResponse{Error: ErrInternal()}
	}
	if now <= dispute.DisputeBlock+COMMIT_PHASE_BLOCKS+REVEAL_PHASE_BLOCKS {
		return &PluginDeliverResponse{Error: ErrTallyNotReady()}
	}

	// ── panel reveals + resolver records ──────────────────────────────────
	type member struct {
		addr   []byte
		rec    *ResolverRecord
		reveal *VoteReveal
		weight uint64
	}
	n := len(dispute.PanelMembers)
	members := make([]*member, n)
	keys := map[uint64][]byte{}
	recQ := make([]uint64, n)
	revQ := make([]uint64, n)
	for i, a := range dispute.PanelMembers {
		members[i] = &member{addr: a}
		recQ[i], revQ[i] = nextQueryId(), nextQueryId()
		keys[recQ[i]] = KeyForResolverRecord(a)
		keys[revQ[i]] = KeyForVoteReveal(msg.MarketId, a)
	}
	pv := map[uint64][]byte{}
	if n > 0 {
		if pv, err = c.readKeys(keys); err != nil {
			return &PluginDeliverResponse{Error: err}
		}
	}
	var yes, no uint64
	revealed := 0
	for i, m := range members {
		if len(pv[recQ[i]]) > 0 {
			m.rec = &ResolverRecord{}
			if pe := Unmarshal(pv[recQ[i]], m.rec); pe != nil {
				return &PluginDeliverResponse{Error: pe}
			}
		}
		m.weight = uint64(VOTE_WEIGHT_BRONZE)
		if m.rec != nil {
			m.weight = uint64(rrsWeight(m.rec.RrsScore))
		}
		if len(pv[revQ[i]]) > 0 {
			m.reveal = &VoteReveal{}
			if pe := Unmarshal(pv[revQ[i]], m.reveal); pe != nil {
				return &PluginDeliverResponse{Error: pe}
			}
			revealed++
			if m.reveal.Vote {
				yes += m.weight
			} else {
				no += m.weight
			}
		}
	}

	var sets []*PluginSetOp
	var memberAddrs [][]byte
	for _, m := range members {
		memberAddrs = append(memberAddrs, m.addr)
		if m.reveal == nil && m.rec != nil {
			m.rec.RrsScore = subOrZero(m.rec.RrsScore, NONVOTE_RRS_PENALTY)
			raw, pe := SafeMarshal(m.rec)
			if pe != nil {
				return &PluginDeliverResponse{Error: pe}
			}
			sets = append(sets, &PluginSetOp{Key: KeyForResolverRecord(m.addr), Value: raw})
		}
	}

	// ── no quorum: proposal stands, nobody is slashed ─────────────────────
	if revealed < n/2+1 {
		dispute.VoteStatus = VOTE_NO_QUORUM
		rawD, pe := SafeMarshal(dispute)
		if pe != nil {
			return &PluginDeliverResponse{Error: pe}
		}
		sets = append(sets, &PluginSetOp{Key: KeyForDispute(msg.MarketId), Value: rawD})
		lops, lerr := c.lockOps(memberAddrs, -1)
		if lerr != nil {
			return &PluginDeliverResponse{Error: lerr}
		}
		sets = append(sets, lops...)
		wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{Sets: sets})
		if pe := errCheckWrite(wr, werr); pe != nil {
			return &PluginDeliverResponse{Error: pe}
		}
		return &PluginDeliverResponse{}
	}

	// ── decided ───────────────────────────────────────────────────────────
	disputerWins := yes > no
	dispute.VoteStatus = VOTE_TALLIED
	loserBond := dispute.DisputeBond
	if disputerWins {
		loserBond = proposal.ProposalBond
	}
	voterPool := ComputeBps(loserBond, VOTER_SHARE_BPS)
	winnerShare := loserBond - voterPool

	var winners []*member
	var weights []uint64
	for _, m := range members {
		if m.reveal != nil && m.reveal.Vote == disputerWins {
			winners = append(winners, m)
			weights = append(weights, m.weight)
		}
	}
	rewards := splitByWeight(voterPool, weights)

	// second read: everything the outcome touches
	rq, oq, cfq, rfq, tq, prq, mpq := nextQueryId(), nextQueryId(), nextQueryId(), nextQueryId(), nextQueryId(), nextQueryId(), nextQueryId()
	v2, err := c.readKeys(map[uint64][]byte{
		rq:  KeyForTreasuryReserve(msg.MarketId),
		oq:  KeyForCreatorOpenCount(market.Creator),
		cfq: KeyForCreatorFeePool(msg.MarketId),
		rfq: KeyForResolverFeePool(msg.MarketId),
		tq:  KeyForTreasuryPool(),
		prq: KeyForResolverRecord(proposal.ResolverAddr),
		mpq: KeyForMarketPool(msg.MarketId),
	})
	if err != nil {
		return &PluginDeliverResponse{Error: err}
	}
	reserve, openCount, creatorFee, resolverFee, treasury := &TreasuryReserve{}, &Pool{}, &Pool{}, &Pool{}, &Pool{}
	proposerRec := &ResolverRecord{}
	marketPool := &Pool{}
	for ptr, q := range map[any]uint64{reserve: rq, openCount: oq, creatorFee: cfq, resolverFee: rfq, treasury: tq, proposerRec: prq, marketPool: mpq} {
		if pe := unmarshalIf(v2[q], ptr); pe != nil {
			return &PluginDeliverResponse{Error: pe}
		}
	}

	acctAddrs := [][]byte{}
	for _, w := range winners {
		acctAddrs = append(acctAddrs, w.addr)
	}
	if disputerWins {
		acctAddrs = append(acctAddrs, dispute.DisputerAddress, market.Creator)
	}
	book, err := c.loadAccts(acctAddrs)
	if err != nil {
		return &PluginDeliverResponse{Error: err}
	}
	for i, w := range winners {
		if pe := book.credit(w.addr, rewards[i]); pe != nil {
			return &PluginDeliverResponse{Error: pe}
		}
	}

	lockAddrs := append([][]byte{}, memberAddrs...)
	if disputerWins {
		market.Status = STATUS_VOIDED
		escrow := reserve.CreatorBond + reserve.LockedReserve
		if escrow < reserve.CreatorBond {
			return &PluginDeliverResponse{Error: ErrInvalidAmount()}
		}
		if pe := book.credit(dispute.DisputerAddress, addSat(dispute.DisputeBond, winnerShare)); pe != nil {
			return &PluginDeliverResponse{Error: pe}
		}
		if pe := book.credit(market.Creator, escrow); pe != nil {
			return &PluginDeliverResponse{Error: pe}
		}
		reserve.CreatorBond, reserve.LockedReserve = 0, 0
		if openCount.Amount > 0 {
			openCount.Amount--
		}
		if !patchV4Active(now) {
			treasury.Amount = addSat(treasury.Amount, addSat(creatorFee.Amount, resolverFee.Amount))
			creatorFee.Amount, resolverFee.Amount = 0, 0
		} // PATCH V4: pools stay so claim_winnings can refund each bettor's fees
		proposerRec.RrsScore = subOrZero(proposerRec.RrsScore, LOSING_PROPOSER_RRS_PENALTY)
		lockAddrs = append(lockAddrs, proposal.ResolverAddr)
		// PATCH V4: voided market WITH positions: seed goes back to the creator now, so the
		// pool holds exactly the traders' refunds (claimable forever).
		if patchV4Active(now) && market.TotalPositions > 0 && marketPool.Amount > 0 {
			if pay := minU64(seedEstimate(market), marketPool.Amount); pay > 0 {
				if pe := book.credit(market.Creator, pay); pe != nil {
					return &PluginDeliverResponse{Error: pe}
				}
				marketPool.Amount -= pay
				rawV4, v4e := SafeMarshal(marketPool)
				if v4e != nil {
					return &PluginDeliverResponse{Error: v4e}
				}
				sets = append(sets, &PluginSetOp{Key: KeyForMarketPool(msg.MarketId), Value: rawV4})
			}
		}
		// PATCH V3: voided market nobody traded: no claimant will ever sweep the seed.
		if patchV3Active(now) && market.TotalPositions == 0 && marketPool.Amount > 0 {
			if pe := book.credit(market.Creator, marketPool.Amount); pe != nil {
				return &PluginDeliverResponse{Error: pe}
			}
			marketPool.Amount = 0
			rawMP, mpe := SafeMarshal(marketPool)
			if mpe != nil {
				return &PluginDeliverResponse{Error: mpe}
			}
			sets = append(sets, &PluginSetOp{Key: KeyForMarketPool(msg.MarketId), Value: rawMP})
		}

		for _, kv := range []struct {
			key []byte
			msg any
		}{
			{KeyForTreasuryReserve(msg.MarketId), reserve},
			{KeyForCreatorOpenCount(market.Creator), openCount},
			{KeyForCreatorFeePool(msg.MarketId), creatorFee},
			{KeyForResolverFeePool(msg.MarketId), resolverFee},
			{KeyForTreasuryPool(), treasury},
			{KeyForResolverRecord(proposal.ResolverAddr), proposerRec},
		} {
			raw, pe := SafeMarshal(kv.msg)
			if pe != nil {
				return &PluginDeliverResponse{Error: pe}
			}
			sets = append(sets, &PluginSetOp{Key: kv.key, Value: raw})
		}
	} else {
		// proposer wins: RRS +20, one resolution (global + per-epoch when active)
		wops, wpe := c.proposerWinOps(msg.MarketId, now)
		if wpe != nil {
			return &PluginDeliverResponse{Error: wpe}
		}
		sets = append(sets, wops...)
	}

	aops, perr := book.ops()
	if perr != nil {
		return &PluginDeliverResponse{Error: perr}
	}
	sets = append(sets, aops...)
	lops, lerr := c.lockOps(lockAddrs, -1)
	if lerr != nil {
		return &PluginDeliverResponse{Error: lerr}
	}
	sets = append(sets, lops...)

	rawD, pe := SafeMarshal(dispute)
	if pe != nil {
		return &PluginDeliverResponse{Error: pe}
	}
	rawM, pe := SafeMarshal(market)
	if pe != nil {
		return &PluginDeliverResponse{Error: pe}
	}
	sets = append(sets,
		&PluginSetOp{Key: KeyForDispute(msg.MarketId), Value: rawD},
		&PluginSetOp{Key: KeyForMarket(msg.MarketId), Value: rawM},
	)
	wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{Sets: sets})
	if pe := errCheckWrite(wr, werr); pe != nil {
		return &PluginDeliverResponse{Error: pe}
	}
	return &PluginDeliverResponse{}
}
