package contract

// handler_claim_genesis_community.go — MessageClaimGenesisCommunityAlloc
// One-time genesis allocation (5,000,000 PRX), liquid, no vesting, no cooldown.
// Signer: PRAXIS_GENESIS_COMMUNITY_ADDR. Distinct from PRIS's recurring
// CommunityPool (0x23) — this is a one-time cap-table grant, not epoch revenue.

func (c *Contract) CheckMessageClaimGenesisCommunityAlloc(msg *MessageClaimGenesisCommunityAlloc) *PluginCheckResponse {
return &PluginCheckResponse{
AuthorizedSigners: [][]byte{PRAXIS_GENESIS_COMMUNITY_ADDR},
}
}

func (c *Contract) DeliverMessageClaimGenesisCommunityAlloc(msg *MessageClaimGenesisCommunityAlloc, fee uint64) *PluginDeliverResponse {
height := GetGlobalHeight()
if height == 0 {
return &PluginDeliverResponse{Error: ErrHeightNotSet()}
}

poolQId := nextQueryId()
accQId := nextQueryId()

resp, err := c.plugin.StateRead(c, &PluginStateReadRequest{
Keys: []*PluginKeyRead{
{QueryId: poolQId, Key: KeyForGenesisCommunityAlloc()},
{QueryId: accQId, Key: KeyForAccount(PRAXIS_GENESIS_COMMUNITY_ADDR)},
},
})
if err != nil {
return &PluginDeliverResponse{Error: err}
}
if resp.Error != nil {
return &PluginDeliverResponse{Error: resp.Error}
}

pool := &Pool{}
acc := &Account{}
for _, r := range resp.Results {
if len(r.Entries) == 0 || len(r.Entries[0].Value) == 0 {
continue
}
switch r.QueryId {
case poolQId:
if pe := Unmarshal(r.Entries[0].Value, pool); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
case accQId:
if pe := Unmarshal(r.Entries[0].Value, acc); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
}
}

if pool.Amount == 0 {
return &PluginDeliverResponse{Error: ErrEmptyPool()}
}

acc.Amount += pool.Amount
pool.Amount = 0

if acc.Amount < fee {
return &PluginDeliverResponse{Error: ErrInsufficientFunds()}
}
acc.Amount -= fee

rawPool, pe := SafeMarshal(pool)
if pe != nil {
return &PluginDeliverResponse{Error: pe}
}
rawAcc, pe := SafeMarshal(acc)
if pe != nil {
return &PluginDeliverResponse{Error: pe}
}

wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{
Sets: []*PluginSetOp{
{Key: KeyForGenesisCommunityAlloc(), Value: rawPool},
{Key: KeyForAccount(PRAXIS_GENESIS_COMMUNITY_ADDR), Value: rawAcc},
},
})
if pe := errCheckWrite(wr, werr); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
return &PluginDeliverResponse{}
}
