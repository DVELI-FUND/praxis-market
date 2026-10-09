package contract

func (c *Contract) CheckMessageTallyVotes(msg *MessageTallyVotes) *PluginCheckResponse {
if len(msg.MarketId) != 20 {
return ErrCheckResp(ErrInvalidParam())
}
if len(msg.CallerAddr) != 20 {
return ErrCheckResp(ErrInvalidAddress())
}
return &PluginCheckResponse{
AuthorizedSigners: [][]byte{msg.CallerAddr},
}
}

func (c *Contract) DeliverMessageTallyVotes(msg *MessageTallyVotes, fee uint64) *PluginDeliverResponse {
now := GetGlobalHeight()
if now == 0 {
return &PluginDeliverResponse{Error: ErrHeightNotSet()}
}
if resolverFixActive(now) {
r := c.tallyVotesFixed(msg, now)
if r.Error == nil && patchV3Active(now) {
if pe := c.chargeAndRoute(msg.CallerAddr, fee); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
}
return r
}

marketQId  := nextQueryId()
disputeQId := nextQueryId()

resp, err := c.plugin.StateRead(c, &PluginStateReadRequest{
Keys: []*PluginKeyRead{
{QueryId: marketQId,  Key: KeyForMarket(msg.MarketId)},
{QueryId: disputeQId, Key: KeyForDispute(msg.MarketId)},
},
})
if err != nil {
return &PluginDeliverResponse{Error: err}
}
if resp.Error != nil {
return &PluginDeliverResponse{Error: resp.Error}
}

var market  *MarketState
var dispute *DisputeRecord

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
case disputeQId:
if len(r.Entries) == 0 || len(r.Entries[0].Value) == 0 {
return &PluginDeliverResponse{Error: ErrNotDisputed()}
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
if market.Status != STATUS_DISPUTED {
return &PluginDeliverResponse{Error: ErrNotDisputed()}
}
if dispute == nil {
return &PluginDeliverResponse{Error: ErrNotDisputed()}
}

if dispute.VoteStatus == VOTE_TALLIED {
return &PluginDeliverResponse{}
}

revealEnd := dispute.DisputeBlock + COMMIT_PHASE_BLOCKS + REVEAL_PHASE_BLOCKS
if now <= revealEnd {
return &PluginDeliverResponse{Error: ErrTallyNotReady()}
}

queries := make([]uint64, 0, len(dispute.PanelMembers))
readKeys := make([]*PluginKeyRead, 0, len(dispute.PanelMembers))

// Layer 2: build RRS read keys alongside vote reveal keys
rrsQueries := make([]uint64, 0, len(dispute.PanelMembers))
rrsKeys    := make([]*PluginKeyRead, 0, len(dispute.PanelMembers))

for _, member := range dispute.PanelMembers {
qId := nextQueryId()
queries = append(queries, qId)
readKeys = append(readKeys, &PluginKeyRead{
QueryId: qId,
Key:     KeyForVoteReveal(msg.MarketId, member),
})
rId := nextQueryId()
rrsQueries = append(rrsQueries, rId)
rrsKeys = append(rrsKeys, &PluginKeyRead{
QueryId: rId,
Key:     KeyForResolverRecord(member),
})
}

// Layer 2: build queryId -> vote weight map from RRS scores
weightByQId := make(map[uint64]uint32)
if len(rrsKeys) > 0 {
rrsResp, err := c.plugin.StateRead(c, &PluginStateReadRequest{Keys: rrsKeys})
if err != nil {
return &PluginDeliverResponse{Error: err}
}
if rrsResp.Error != nil {
return &PluginDeliverResponse{Error: rrsResp.Error}
}
for idx, r := range rrsResp.Results {
weight := VOTE_WEIGHT_BRONZE
if len(r.Entries) > 0 && len(r.Entries[0].Value) > 0 {
rec := &ResolverRecord{}
if pe := Unmarshal(r.Entries[0].Value, rec); pe == nil {
if rec.RrsScore >= RRS_GOLD_THRESHOLD {
weight = VOTE_WEIGHT_GOLD
} else if rec.RrsScore >= RRS_SILVER_THRESHOLD {
weight = VOTE_WEIGHT_SILVER
}
}
}
// map the corresponding vote reveal queryId to this weight
if idx < len(queries) {
weightByQId[queries[idx]] = weight
}
}
}

var yesVotes, noVotes uint32
if len(readKeys) > 0 {
voteResp, err := c.plugin.StateRead(c, &PluginStateReadRequest{
Keys: readKeys,
})
if err != nil {
return &PluginDeliverResponse{Error: err}
}
if voteResp.Error != nil {
return &PluginDeliverResponse{Error: voteResp.Error}
}

for _, r := range voteResp.Results {
if len(r.Entries) == 0 || len(r.Entries[0].Value) == 0 {
continue
}
vr := &VoteReveal{}
if pe := Unmarshal(r.Entries[0].Value, vr); pe != nil {
continue
}
// Layer 2: apply RRS tier weight — default Bronze if missing
w := weightByQId[r.QueryId]
if w == 0 {
w = VOTE_WEIGHT_BRONZE
}
if vr.Vote {
yesVotes += w
} else {
noVotes += w
}
}
}

disputerWins := yesVotes > noVotes
dispute.VoteStatus = VOTE_TALLIED

// Disputer wins: the proposed outcome is overturned. There is no re-proposal path
// (ProposalRecord is the idempotency sentinel), so the market is VOIDED and every
// bettor refunds their cost via claim_winnings (STATUS_VOIDED path).
if disputerWins {
market.Status = STATUS_VOIDED
}

rawD, pe := SafeMarshal(dispute)
if pe != nil { return &PluginDeliverResponse{Error: pe} }
rawM, pe := SafeMarshal(market)
if pe != nil { return &PluginDeliverResponse{Error: pe} }

sets := []*PluginSetOp{
{Key: KeyForDispute(msg.MarketId), Value: rawD},
{Key: KeyForMarket(msg.MarketId),  Value: rawM},
}

// Voided: return the disputer's bond and the creator's escrow (bond + finalization
// reserve, mirroring cancel_market), and free the creator's open-market slot.
if disputerWins {
dispAccQId := nextQueryId()
credAccQId := nextQueryId()
reserveQId := nextQueryId()
openCntQId := nextQueryId()
vresp, verr := c.plugin.StateRead(c, &PluginStateReadRequest{
Keys: []*PluginKeyRead{
{QueryId: dispAccQId, Key: KeyForAccount(dispute.DisputerAddress)},
{QueryId: credAccQId, Key: KeyForAccount(market.Creator)},
{QueryId: reserveQId, Key: KeyForTreasuryReserve(msg.MarketId)},
{QueryId: openCntQId, Key: KeyForCreatorOpenCount(market.Creator)},
},
})
if verr != nil {
return &PluginDeliverResponse{Error: verr}
}
if vresp.Error != nil {
return &PluginDeliverResponse{Error: vresp.Error}
}
disputerAcc := &Account{}
creatorAcc := &Account{}
reserve := &TreasuryReserve{}
openCount := &Pool{}
for _, r := range vresp.Results {
if len(r.Entries) == 0 || len(r.Entries[0].Value) == 0 {
continue
}
var target interface{}
switch r.QueryId {
case dispAccQId:
target = disputerAcc
case credAccQId:
target = creatorAcc
case reserveQId:
target = reserve
case openCntQId:
target = openCount
default:
continue
}
if pe := Unmarshal(r.Entries[0].Value, target); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
}
sameParty := bytesEqual(dispute.DisputerAddress, market.Creator)
if sameParty {
creatorAcc = disputerAcc
}
escrow := reserve.CreatorBond + reserve.LockedReserve
if escrow < reserve.CreatorBond || disputerAcc.Amount > ^uint64(0)-dispute.DisputeBond {
return &PluginDeliverResponse{Error: ErrInvalidAmount()}
}
disputerAcc.Amount += dispute.DisputeBond
if creatorAcc.Amount > ^uint64(0)-escrow {
return &PluginDeliverResponse{Error: ErrInvalidAmount()}
}
creatorAcc.Amount += escrow
reserve.CreatorBond = 0
reserve.LockedReserve = 0
if openCount.Amount > 0 {
openCount.Amount--
}
rawDispAcc, pe := SafeMarshal(disputerAcc)
if pe != nil { return &PluginDeliverResponse{Error: pe} }
rawReserve, pe := SafeMarshal(reserve)
if pe != nil { return &PluginDeliverResponse{Error: pe} }
rawOpen, pe := SafeMarshal(openCount)
if pe != nil { return &PluginDeliverResponse{Error: pe} }
sets = append(sets,
&PluginSetOp{Key: KeyForAccount(dispute.DisputerAddress), Value: rawDispAcc},
&PluginSetOp{Key: KeyForTreasuryReserve(msg.MarketId), Value: rawReserve},
&PluginSetOp{Key: KeyForCreatorOpenCount(market.Creator), Value: rawOpen},
)
if !sameParty {
rawCredAcc, pe := SafeMarshal(creatorAcc)
if pe != nil { return &PluginDeliverResponse{Error: pe} }
sets = append(sets, &PluginSetOp{Key: KeyForAccount(market.Creator), Value: rawCredAcc})
}
}

// PRIS v1.0-r3: if proposer wins dispute, RRS +20 and record the resolution.
// Legacy epochs swallow read errors (unchanged consensus behaviour); epochs under
// RESOLVER_REWARD_FIX_HEIGHT fail the tx instead of silently dropping the reward.
if !disputerWins {
	ops, wpe := c.proposerWinOps(msg.MarketId, now)
	if wpe != nil {
		if resolverEpochFixed(now / PRIS_EPOCH_BLOCKS) {
			return &PluginDeliverResponse{Error: wpe}
		}
	} else {
		sets = append(sets, ops...)
	}
}

wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{Sets: sets})
if pe := errCheckWrite(wr, werr); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
return &PluginDeliverResponse{}
}
