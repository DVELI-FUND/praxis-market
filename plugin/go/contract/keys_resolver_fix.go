package contract

// ─────────────────────────────────────────────────────────────────────────────
// State keys added by the resolver/dispute v2 fix.
//   0x31  ResolverLock   per resolver address — Pool{Amount = open obligations}
// (0x32 / 0x33 belong to the per-epoch resolver reward accounting.)
// SlashRecord v2 re-uses the existing slash prefix with an extra market segment.
// ─────────────────────────────────────────────────────────────────────────────

var (
	resolverLockPrefix = []byte{0x31}
)

func KeyForResolverLock(addr []byte) []byte {
	return JoinLenPrefix(resolverLockPrefix, addr)
}
// KeyForSlashRecordV2 is keyed by market AND disputer, so two lost disputes by the
// same address no longer overwrite each other.
func KeyForSlashRecordV2(marketId, disputer []byte) []byte {
	return JoinLenPrefix(slashRecordPrefix, marketId, disputer)
}
