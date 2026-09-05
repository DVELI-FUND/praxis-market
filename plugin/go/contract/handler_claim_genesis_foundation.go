package contract

// handler_claim_genesis_foundation.go — MessageClaimGenesisFoundationAlloc
// One-time genesis allocation, locked, 6-month cliff then 18-month linear
// vest (see vesting.go, constants_genesis_alloc.go). Signer: PRAXIS_GENESIS_FOUNDATION_ADDR.

func (c *Contract) CheckMessageClaimGenesisFoundationAlloc(msg *MessageClaimGenesisFoundationAlloc) *PluginCheckResponse {
return &PluginCheckResponse{
AuthorizedSigners: [][]byte{PRAXIS_GENESIS_FOUNDATION_ADDR},
}
}

func (c *Contract) DeliverMessageClaimGenesisFoundationAlloc(msg *MessageClaimGenesisFoundationAlloc, fee uint64) *PluginDeliverResponse {
height := GetGlobalHeight()
if height == 0 {
return &PluginDeliverResponse{Error: ErrHeightNotSet()}
}

allocQId := nextQueryId()
accQId := nextQueryId()

resp, err := c.plugin.StateRead(c, &PluginStateReadRequest{
Keys: []*PluginKeyRead{
{QueryId: allocQId, Key: KeyForGenesisFoundationAlloc()},
{QueryId: accQId, Key: KeyForAccount(PRAXIS_GENESIS_FOUNDATION_ADDR)},
},
})
if err != nil {
return &PluginDeliverResponse{Error: err}
}
if resp.Error != nil {
return &PluginDeliverResponse{Error: resp.Error}
}

alloc := &GenesisVestingAlloc{}
acc := &Account{}
for _, r := range resp.Results {
if len(r.Entries) == 0 || len(r.Entries[0].Value) == 0 {
continue
}
switch r.QueryId {
case allocQId:
if pe := Unmarshal(r.Entries[0].Value, alloc); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
case accQId:
if pe := Unmarshal(r.Entries[0].Value, acc); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
}
}

if alloc.TotalAllocation == 0 {
return &PluginDeliverResponse{Error: ErrEmptyPool()}
}

vested := computeVestedAmount(alloc.TotalAllocation, alloc.StartHeight, height)
claimable := vested - alloc.ClaimedAmount
if claimable == 0 {
return &PluginDeliverResponse{Error: ErrNothingVested()}
}

alloc.ClaimedAmount += claimable
acc.Amount += claimable

if acc.Amount < fee {
return &PluginDeliverResponse{Error: ErrInsufficientFunds()}
}
acc.Amount -= fee

rawAlloc, pe := SafeMarshal(alloc)
if pe != nil {
return &PluginDeliverResponse{Error: pe}
}
rawAcc, pe := SafeMarshal(acc)
if pe != nil {
return &PluginDeliverResponse{Error: pe}
}

wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{
Sets: []*PluginSetOp{
{Key: KeyForGenesisFoundationAlloc(), Value: rawAlloc},
{Key: KeyForAccount(PRAXIS_GENESIS_FOUNDATION_ADDR), Value: rawAcc},
},
})
if pe := errCheckWrite(wr, werr); pe != nil {
return &PluginDeliverResponse{Error: pe}
}
return &PluginDeliverResponse{}
}
