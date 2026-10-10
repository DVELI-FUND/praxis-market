package contract

func (c *Contract) CheckMessageClaimWinnings(msg *MessageClaimWinnings) *PluginCheckResponse {
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

func (c *Contract) DeliverMessageClaimWinnings(msg *MessageClaimWinnings, fee uint64) *PluginDeliverResponse {
now := GetGlobalHeight()
if now == 0 {
return &PluginDeliverResponse{Error: ErrHeightNotSet()}
}
if len(msg.ClaimantAddress) != 20 {
return &PluginDeliverResponse{Error: ErrInvalidAddress()}
}
cancelledMarket, cancelErr := c.CheckAutoCancel(msg.MarketId)
if cancelErr != nil {
return &PluginDeliverResponse{Error: cancelErr}
}

marketQId   := nextQueryId()
posQId      := nextQueryId()
poolQId     := nextQueryId()
claimAccQId := nextQueryId()

marketKey   := KeyForMarket(msg.MarketId)
posKey      := KeyForPosition(msg.MarketId, msg.ClaimantAddress)
poolKey     := KeyForMarketPool(msg.MarketId)
claimKey    := KeyForAccount(msg.ClaimantAddress)

resp, err := c.plugin.StateRead(c, &PluginStateReadRequest{
Keys: []*PluginKeyRead{
{QueryId: marketQId,   Key: marketKey},
{QueryId: posQId,      Key: posKey},
{QueryId: poolQId,     Key: poolKey},
{QueryId: claimAccQId, Key: claimKey},
},
})
if err != nil {
return &PluginDeliverResponse{Error: err}
}
if resp.Error != nil {
return &PluginDeliverResponse{Error: resp.Error}
}

var market   *MarketState
position    := &PositionState{}
marketPool  := &Pool{}
claimantAcc := &Account{}

for _, r := range resp.Results {
if len(r.Entries) == 0 || len(r.Entries[0].Value) == 0 {
continue
}
switch r.QueryId {
case marketQId:
market = &MarketState{}
if pe := Unmarshal(r.Entries[0].Value, market); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
case posQId:
if pe := Unmarshal(r.Entries[0].Value, position); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
case poolQId:
if pe := Unmarshal(r.Entries[0].Value, marketPool); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
case claimAccQId:
if pe := Unmarshal(r.Entries[0].Value, claimantAcc); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
}
}

if market == nil {
return &PluginDeliverResponse{Error: ErrMarketNotFound()}
}
// Apply auto-cancel if triggered — status will be STATUS_CANCELLED.
if cancelledMarket != nil {
market = cancelledMarket
}
// PATCH V4: the creator's seed is paid out in the tx that flips the market to CANCELLED.
var v4SeedPay uint64
if patchV4Active(now) && cancelledMarket != nil && cancelledMarket.TotalPositions > 0 && marketPool != nil {
v4SeedPay = minU64(seedEstimate(cancelledMarket), marketPool.Amount)
marketPool.Amount -= v4SeedPay
}
g := patchV3Active(now)
g4 := patchV4Active(now)
if g && market.Status == STATUS_FINALIZED {
// PATCH V3: after the claim window nobody is paid; the pool is swept (see patch_v3.go).
oq := nextQueryId()
ov, oerr := c.readKeys(map[uint64][]byte{oq: KeyForOutcome(msg.MarketId)})
if oerr != nil {
return &PluginDeliverResponse{Error: oerr}
}
if len(ov[oq]) > 0 {
oc := &OutcomeState{}
if pe := Unmarshal(ov[oq], oc); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
if oc.ResolvedAt > 0 && now > oc.ResolvedAt+CLAIM_GRACE_PERIOD_V2 {
return c.sweepClosedMarket(msg.MarketId, msg.ClaimantAddress, fee)
}
}
}
if positionIsEmpty(position) {
return &PluginDeliverResponse{Error: ErrNoPosition()}
}
if position.Claimed {
return &PluginDeliverResponse{Error: ErrAlreadyClaimed()}
}

var payout uint64
var finalizedAt uint64
cancelTreasury := &TreasuryReserve{}
switch market.Status {
case STATUS_FINALIZED:
outQId := nextQueryId()
outResp, err := c.plugin.StateRead(c, &PluginStateReadRequest{
Keys: []*PluginKeyRead{
{QueryId: outQId, Key: KeyForOutcome(msg.MarketId)},
},
})
if err != nil {
return &PluginDeliverResponse{Error: err}
}
if outResp.Error != nil {
return &PluginDeliverResponse{Error: outResp.Error}
}

var outcome *OutcomeState
for _, r := range outResp.Results {
if r.QueryId == outQId {
if len(r.Entries) == 0 || len(r.Entries[0].Value) == 0 {
return &PluginDeliverResponse{Error: ErrInternal()}
}
outcome = &OutcomeState{}
if pe := Unmarshal(r.Entries[0].Value, outcome); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
}
}
if outcome == nil {
return &PluginDeliverResponse{Error: ErrInternal()}
}
finalizedAt = outcome.ResolvedAt

if isNOutcome(market) {
np, npe := payoutNOutcome(market, position, outcome)
if npe != nil {
return &PluginDeliverResponse{Error: npe}
}
payout = np
} else {
var winnerShares, totalWinShares uint64
if outcome.WinningOutcome {
winnerShares   = position.SharesYes
totalWinShares = market.QYes
} else {
winnerShares   = position.SharesNo
totalWinShares = market.QNo
}
if winnerShares > 0 {
if totalWinShares == 0 {
return &PluginDeliverResponse{Error: ErrInternal()}
}
// C-1 fix: use FinalizedPoolAmount (recorded at finalization) not live pool.
// Live pool shrinks as each claimant collects, causing later claimants
// to receive less than their fair pro-rata share.
poolForPayout := marketPool.Amount
if market.FinalizedPoolAmount > 0 {
poolForPayout = market.FinalizedPoolAmount
}
if g {
payout = binaryPayoutV3(market, winnerShares, outcome.WinningOutcome, poolForPayout)
} else {
payout = ComputePayout(poolForPayout, winnerShares, totalWinShares)
}
}
}

case STATUS_CANCELLED:
payout = position.CostPaid
// Slash creator bond into treasury pool on cancel.
bondSlashQId := nextQueryId()
bsResp, bsErr := c.plugin.StateRead(c, &PluginStateReadRequest{
Keys: []*PluginKeyRead{
{QueryId: bondSlashQId, Key: KeyForTreasuryReserve(msg.MarketId)},
},
})
if bsErr != nil {
return &PluginDeliverResponse{Error: bsErr}
}
if bsResp.Error != nil {
return &PluginDeliverResponse{Error: bsResp.Error}
}
for _, r := range bsResp.Results {
if r.QueryId == bondSlashQId && len(r.Entries) > 0 && len(r.Entries[0].Value) > 0 {
if pe := Unmarshal(r.Entries[0].Value, cancelTreasury); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
}
}

case STATUS_VOIDED:
payout = position.CostPaid

default:
return &PluginDeliverResponse{Error: ErrMarketNotResolved()}
}

if payout > marketPool.Amount {
return &PluginDeliverResponse{Error: ErrInsufficientPoolFunds()}
}

position.Claimed     = true
market.ClaimedCount++
marketPool.Amount   -= payout
claimantAcc.Amount  += payout

// Pay fee — same pattern as claim_unbonded_stake; fee is burned (no destination pool).
if claimantAcc.Amount < fee {
return &PluginDeliverResponse{Error: ErrInsufficientFunds()}
}
claimantAcc.Amount -= fee

rawPos, pe := SafeMarshal(position)
if pe != nil { return &PluginDeliverResponse{Error: pe} }
rawMkt, pe := SafeMarshal(market)
if pe != nil { return &PluginDeliverResponse{Error: pe} }
rawMP, pe := SafeMarshal(marketPool)
if pe != nil { return &PluginDeliverResponse{Error: pe} }
rawAcc, pe := SafeMarshal(claimantAcc)
if pe != nil { return &PluginDeliverResponse{Error: pe} }

// Issue-14 fix: compute sweep eligibility BEFORE the atomic write.
// marketPool.Amount is already post-payout in memory — no re-read needed.
// Folding sweep into the same StateWrite eliminates the TOCTOU window where
// two concurrent last-winner calls could both re-read a non-zero pool and
// double-credit treasury.
resolutionDelay := RESOLUTION_DELAY_BLOCKS
gracePeriod     := GRACE_PERIOD_BLOCKS
claimGrace      := CLAIM_GRACE_PERIOD
if TEST_MODE {
resolutionDelay = TEST_RESOLUTION_DELAY
gracePeriod     = TEST_GRACE_PERIOD
claimGrace      = TEST_CLAIM_GRACE_PERIOD
}
if resolverFixActive(now) && !TEST_MODE {
claimGrace = CLAIM_GRACE_PERIOD_V2
}
_ = resolutionDelay
_ = gracePeriod
// The claim window is measured from finalization (OutcomeState.ResolvedAt), not from
// expiry: finalization only happens after the dispute window, so an expiry-based
// deadline has always already passed and the first claim swept everyone else's payout.
// Cancelled/voided markets have no resolution height, so they sweep only once every
// position has been claimed.
allClaimed := market.TotalPositions > 0 && market.ClaimedCount == market.TotalPositions
shouldSweep := allClaimed && (market.Status == STATUS_FINALIZED || market.Status == STATUS_CANCELLED || market.Status == STATUS_VOIDED)
if market.Status == STATUS_FINALIZED && finalizedAt > 0 && now > finalizedAt+claimGrace {
shouldSweep = true
}

sets := []*PluginSetOp{
{Key: posKey,    Value: rawPos},
{Key: marketKey, Value: rawMkt},
{Key: poolKey,   Value: rawMP},
{Key: claimKey,  Value: rawAcc},
}

// PATCH V4: once every position is refunded, the leftover is the creator's seed.
var creatorSweep uint64
if g4 && shouldSweep && marketPool.Amount > 0 && (market.Status == STATUS_CANCELLED || market.Status == STATUS_VOIDED) {
creatorSweep = marketPool.Amount
marketPool.Amount = 0
rawMPv4, pev4 := SafeMarshal(marketPool)
if pev4 != nil { return &PluginDeliverResponse{Error: pev4} }
sets[2] = &PluginSetOp{Key: poolKey, Value: rawMPv4}
shouldSweep = false
}
// Fold creator bond slash into sets if this was a cancel.
var bondTPool *Pool // PATCH V3: carried into the sweep below so the slash is not overwritten
if market.Status == STATUS_CANCELLED && cancelTreasury.CreatorBond > 0 {
cancelTPool := &Pool{}
tpQId := nextQueryId()
tpResp, tpErr := c.plugin.StateRead(c, &PluginStateReadRequest{
Keys: []*PluginKeyRead{
{QueryId: tpQId, Key: KeyForTreasuryPool()},
},
})
if tpErr != nil {
return &PluginDeliverResponse{Error: tpErr}
}
if tpResp.Error != nil {
return &PluginDeliverResponse{Error: tpResp.Error}
}
for _, r := range tpResp.Results {
if r.QueryId == tpQId && len(r.Entries) > 0 && len(r.Entries[0].Value) > 0 {
if pe := Unmarshal(r.Entries[0].Value, cancelTPool); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
}
}
cancelTPool.Amount      += cancelTreasury.CreatorBond
bondTPool = cancelTPool
cancelTreasury.CreatorBond = 0
rawCT, pe := SafeMarshal(cancelTreasury)
if pe != nil { return &PluginDeliverResponse{Error: pe} }
rawCTP, pe := SafeMarshal(cancelTPool)
if pe != nil { return &PluginDeliverResponse{Error: pe} }
sets = append(sets, &PluginSetOp{Key: KeyForTreasuryReserve(msg.MarketId), Value: rawCT})
sets = append(sets, &PluginSetOp{Key: KeyForTreasuryPool(), Value: rawCTP})
}

if shouldSweep && marketPool.Amount > 0 {
// marketPool.Amount here is the post-payout remainder (already subtracted above).
// Read treasury once, add remainder, zero the market pool — all in one write.
tQId := nextQueryId()
tResp, tErr := c.plugin.StateRead(c, &PluginStateReadRequest{
Keys: []*PluginKeyRead{
{QueryId: tQId, Key: KeyForTreasuryPool()},
},
})
if tErr != nil {
return &PluginDeliverResponse{Error: tErr}
}
if tResp.Error != nil {
return &PluginDeliverResponse{Error: tResp.Error}
}

treasuryPool := &Pool{}
for _, r := range tResp.Results {
if r.QueryId == tQId && len(r.Entries) > 0 && len(r.Entries[0].Value) > 0 {
if pe := Unmarshal(r.Entries[0].Value, treasuryPool); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
}
}

if g && bondTPool != nil {
// PATCH V3: the bond slash and this sweep write the same key in one tx; the sweep
// used to overwrite the slash, burning the creator bond.
treasuryPool = bondTPool
}
// Overflow guard.
if treasuryPool.Amount > ^uint64(0)-marketPool.Amount {
return &PluginDeliverResponse{Error: ErrInvalidAmount()}
}
treasuryPool.Amount += marketPool.Amount
marketPool.Amount   = 0

// Re-marshal pool (now zeroed) and treasury (now incremented).
rawMP, pe = SafeMarshal(marketPool)
if pe != nil {
return &PluginDeliverResponse{Error: pe}
}
rawTreasury, pe := SafeMarshal(treasuryPool)
if pe != nil {
return &PluginDeliverResponse{Error: pe}
}

// Replace pool op with zeroed value; append treasury op.
sets[2] = &PluginSetOp{Key: poolKey,              Value: rawMP}
sets    = append(sets, &PluginSetOp{Key: KeyForTreasuryPool(), Value: rawTreasury})
}

	// log payout amount (gated for replay; wired after cancel, see AMOUNT_LOG_MARKET_CLAIM_HEIGHT)
	if amountLogMarketClaimActive(now) && payout > 0 {
txLogOp, tlErr := buildMarketTxLogOp(market, msg.MarketId, "claim_winnings", msg.ClaimantAddress, now, false, 0, payout, "")
if tlErr == nil {
sets = append(sets, txLogOp)
}
}
wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{Sets: sets})
if pe := errCheckWrite(wr, werr); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
if g {
// PATCH V3 post-write hooks: route the (previously burned) fee, free the creator's
// open-market slot on auto-cancel, and sweep value stranded by cancelled markets.
if pe := c.routeFee(fee); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
if cancelledMarket != nil {
if pe := c.decOpenCount(market.Creator); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
}
if market.Status == STATUS_CANCELLED {
if g4 {
// PATCH V4: unspent reserve goes back to the creator; fee pools stay for refunds.
if pe := c.reserveToCreatorV4(msg.MarketId, market.Creator); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
} else if pe := c.sweepCancelledExtras(msg.MarketId); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
}
if v4SeedPay > 0 {
if pe := c.creditAccount(market.Creator, v4SeedPay); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
}
if g4 && (market.Status == STATUS_CANCELLED || market.Status == STATUS_VOIDED) {
last := market.TotalPositions > 0 && market.ClaimedCount == market.TotalPositions
if pe := c.refundFeesV4(msg.MarketId, msg.ClaimantAddress, position.CostPaid, last); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
if pe := c.creditAccount(market.Creator, creatorSweep); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
}
}
return &PluginDeliverResponse{}
}
