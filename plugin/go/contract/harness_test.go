package contract

import (
	"bytes"
	"net"
	"sort"
	"sync"
	"testing"
)

// fakeChain is an in-memory stand-in for the Canopy FSM state store.
type fakeChain struct {
	mu sync.Mutex
	kv map[string][]byte
}

func (f *fakeChain) get(k []byte) []byte {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.kv[string(k)]
}

func (f *fakeChain) set(k, v []byte) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.kv[string(k)] = v
}

func (f *fakeChain) handle(req *PluginToFSM) *FSMToPlugin {
	f.mu.Lock()
	defer f.mu.Unlock()
	switch p := req.Payload.(type) {
	case *PluginToFSM_StateRead:
		resp := &PluginStateReadResponse{}
		for _, k := range p.StateRead.Keys {
			res := &PluginReadResult{QueryId: k.QueryId}
			if v, ok := f.kv[string(k.Key)]; ok {
				res.Entries = []*PluginStateEntry{{Key: k.Key, Value: v}}
			}
			resp.Results = append(resp.Results, res)
		}
		for _, r := range p.StateRead.Ranges {
			res := &PluginReadResult{QueryId: r.QueryId}
			var keys []string
			for k := range f.kv {
				if bytes.HasPrefix([]byte(k), r.Prefix) {
					keys = append(keys, k)
				}
			}
			sort.Strings(keys)
			for _, k := range keys {
				res.Entries = append(res.Entries, &PluginStateEntry{Key: []byte(k), Value: f.kv[k]})
			}
			resp.Results = append(resp.Results, res)
		}
		return &FSMToPlugin{Id: req.Id, Payload: &FSMToPlugin_StateRead{StateRead: resp}}
	case *PluginToFSM_StateWrite:
		for _, d := range p.StateWrite.Deletes {
			delete(f.kv, string(d.Key))
		}
		for _, s := range p.StateWrite.Sets {
			f.kv[string(s.Key)] = append([]byte(nil), s.Value...)
		}
		return &FSMToPlugin{Id: req.Id, Payload: &FSMToPlugin_StateWrite{StateWrite: &PluginStateWriteResponse{}}}
	}
	return nil
}

// newTestChain wires a Contract to an in-memory FSM over net.Pipe.
func newTestChain(t *testing.T) (*Contract, *fakeChain) {
	t.Helper()
	pluginSide, fsmSide := net.Pipe()
	p := &Plugin{
		conn:            pluginSide,
		pending:         make(map[uint64]chan isFSMToPlugin_Payload),
		requestContract: make(map[uint64]*Contract),
	}
	fc := &fakeChain{kv: map[string][]byte{}}
	fsm := &Plugin{conn: fsmSide} // reuse the length-prefix codec on the FSM end
	go func() {
		for {
			req := new(PluginToFSM)
			if err := fsm.receiveProtoMsg(req); err != nil {
				return
			}
			if resp := fc.handle(req); resp != nil {
				if err := fsm.sendProtoMsg(resp); err != nil {
					return
				}
			}
		}
	}()
	go func() {
		for {
			msg := new(FSMToPlugin)
			if err := p.receiveProtoMsg(msg); err != nil {
				return
			}
			_ = p.handleFSMResponse(msg)
		}
	}()
	t.Cleanup(func() { pluginSide.Close(); fsmSide.Close() })
	SetGlobalHeight(100)
	return &Contract{Config: Config{ChainId: 1}, plugin: p, fsmId: 1}, fc
}

func (f *fakeChain) putAccount(t *testing.T, addr []byte, amt uint64) {
	raw, pe := SafeMarshal(&Account{Amount: amt})
	if pe != nil {
		t.Fatal(pe)
	}
	f.set(KeyForAccount(addr), raw)
}

func (f *fakeChain) account(addr []byte) uint64 {
	a := &Account{}
	if v := f.get(KeyForAccount(addr)); len(v) > 0 {
		_ = Unmarshal(v, a)
	}
	return a.Amount
}

func (f *fakeChain) putPool(t *testing.T, key []byte, amt uint64) {
	raw, pe := SafeMarshal(&Pool{Amount: amt})
	if pe != nil {
		t.Fatal(pe)
	}
	f.set(key, raw)
}

func (f *fakeChain) pool(key []byte) uint64 {
	p := &Pool{}
	if v := f.get(key); len(v) > 0 {
		_ = Unmarshal(v, p)
	}
	return p.Amount
}

func addr(b byte) []byte { return bytes.Repeat([]byte{b}, 20) }
