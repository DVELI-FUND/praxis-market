package contract

import "testing"

// Resolver records must be discoverable even when the ResolverIndex is missing/stale
// (resolvers registered before the index existed).
func TestResolverRecordsDiscoverableWithoutIndex(t *testing.T) {
	_, fc := newTestChain(t)
	a, b := addr(0x71), addr(0x72)
	fc.set(KeyForResolverRecord(a), mustMarshal(t, &ResolverRecord{ResolverAddress: a, StakeAmount: 500_000_000_000, IsActive: true}))
	fc.set(KeyForResolverRecord(b), mustMarshal(t, &ResolverRecord{ResolverAddress: b, StakeAmount: 600_000_000_000, IsActive: true}))
	// no ResolverIndex written at all

	n := 0
	for k := range fc.kv {
		if len(k) > 0 && k[0] == 0x16 || (len(k) > 1 && k[1] == 0x16) {
			n++
		}
	}
	if n != 2 {
		t.Fatalf("expected 2 record keys under the resolver prefix, saw %d", n)
	}
	prefix := JoinLenPrefix(resolverRecordPrefix)
	for _, k := range [][]byte{KeyForResolverRecord(a), KeyForResolverRecord(b)} {
		if len(k) < len(prefix) || string(k[:len(prefix)]) != string(prefix) {
			t.Fatalf("record key %x does not start with the range prefix %x", k, prefix)
		}
	}
}
