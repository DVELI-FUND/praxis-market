package contract

// nDisputeAdvice mirrors the legacy dispute-context rule for N-outcome markets:
// advise disputing iff the address holds shares on ANY option other than the proposed one.
func nDisputeAdvice(pr *ProposalRecord, pos *PositionState) (bool, string) {
	if !anyShares(pos.Shares) {
		return false, "address holds no position in this market"
	}
	idx := int(pr.ProposedIndex)
	if idx >= len(pos.Shares) {
		return false, "proposal index out of range for this position"
	}
	for i, v := range pos.Shares {
		if i != idx && v > 0 {
			return true, "you hold shares on an option other than the proposed outcome"
		}
	}
	return false, "your position agrees with the proposed outcome"
}
