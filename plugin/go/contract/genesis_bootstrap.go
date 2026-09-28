package contract

// genesis_bootstrap.go: idempotent one-shot mint of the Praxis genesis
// allocation. Called from Genesis() (height 0, if the core passes the plugin
// in time) AND from BeginBlock() (fallback: upstream fsm.New() runs with a nil
// plugin, so Genesis() can be skipped). The flag is written in the SAME atomic
// StateWrite as the allocation, so double-minting is impossible.

var prefixGenesisComplete = []byte{0x31}

func KeyForGenesisComplete() []byte {
	return JoinLenPrefix(prefixGenesisComplete, []byte("/gdone/"))
}

func (c *Contract) runGenesisAllocation() *PluginError {
	flagQId, invQId, liqQId := nextQueryId(), nextQueryId(), nextQueryId()
	resp, err := c.plugin.StateRead(c, &PluginStateReadRequest{
		Keys: []*PluginKeyRead{
			{QueryId: flagQId, Key: KeyForGenesisComplete()},
			{QueryId: invQId, Key: KeyForGenesisInvestorAlloc()},
			{QueryId: liqQId, Key: KeyForAccount(PRAXIS_LIQUIDITY_SEED_ADDR)},
		},
	})
	if err != nil {
		return err
	}
	if resp.Error != nil {
		return resp.Error
	}
	flagSet, allocExists := false, false
	liqAcc := &Account{Address: PRAXIS_LIQUIDITY_SEED_ADDR}
	for _, r := range resp.Results {
		if len(r.Entries) == 0 || len(r.Entries[0].Value) == 0 {
			continue
		}
		switch r.QueryId {
		case flagQId:
			flagSet = true
		case invQId:
			allocExists = true
		case liqQId:
			if pe := Unmarshal(r.Entries[0].Value, liqAcc); pe != nil {
				return pe
			}
		}
	}
	if flagSet {
		return nil
	}
	// chain minted before the flag existed: just record the flag, never re-mint
	if allocExists {
		wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{
			Sets: []*PluginSetOp{{Key: KeyForGenesisComplete(), Value: []byte{1}}},
		})
		if pe := errCheckWrite(wr, werr); pe != nil {
			return pe
		}
		return nil
	}

	liqAcc.Amount += GENESIS_LIQUIDITY_AMOUNT
	community := &Pool{Amount: GENESIS_COMMUNITY_AMOUNT}
	investor := &GenesisVestingAlloc{TotalAllocation: GENESIS_INVESTOR_AMOUNT, StartHeight: 0}
	foundation := &GenesisVestingAlloc{TotalAllocation: GENESIS_FOUNDATION_AMOUNT, StartHeight: 0}

	rawLiq, pe := SafeMarshal(liqAcc)
	if pe != nil {
		return pe
	}
	rawCom, pe := SafeMarshal(community)
	if pe != nil {
		return pe
	}
	rawInv, pe := SafeMarshal(investor)
	if pe != nil {
		return pe
	}
	rawFnd, pe := SafeMarshal(foundation)
	if pe != nil {
		return pe
	}
	wr, werr := c.plugin.StateWrite(c, &PluginStateWriteRequest{
		Sets: []*PluginSetOp{
			{Key: KeyForAccount(PRAXIS_LIQUIDITY_SEED_ADDR), Value: rawLiq},
			{Key: KeyForGenesisCommunityAlloc(), Value: rawCom},
			{Key: KeyForGenesisInvestorAlloc(), Value: rawInv},
			{Key: KeyForGenesisFoundationAlloc(), Value: rawFnd},
			{Key: KeyForGenesisComplete(), Value: []byte{1}},
		},
	})
	if pe := errCheckWrite(wr, werr); pe != nil {
		return pe
	}
	return nil
}
