package contract

func (c *Contract) CheckMessageReclaimStake(msg *MessageReclaimStake) *PluginCheckResponse {
if len(msg.MarketId) != 20 {
return ErrCheckResp(ErrInvalidParam())
}
if len(msg.ClaimantAddress) != 20 {
return ErrCheckResp(ErrInvalidAddress())
}
return &PluginCheckResponse{
AuthorizedSigners: [][]byte{msg.ClaimantAddress},
}
}

func (c *Contract) DeliverMessageReclaimStake(msg *MessageReclaimStake, fee uint64) *PluginDeliverResponse {
now := GetGlobalHeight()
if now == 0 {
return &PluginDeliverResponse{Error: ErrHeightNotSet()}
}

marketQId   := nextQueryId()
posQId      := nextQueryId()
poolQId     := nextQueryId()
treasQId    := nextQueryId()
proposalQId := nextQueryId()
claimAccQId := nextQueryId()

resp, err := c.plugin.StateRead(c, &PluginStateReadRequest{
Keys: []*PluginKeyRead{
{QueryId: marketQId,   Key: KeyForMarket(msg.MarketId)},
{QueryId: posQId,      Key: KeyForPosition(msg.MarketId, msg.ClaimantAddress)},
{QueryId: poolQId,     Key: KeyForMarketPool(msg.MarketId)},
{QueryId: treasQId,    Key: KeyForTreasuryReserve(msg.MarketId)},
{QueryId: proposalQId, Key: KeyForProposal(msg.MarketId)},
{QueryId: claimAccQId, Key: KeyForAccount(msg.ClaimantAddress)},
},
})
if err != nil {
return &PluginDeliverResponse{Error: err}
}
if resp.Error != nil {
return &PluginDeliverResponse{Error: resp.Error}
}

var market   *MarketState
var position *PositionState
marketPool  := &Pool{}
treasury    := &TreasuryReserve{}
claimantAcc := &Account{}
var proposalRaw []byte

for _, r := range resp.Results {
switch r.QueryId {
case marketQId:
if len(r.Entries) == 0 || len(r.Entries[0].Value) == 0 {
return &PluginDeliverResponse{Error: ErrMarketNotFound()}
}
market = &MarketState{}
if pe := Unmarshal(r.Entries[0].Value, market); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
case posQId:
if len(r.Entries) > 0 && len(r.Entries[0].Value) > 0 {
position = &PositionState{}
if pe := Unmarshal(r.Entries[0].Value, position); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
}
case poolQId:
if len(r.Entries) > 0 && len(r.Entries[0].Value) > 0 {
if pe := Unmarshal(r.Entries[0].Value, marketPool); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
}
case treasQId:
if len(r.Entries) > 0 && len(r.Entries[0].Value) > 0 {
if pe := Unmarshal(r.Entries[0].Value, treasury); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
}
case proposalQId:
if len(r.Entries) > 0 && len(r.Entries[0].Value) > 0 {
proposalRaw = r.Entries[0].Value
}
case claimAccQId:
if len(r.Entries) > 0 && len(r.Entries[0].Value) > 0 {
if pe := Unmarshal(r.Entries[0].Value, claimantAcc); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
}
}
}

if market == nil {
return &PluginDeliverResponse{Error: ErrMarketNotFound()}
}

// Cancelled never-traded market: pay out the stranded seed (height-gated).
if market.Status == STATUS_CANCELLED && cancelFixActive(now) {
return c.reclaimCancelledSeed(msg, market, marketPool, claimantAcc)
}

// Only reclaimable if STATUS_OPEN, expiry passed, and no proposal ever filed
if market.Status != STATUS_OPEN {
return &PluginDeliverResponse{Error: ErrMarketNotReclaimable()}
}
if proposalRaw != nil {
return &PluginDeliverResponse{Error: ErrMarketNotReclaimable()}
}
reclaimOpen := market.ExpiryTime + RESOLUTION_DELAY_BLOCKS + GRACE_PERIOD_BLOCKS
if resolverFixActive(now) {
reclaimOpen = addSat(market.ExpiryTime, PROPOSAL_WINDOW_V2)
}
if now <= reclaimOpen {
return &PluginDeliverResponse{Error: ErrReclaimWindowClosed()}
}

// Compute refund amount
var refund uint64

// Position refund (any bettor including creator)
if position != nil {
if position.Claimed {
return &PluginDeliverResponse{Error: ErrAlreadyClaimed()}
}
if position.SharesYes > 0 || position.SharesNo > 0 || anyShares(position.Shares) {
refund += position.CostPaid
}
}

gated := cancelFixActive(now)
isCreator := bytesEqual(msg.ClaimantAddress, market.Creator)
posRefund := refund // pool-funded part: this claimant's own position cost
var seed uint64
if gated {
// LockedReserve / CreatorBond live in TreasuryReserve, never in the market pool.
var escrow uint64
if isCreator {
escrow = treasury.LockedReserve
if market.TotalPositions == 0 {
// Nobody ever bet: creator recovers bond + LMSR seed (same as cancel_market).
escrow += treasury.CreatorBond
seed = marketPool.Amount
}
}
refund = posRefund + escrow + seed
} else if isCreator && treasury.LockedReserve > 0 {
// Legacy behaviour, kept byte-for-byte for replay: reserve paid out of the pool.
refund += treasury.LockedReserve
}

if refund == 0 {
return &PluginDeliverResponse{Error: ErrNoStakeToReclaim()}
}
poolDebit := refund
if gated {
poolDebit = posRefund + seed
}
if poolDebit > marketPool.Amount {
return &PluginDeliverResponse{Error: ErrInsufficientPoolFunds()}
}

// Mutate in memory
claimantAcc.Amount += refund
marketPool.Amount -= poolDebit
if isCreator {
treasury.LockedReserve = 0
if gated && market.TotalPositions == 0 {
treasury.CreatorBond = 0
}
}

// Marshal all
rawAcc, pe := SafeMarshal(claimantAcc)
if pe != nil { return &PluginDeliverResponse{Error: pe} }
rawPool, pe := SafeMarshal(marketPool)
if pe != nil { return &PluginDeliverResponse{Error: pe} }

sets := []*PluginSetOp{
{Key: KeyForAccount(msg.ClaimantAddress), Value: rawAcc},
{Key: KeyForMarketPool(msg.MarketId),     Value: rawPool},
}
if resolverFixActive(now) {
// Flip to CANCELLED atomically so a late proposal can never dilute the winners.
market.Status = STATUS_CANCELLED
rawMk, peMk := SafeMarshal(market)
if peMk != nil { return &PluginDeliverResponse{Error: peMk} }
sets = append(sets, &PluginSetOp{Key: KeyForMarket(msg.MarketId), Value: rawMk})
}
var deletes []*PluginDeleteOp

// Mark position as claimed to prevent double reclaim
if position != nil && (position.SharesYes > 0 || position.SharesNo > 0 || anyShares(position.Shares)) {
position.Claimed = true
rawPos, pe := SafeMarshal(position)
if pe != nil { return &PluginDeliverResponse{Error: pe} }
sets = append(sets, &PluginSetOp{Key: KeyForPosition(msg.MarketId, msg.ClaimantAddress), Value: rawPos})
}

if isCreator && treasury.LockedReserve == 0 {
rawTreas, pe := SafeMarshal(treasury)
if pe != nil { return &PluginDeliverResponse{Error: pe} }
sets = append(sets, &PluginSetOp{Key: KeyForTreasuryReserve(msg.MarketId), Value: rawTreas})
}

wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{
Sets:    sets,
Deletes: deletes,
})
if pe := errCheckWrite(wr, werr); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
return &PluginDeliverResponse{}
}
