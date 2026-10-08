package contract

func (c *Contract) CheckMessageClaimSlash(msg *MessageClaimSlash) *PluginCheckResponse {
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

func (c *Contract) DeliverMessageClaimSlash(msg *MessageClaimSlash, fee uint64) *PluginDeliverResponse {
now := GetGlobalHeight()
if now == 0 {
return &PluginDeliverResponse{Error: ErrHeightNotSet()}
}

marketQId   := nextQueryId()
proposalQId := nextQueryId()
disputeQId  := nextQueryId()

resp, err := c.plugin.StateRead(c, &PluginStateReadRequest{
Keys: []*PluginKeyRead{
{QueryId: marketQId,   Key: KeyForMarket(msg.MarketId)},
{QueryId: proposalQId, Key: KeyForProposal(msg.MarketId)},
{QueryId: disputeQId,  Key: KeyForDispute(msg.MarketId)},
},
})
if err != nil {
return &PluginDeliverResponse{Error: err}
}
if resp.Error != nil {
return &PluginDeliverResponse{Error: resp.Error}
}

var market   *MarketState
var proposal *ProposalRecord
var dispute  *DisputeRecord

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
case proposalQId:
if len(r.Entries) == 0 || len(r.Entries[0].Value) == 0 {
return &PluginDeliverResponse{Error: ErrInternal()}
}
proposal = &ProposalRecord{}
if pe := Unmarshal(r.Entries[0].Value, proposal); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
case disputeQId:
if len(r.Entries) == 0 || len(r.Entries[0].Value) == 0 {
return &PluginDeliverResponse{Error: ErrInternal()}
}
dispute = &DisputeRecord{}
if pe := Unmarshal(r.Entries[0].Value, dispute); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
}
}

if market == nil {
return &PluginDeliverResponse{Error: ErrMarketNotFound()}
}
if market.Status != STATUS_FINALIZED {
return &PluginDeliverResponse{Error: ErrNotFinalized()}
}
if proposal == nil || dispute == nil {
return &PluginDeliverResponse{Error: ErrInternal()}
}
if !bytesEqual(msg.ClaimantAddress, proposal.ResolverAddr) {
return &PluginDeliverResponse{Error: ErrUnauthorized()}
}
if dispute.VoteStatus != VOTE_TALLIED {
return &PluginDeliverResponse{Error: ErrTallyNotReady()}
}

slashQId    := nextQueryId()
slashLegacyQId := nextQueryId()
slashKey := KeyForSlashRecord(dispute.DisputerAddress)
primarySlashKey := slashKey
if resolverFixActive(now) {
primarySlashKey = KeyForSlashRecordV2(msg.MarketId, dispute.DisputerAddress)
}
claimAccQId := nextQueryId()
treasQId    := nextQueryId()
resolverRecQId := nextQueryId()
resFeeQId      := nextQueryId()

resp2, err := c.plugin.StateRead(c, &PluginStateReadRequest{
Keys: []*PluginKeyRead{
{QueryId: slashQId,    Key: primarySlashKey},
{QueryId: slashLegacyQId, Key: slashKey},
{QueryId: claimAccQId, Key: KeyForAccount(msg.ClaimantAddress)},
{QueryId: treasQId,       Key: KeyForTreasuryReserve(msg.MarketId)},
{QueryId: resolverRecQId, Key: KeyForResolverRecord(proposal.ResolverAddr)},
{QueryId: resFeeQId,      Key: KeyForResolverFeePool(msg.MarketId)},
},
})
if err != nil {
return &PluginDeliverResponse{Error: err}
}
if resp2.Error != nil {
return &PluginDeliverResponse{Error: resp2.Error}
}

var slash *SlashRecord
claimAcc    := &Account{}
treasury    := &TreasuryReserve{}
resolverRec := &ResolverRecord{}
resFeePool  := &Pool{}

for _, r := range resp2.Results {
switch r.QueryId {
case slashQId, slashLegacyQId:
if len(r.Entries) == 0 || len(r.Entries[0].Value) == 0 {
continue
}
if r.QueryId == slashLegacyQId && slash != nil {
continue
}
if r.QueryId == slashQId {
slashKey = primarySlashKey
}
slash = &SlashRecord{}
if pe := Unmarshal(r.Entries[0].Value, slash); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
case claimAccQId:
if len(r.Entries) > 0 && len(r.Entries[0].Value) > 0 {
if pe := Unmarshal(r.Entries[0].Value, claimAcc); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
}
case treasQId:
if len(r.Entries) > 0 && len(r.Entries[0].Value) > 0 {
if pe := Unmarshal(r.Entries[0].Value, treasury); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
}
case resolverRecQId:
if len(r.Entries) > 0 && len(r.Entries[0].Value) > 0 {
if pe := Unmarshal(r.Entries[0].Value, resolverRec); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
}
case resFeeQId:
if len(r.Entries) > 0 && len(r.Entries[0].Value) > 0 {
if pe := Unmarshal(r.Entries[0].Value, resFeePool); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
}
}
}

if slash == nil || slash.SlashAmount == 0 {
return &PluginDeliverResponse{Error: ErrNoSlashToClaim()}
}

fixed := resolverFixActive(now)
slashAmount := slash.SlashAmount
if !fixed {
if treasury.LockedReserve < slashAmount {
slashAmount = treasury.LockedReserve
}
treasury.LockedReserve -= slashAmount
}
if fixed && claimAcc.Amount > ^uint64(0)-slashAmount {
return &PluginDeliverResponse{Error: ErrInvalidAmount()}
}
claimAcc.Amount        += slashAmount
slash.SlashAmount       = 0

// PRIS v1.0-r3: RRS -50 (floor 0) and sweep resolver fee pool to treasury
if fixed {
// the claimant won the dispute: no RRS penalty
} else if resolverRec.RrsScore >= 50 {
resolverRec.RrsScore -= 50
} else {
resolverRec.RrsScore = PRIS_RRS_FLOOR
}
// Sweep resolver fee pool to treasury pool.
// AUDIT: this used to be a second, separate StateWrite whose result was discarded and
// whose read/marshal errors were skipped silently. It is now folded into the single
// atomic write below and every error is returned.
var feeOps []*PluginSetOp
if fixed && resFeePool.Amount > 0 {
if claimAcc.Amount > ^uint64(0)-resFeePool.Amount {
return &PluginDeliverResponse{Error: ErrInvalidAmount()}
}
claimAcc.Amount += resFeePool.Amount
resFeePool.Amount = 0
rawRF, peRF := SafeMarshal(resFeePool)
if peRF != nil { return &PluginDeliverResponse{Error: peRF} }
feeOps = append(feeOps, &PluginSetOp{Key: KeyForResolverFeePool(msg.MarketId), Value: rawRF})
}
var sweepOps []*PluginSetOp
if resFeePool.Amount > 0 {
tPoolQId := nextQueryId()
tPoolResp, tPoolErr := c.plugin.StateRead(c, &PluginStateReadRequest{
Keys: []*PluginKeyRead{
{QueryId: tPoolQId, Key: KeyForTreasuryPool()},
},
})
if tPoolErr != nil {
return &PluginDeliverResponse{Error: tPoolErr}
}
if tPoolResp.Error != nil {
return &PluginDeliverResponse{Error: tPoolResp.Error}
}
tPool := &Pool{}
for _, r := range tPoolResp.Results {
if r.QueryId == tPoolQId && len(r.Entries) > 0 && len(r.Entries[0].Value) > 0 {
if pe := Unmarshal(r.Entries[0].Value, tPool); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
}
}
if tPool.Amount > ^uint64(0)-resFeePool.Amount {
return &PluginDeliverResponse{Error: ErrInvalidAmount()}
}
tPool.Amount     += resFeePool.Amount
resFeePool.Amount = 0
rawTPool, pe2 := SafeMarshal(tPool)
if pe2 != nil {
return &PluginDeliverResponse{Error: pe2}
}
rawResFee2, pe3 := SafeMarshal(resFeePool)
if pe3 != nil {
return &PluginDeliverResponse{Error: pe3}
}
sweepOps = []*PluginSetOp{
{Key: KeyForTreasuryPool(),                Value: rawTPool},
{Key: KeyForResolverFeePool(msg.MarketId), Value: rawResFee2},
}
}

rawSlash, pe := SafeMarshal(slash)
if pe != nil { return &PluginDeliverResponse{Error: pe} }
rawAcc, pe := SafeMarshal(claimAcc)
if pe != nil { return &PluginDeliverResponse{Error: pe} }
rawT, pe := SafeMarshal(treasury)
if pe != nil { return &PluginDeliverResponse{Error: pe} }

rawResolverRec, pe := SafeMarshal(resolverRec)
if pe != nil { return &PluginDeliverResponse{Error: pe} }

sets := []*PluginSetOp{
{Key: slashKey, Value: rawSlash},
{Key: KeyForAccount(msg.ClaimantAddress),         Value: rawAcc},
{Key: KeyForTreasuryReserve(msg.MarketId),        Value: rawT},
{Key: KeyForResolverRecord(proposal.ResolverAddr), Value: rawResolverRec},
}
sets = append(sets, sweepOps...)
sets = append(sets, feeOps...)

wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{Sets: sets})
if pe := errCheckWrite(wr, werr); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
return &PluginDeliverResponse{}
}
