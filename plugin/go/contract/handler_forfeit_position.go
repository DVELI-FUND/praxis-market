package contract

// handler_forfeit_position.go — Issue-2 fix
// Allows a resolver to voluntarily exit a position before proposing/resolving.
// Refunds full CostPaid, zeroes shares atomically. Satisfies COI-1 requirement
// without permanent disqualification.

func (c *Contract) CheckMessageForfeitPosition(msg *MessageForfeitPosition) *PluginCheckResponse {
	if len(msg.MarketId) != 20 {
		return ErrCheckResp(ErrInvalidParam())
	}
	if len(msg.ResolverAddress) != 20 {
		return ErrCheckResp(ErrInvalidAddress())
	}
	return &PluginCheckResponse{
		AuthorizedSigners: [][]byte{msg.ResolverAddress},
	}
}

func (c *Contract) DeliverMessageForfeitPosition(msg *MessageForfeitPosition, fee uint64) *PluginDeliverResponse {
	now := GetGlobalHeight()
	if now == 0 {
		return &PluginDeliverResponse{Error: ErrHeightNotSet()}
	}
	posQId  := nextQueryId()
	accQId  := nextQueryId()
	poolQId := nextQueryId()
	resp, err := c.plugin.StateRead(c, &PluginStateReadRequest{
		Keys: []*PluginKeyRead{
			{QueryId: posQId,  Key: KeyForPosition(msg.MarketId, msg.ResolverAddress)},
			{QueryId: accQId,  Key: KeyForAccount(msg.ResolverAddress)},
			{QueryId: poolQId, Key: KeyForMarketPool(msg.MarketId)},
		},
	})
	if err != nil {
		return &PluginDeliverResponse{Error: ErrStateReadFailed()}
	}
	if resp.Error != nil {
		return &PluginDeliverResponse{Error: resp.Error}
	}
	var position *PositionState
	var account  *Account
	var pool     *Pool
	for _, r := range resp.Results {
		if len(r.Entries) == 0 || len(r.Entries[0].Value) == 0 {
			continue
		}
		switch r.QueryId {
		case posQId:
			position = &PositionState{}
			if pe := Unmarshal(r.Entries[0].Value, position); pe != nil {
				return &PluginDeliverResponse{Error: ErrUnmarshalFailed()}
			}
		case accQId:
			account = &Account{}
			if pe := Unmarshal(r.Entries[0].Value, account); pe != nil {
				return &PluginDeliverResponse{Error: ErrUnmarshalFailed()}
			}
		case poolQId:
			pool = &Pool{}
			if pe := Unmarshal(r.Entries[0].Value, pool); pe != nil {
				return &PluginDeliverResponse{Error: ErrUnmarshalFailed()}
			}
		}
	}
	var fixMarket *MarketState
	if resolverFixActive(now) {
		fm, fpe := c.forfeitGuard(msg.MarketId, msg.ResolverAddress, now)
		if fpe != nil {
			return &PluginDeliverResponse{Error: fpe}
		}
		fixMarket = fm
	}
	if position != nil && anyShares(position.Shares) {
return &PluginDeliverResponse{Error: ErrInvalidParam()}
}
if position == nil || (position.SharesYes == 0 && position.SharesNo == 0) {
		return &PluginDeliverResponse{Error: ErrNoPosition()}
	}
	if patchV3Active(now) && position.Claimed {
		return &PluginDeliverResponse{Error: ErrAlreadyClaimed()}
	}
	if account == nil {
		return &PluginDeliverResponse{Error: ErrInsufficientFunds()}
	}
	if pool == nil {
		return &PluginDeliverResponse{Error: ErrMarketNotFound()}
	}
	// Overflow guard
	if account.Amount > ^uint64(0)-position.CostPaid {
		return &PluginDeliverResponse{Error: ErrInvalidAmount()}
	}
	// Pool must cover the refund
	if pool.Amount < position.CostPaid {
		return &PluginDeliverResponse{Error: ErrInsufficientFunds()}
	}
	refund         := position.CostPaid
	if patchV4Active(now) && fixMarket != nil {
		// PATCH V4: standard LMSR exit — proceeds are what the shares are worth now,
		// capped at cost. A resolver can no longer bet, learn the outcome, and take a
		// free full refund; the cost they cannot recover stays in the pool.
		qy := subOrZero(fixMarket.QYes, position.SharesYes)
		qn := subOrZero(fixMarket.QNo, position.SharesNo)
		var sale uint64
		if position.SharesYes > 0 {
			v, ce := ComputeTradeCost(qy, fixMarket.QNo, fixMarket.BEff, position.SharesYes, true)
			if ce != nil {
				return &PluginDeliverResponse{Error: ce}
			}
			sale = addSat(sale, v)
		}
		if position.SharesNo > 0 {
			v, ce := ComputeTradeCost(qy, qn, fixMarket.BEff, position.SharesNo, false)
			if ce != nil {
				return &PluginDeliverResponse{Error: ce}
			}
			sale = addSat(sale, v)
		}
		refund = minU64(refund, sale)
	}
	account.Amount += refund
	pool.Amount    -= refund
	if fixMarket != nil {
		fixMarket.QYes = subOrZero(fixMarket.QYes, position.SharesYes)
		fixMarket.QNo = subOrZero(fixMarket.QNo, position.SharesNo)
		fixMarket.TotalPositions = subOrZero(fixMarket.TotalPositions, 1)
	}
	// Zero the position
	position.SharesYes = 0
	position.SharesNo  = 0
	position.CostPaid  = 0
	rawPos,  pe := SafeMarshal(position)
	if pe != nil { return &PluginDeliverResponse{Error: pe} }
	rawAcc,  pe := SafeMarshal(account)
	if pe != nil { return &PluginDeliverResponse{Error: pe} }
	rawPool, pe := SafeMarshal(pool)
	if pe != nil { return &PluginDeliverResponse{Error: pe} }
	fixOps := []*PluginSetOp{}
	if fixMarket != nil {
		rawMF, mpe := SafeMarshal(fixMarket)
		if mpe != nil {
			return &PluginDeliverResponse{Error: mpe}
		}
		fixOps = append(fixOps, &PluginSetOp{Key: KeyForMarket(msg.MarketId), Value: rawMF})
	}
	wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{
		Sets: append(fixOps, []*PluginSetOp{
			{Key: KeyForPosition(msg.MarketId, msg.ResolverAddress), Value: rawPos},
			{Key: KeyForAccount(msg.ResolverAddress),                Value: rawAcc},
			{Key: KeyForMarketPool(msg.MarketId),                    Value: rawPool},
		}...),
	})
	if pe := errCheckWrite(wr, werr); pe != nil {
		return &PluginDeliverResponse{Error: pe}
	}
	if patchV3Active(now) {
if pe := c.chargeAndRoute(msg.ResolverAddress, fee); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
}
return &PluginDeliverResponse{}
}
