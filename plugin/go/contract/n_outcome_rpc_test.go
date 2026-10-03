package contract

import "testing"

func TestNDisputeAdvice(t *testing.T) {
	pr := &ProposalRecord{ProposedIndex: 1}
	cases := []struct {
		name   string
		shares []uint64
		want   bool
	}{
		{"none", []uint64{0, 0, 0}, false},
		{"only proposed", []uint64{0, 5, 0}, false},
		{"other option", []uint64{5, 0, 0}, true},
		{"mixed incl. proposed", []uint64{0, 5, 7}, true},
		{"short slice", []uint64{5}, false},
	}
	for _, tc := range cases {
		got, reason := nDisputeAdvice(pr, &PositionState{Shares: tc.shares})
		if got != tc.want || reason == "" {
			t.Errorf("%s: got %v (%q), want %v", tc.name, got, reason, tc.want)
		}
	}
}
