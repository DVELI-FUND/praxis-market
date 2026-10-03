package contract

import (
	"fmt"
	"math/rand"
	"os"
	"testing"
)

// Dumps lmsrCost samples for comparison against an arbitrary-precision reference.
func TestDumpLmsrSamples(t *testing.T) {
	path := os.Getenv("LMSR_DUMP")
	if path == "" {
		t.Skip("set LMSR_DUMP to dump samples")
	}
	f, _ := os.Create(path)
	defer f.Close()
	r := rand.New(rand.NewSource(7))
	for i := 0; i < 4000; i++ {
		b := uint64(10_000_000) + uint64(r.Int63n(5_000_000_000_000))
		qy := uint64(r.Int63n(int64(b) * 20))
		qn := uint64(r.Int63n(int64(b) * 20))
		fmt.Fprintf(f, "%d %d %d %d\n", qy, qn, b, lmsrCost(qy, qn, b))
	}
}
