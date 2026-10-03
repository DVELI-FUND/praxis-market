package contract

// anyShares reports whether any per-option share balance is non-zero (N-outcome positions).
func anyShares(s []uint64) bool {
	for _, v := range s {
		if v > 0 {
			return true
		}
	}
	return false
}
