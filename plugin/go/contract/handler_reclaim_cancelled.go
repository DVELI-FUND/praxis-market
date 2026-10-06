package contract

// reclaimCancelledSeed pays the creator the LMSR seed that a pre-fix
// cancel_market left in the pool. Bond and reserve were already refunded
// and TotalPositions is 0, so the pool holds only the creator's seed.
// Single use: the pool is zeroed, so a repeat call errors.
func (c *Contract) reclaimCancelledSeed(msg *MessageReclaimStake, market *MarketState, marketPool *Pool, claimantAcc *Account) *PluginDeliverResponse {
if !bytesEqual(msg.ClaimantAddress, market.Creator) {
return &PluginDeliverResponse{Error: ErrUnauthorized()}
}
if market.TotalPositions != 0 {
return &PluginDeliverResponse{Error: ErrMarketNotReclaimable()}
}
seed := marketPool.Amount
if seed == 0 {
return &PluginDeliverResponse{Error: ErrNoStakeToReclaim()}
}
if claimantAcc.Amount > ^uint64(0)-seed {
return &PluginDeliverResponse{Error: ErrInternal()}
}
claimantAcc.Amount += seed
marketPool.Amount = 0
rawAcc, pe := SafeMarshal(claimantAcc)
if pe != nil {
return &PluginDeliverResponse{Error: pe}
}
rawPool, pe := SafeMarshal(marketPool)
if pe != nil {
return &PluginDeliverResponse{Error: pe}
}
wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{
Sets: []*PluginSetOp{
{Key: KeyForAccount(msg.ClaimantAddress), Value: rawAcc},
{Key: KeyForMarketPool(msg.MarketId), Value: rawPool},
},
})
if pe := errCheckWrite(wr, werr); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
return &PluginDeliverResponse{}
}
