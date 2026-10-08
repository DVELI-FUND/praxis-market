package contract

// resolver_epoch.go — per-epoch resolver reward accounting.
//
// Legacy bug: claim_resolver_reward divided by the all-time GlobalStats total and
// multiplied by the resolver's all-time SuccessfulResolutions at their CURRENT tier,
// while the pool is per-epoch. Claims were not tied to the epoch's activity and the
// sum of payouts could exceed what the weights justified.
//
// Fix: record each resolution's tier weight into the epoch it finalized in.
//   epochTotal[e]        += weight
//   resolverScore[e][r]  += weight
// Claim pays pool * resolverScore / epochTotal, then removes the resolver's score from
// BOTH the score key and epochTotal, so later claimers split the remaining pool
// pro-rata (no first-claimer advantage, no under-payment of late claimers).

// epochWeightOps reads the epoch counters and returns the set ops adding `weight`.
func (c *Contract) epochWeightOps(epoch uint64, addr []byte, weight uint64) ([]*PluginSetOp, *PluginError) {
	totQId := nextQueryId()
	scoQId := nextQueryId()
	totKey := KeyForEpochWeightedTotal(epoch)
	scoKey := KeyForResolverEpochScore(epoch, addr)
	resp, err := c.plugin.StateRead(c, &PluginStateReadRequest{
		Keys: []*PluginKeyRead{
			{QueryId: totQId, Key: totKey},
			{QueryId: scoQId, Key: scoKey},
		},
	})
	if err != nil {
		return nil, err
	}
	if resp.Error != nil {
		return nil, resp.Error
	}
	tot, sco := &Pool{}, &Pool{}
	for _, r := range resp.Results {
		if len(r.Entries) == 0 || len(r.Entries[0].Value) == 0 {
			continue
		}
		switch r.QueryId {
		case totQId:
			if pe := Unmarshal(r.Entries[0].Value, tot); pe != nil {
				return nil, pe
			}
		case scoQId:
			if pe := Unmarshal(r.Entries[0].Value, sco); pe != nil {
				return nil, pe
			}
		}
	}
	tot.Amount += weight
	sco.Amount += weight
	rawTot, pe := SafeMarshal(tot)
	if pe != nil {
		return nil, pe
	}
	rawSco, pe := SafeMarshal(sco)
	if pe != nil {
		return nil, pe
	}
	return []*PluginSetOp{
		{Key: totKey, Value: rawTot},
		{Key: scoKey, Value: rawSco},
	}, nil
}

// proposerWinOps builds the state writes for a proposer who wins a dispute:
// RRS +20, SuccessfulResolutions++, legacy GlobalStats weight, and (for epochs under
// the fix) the per-epoch counters. Returns (nil, nil) when there is nothing to write.
func (c *Contract) proposerWinOps(marketId []byte, now uint64) ([]*PluginSetOp, *PluginError) {
	propQId := nextQueryId()
	statsQId := nextQueryId()
	resp, err := c.plugin.StateRead(c, &PluginStateReadRequest{
		Keys: []*PluginKeyRead{
			{QueryId: propQId, Key: KeyForProposal(marketId)},
			{QueryId: statsQId, Key: KeyForGlobalStats()},
		},
	})
	if err != nil {
		return nil, err
	}
	if resp.Error != nil {
		return nil, resp.Error
	}
	proposal := &ProposalRecord{}
	stats := &GlobalStats{}
	for _, r := range resp.Results {
		if len(r.Entries) == 0 || len(r.Entries[0].Value) == 0 {
			continue
		}
		switch r.QueryId {
		case propQId:
			if pe := Unmarshal(r.Entries[0].Value, proposal); pe != nil {
				return nil, pe
			}
		case statsQId:
			if pe := Unmarshal(r.Entries[0].Value, stats); pe != nil {
				return nil, pe
			}
		}
	}
	if len(proposal.ResolverAddr) != 20 {
		return nil, nil
	}

	recQId := nextQueryId()
	recResp, err := c.plugin.StateRead(c, &PluginStateReadRequest{
		Keys: []*PluginKeyRead{{QueryId: recQId, Key: KeyForResolverRecord(proposal.ResolverAddr)}},
	})
	if err != nil {
		return nil, err
	}
	if recResp.Error != nil {
		return nil, recResp.Error
	}
	rec := &ResolverRecord{}
	for _, r := range recResp.Results {
		if r.QueryId == recQId && len(r.Entries) > 0 && len(r.Entries[0].Value) > 0 {
			if pe := Unmarshal(r.Entries[0].Value, rec); pe != nil {
				return nil, pe
			}
		}
	}

	rec.RrsScore += 20
	rec.SuccessfulResolutions++
	weight := uint64(rrsWeight(rec.RrsScore))
	stats.TotalWeightedResolutions += weight

	rawRec, pe := SafeMarshal(rec)
	if pe != nil {
		return nil, pe
	}
	rawStats, pe := SafeMarshal(stats)
	if pe != nil {
		return nil, pe
	}
	ops := []*PluginSetOp{
		{Key: KeyForResolverRecord(proposal.ResolverAddr), Value: rawRec},
		{Key: KeyForGlobalStats(), Value: rawStats},
	}
	if ep := now / PRIS_EPOCH_BLOCKS; resolverEpochFixed(ep) {
		eops, pe := c.epochWeightOps(ep, proposal.ResolverAddr, weight)
		if pe != nil {
			return nil, pe
		}
		ops = append(ops, eops...)
	}
	return ops, nil
}

// claimResolverRewardEpoch settles one resolver's share of a per-epoch pool.
// payout = pool * score / epochTotal; then score is removed from epochTotal and the
// resolver's score key is deleted, so each claimer takes an exact pro-rata slice of
// whatever remains and a second claim of the same epoch finds nothing.
func (c *Contract) claimResolverRewardEpoch(msg *MessageClaimResolverReward, fee uint64, epoch uint64) *PluginDeliverResponse {
	recQId, poolQId, accQId, totQId, scoQId := nextQueryId(), nextQueryId(), nextQueryId(), nextQueryId(), nextQueryId()
	recKey := KeyForResolverRecord(msg.ResolverAddress)
	poolKey := KeyForResolverEpochPool(epoch)
	accKey := KeyForAccount(msg.ResolverAddress)
	totKey := KeyForEpochWeightedTotal(epoch)
	scoKey := KeyForResolverEpochScore(epoch, msg.ResolverAddress)

	resp, err := c.plugin.StateRead(c, &PluginStateReadRequest{
		Keys: []*PluginKeyRead{
			{QueryId: recQId, Key: recKey},
			{QueryId: poolQId, Key: poolKey},
			{QueryId: accQId, Key: accKey},
			{QueryId: totQId, Key: totKey},
			{QueryId: scoQId, Key: scoKey},
		},
	})
	if err != nil {
		return &PluginDeliverResponse{Error: err}
	}
	if resp.Error != nil {
		return &PluginDeliverResponse{Error: resp.Error}
	}
	rec, pool, acc, tot, sco := &ResolverRecord{}, &Pool{}, &Account{}, &Pool{}, &Pool{}
	for _, r := range resp.Results {
		if len(r.Entries) == 0 || len(r.Entries[0].Value) == 0 {
			continue
		}
		var target any
		switch r.QueryId {
		case recQId:
			target = rec
		case poolQId:
			target = pool
		case accQId:
			target = acc
		case totQId:
			target = tot
		case scoQId:
			target = sco
		default:
			continue
		}
		if pe := Unmarshal(r.Entries[0].Value, target); pe != nil {
			return &PluginDeliverResponse{Error: pe}
		}
	}

	if rec.RrsScore == 0 {
		return &PluginDeliverResponse{Error: ErrInsufficientRRS()}
	}
	// score == 0 covers both "no resolutions this epoch" and "already claimed".
	if sco.Amount == 0 {
		return &PluginDeliverResponse{Error: ErrNoResolutions()}
	}
	if pool.Amount == 0 || tot.Amount == 0 {
		return &PluginDeliverResponse{Error: ErrEmptyPool()}
	}
	if sco.Amount > tot.Amount {
		return &PluginDeliverResponse{Error: ErrInternal()}
	}

	payout := mulDiv(pool.Amount, sco.Amount, tot.Amount)
	if payout == 0 {
		return &PluginDeliverResponse{Error: ErrEmptyPool()}
	}
	if payout > pool.Amount {
		payout = pool.Amount
	}

	acc.Amount += payout
	pool.Amount -= payout
	tot.Amount -= sco.Amount
	rec.LastClaimedEpoch = epoch // informational only; claims are not gated on it

	if acc.Amount < fee {
		return &PluginDeliverResponse{Error: ErrInsufficientFunds()}
	}
	acc.Amount -= fee

	rawRec, pe := SafeMarshal(rec)
	if pe != nil {
		return &PluginDeliverResponse{Error: pe}
	}
	rawPool, pe := SafeMarshal(pool)
	if pe != nil {
		return &PluginDeliverResponse{Error: pe}
	}
	rawAcc, pe := SafeMarshal(acc)
	if pe != nil {
		return &PluginDeliverResponse{Error: pe}
	}
	rawTot, pe := SafeMarshal(tot)
	if pe != nil {
		return &PluginDeliverResponse{Error: pe}
	}
	wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{
		Sets: []*PluginSetOp{
			{Key: recKey, Value: rawRec},
			{Key: poolKey, Value: rawPool},
			{Key: accKey, Value: rawAcc},
			{Key: totKey, Value: rawTot},
		},
		Deletes: []*PluginDeleteOp{{Key: scoKey}},
	})
	if pe := errCheckWrite(wr, werr); pe != nil {
		return &PluginDeliverResponse{Error: pe}
	}
	return &PluginDeliverResponse{}
}
