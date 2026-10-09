package contract

import (
	"strings"
	"testing"
)

// ─── N-outcome (up to 10 options) ────────────────────────────────────────────

func tenLabels() []string {
	return []string{"Opt0", "Opt1", "Opt2", "Opt3", "Opt4", "Opt5", "Opt6", "Opt7", "Opt8", "Opt9"}
}

// Full lifecycle at the maximum option count: create -> trade every option -> propose the
// LAST index -> finalize -> claim -> sweep. Checks solvency for every possible winner.
func TestAuditN10FullLifecycle(t *testing.T) {
	c, fc, creator := nSetup(t)
	resolver, caller := addr(0x99), addr(0xC1)
	mid := nCreate(t, c, creator, 1, tenLabels())

	m0 := nMarket(t, fc, mid)
	if len(m0.Options) != 10 || len(m0.Q) != 10 || m0.QYes != 0 || m0.QNo != 0 {
		t.Fatalf("bad N=10 init: options=%d q=%d qyes=%d qno=%d", len(m0.Options), len(m0.Q), m0.QYes, m0.QNo)
	}

	buyers := make([][]byte, 10)
	for i := range buyers {
		buyers[i] = addr(byte(0xB0 + i))
		fc.putAccount(t, buyers[i], 100_000_000_000)
		shares := uint64(i+1) * PRECISION_SCALE
		if r := nBuy(c, mid, buyers[i], uint32(i), shares); r.Error != nil {
			t.Fatalf("buy option %d: %v", i, r.Error)
		}
	}
	m := nMarket(t, fc, mid)
	pool := fc.pool(KeyForMarketPool(mid))
	for i, q := range m.Q {
		if q != uint64(i+1)*PRECISION_SCALE {
			t.Fatalf("q[%d]=%d", i, q)
		}
		if pool < q {
			t.Fatalf("INSOLVENT if option %d wins: pool %d < q %d", i, pool, q)
		}
	}
	if m.QYes != 0 || m.QNo != 0 {
		t.Fatal("N-outcome trades must never touch legacy QYes/QNo")
	}
	if m.TotalPositions != 10 {
		t.Fatalf("TotalPositions=%d want 10", m.TotalPositions)
	}
	// index 10 is out of range for a 10-option market
	if r := nBuy(c, mid, buyers[0], 10, PRECISION_SCALE); r.Error == nil {
		t.Fatal("option index 10 must be rejected on a 10-option market")
	}

	nRegisterResolver(t, fc, resolver, 1_000_000_000)
	SetGlobalHeight(m.ExpiryTime + 10)
	bond := ComputeMinBond(m)
	if r := c.DeliverMessageProposeOutcome(&MessageProposeOutcome{MarketId: mid, ResolverAddress: resolver, ProposedIndex: 9, ProposalBond: bond}, 0, "h"); r.Error != nil {
		t.Fatalf("propose idx 9: %v", r.Error)
	}
	pr := &ProposalRecord{}
	if pe := Unmarshal(fc.get(KeyForProposal(mid)), pr); pe != nil {
		t.Fatal(pe)
	}
	SetGlobalHeight(pr.ProposalBlock + ComputeDisputeBlocks(m.OpenTime, m.ExpiryTime) + 1)
	if r := c.DeliverMessageFinalizeMarket(&MessageFinalizeMarket{MarketId: mid, CallerAddr: caller}, 0, "h"); r.Error != nil {
		t.Fatalf("finalize: %v", r.Error)
	}

	var paid uint64
	for i, b := range buyers {
		before := fc.account(b)
		if r := c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: b}, 0); r.Error != nil {
			t.Fatalf("claim %d: %v", i, r.Error)
		}
		got := fc.account(b) - before
		want := uint64(0)
		if i == 9 {
			want = 10 * PRECISION_SCALE
		}
		if got != want {
			t.Fatalf("buyer %d payout=%d want %d", i, got, want)
		}
		paid += got
	}
	if left := fc.pool(KeyForMarketPool(mid)); left != 0 {
		t.Fatalf("market pool not swept after all claims: %d", left)
	}
	if paid > pool {
		t.Fatalf("paid %d > pool %d", paid, pool)
	}
}

func TestAuditNOptionCountBounds(t *testing.T) {
	c, _, creator := nSetup(t)
	mk := func(n int, nonce uint64) *PluginDeliverResponse {
		opts := make([]string, n)
		for i := range opts {
			opts[i] = "O" + strings.Repeat("x", i)
		}
		return c.DeliverMessageCreateMarket(&MessageCreateMarket{
			CreatorAddress: creator, B0: nTestB0, ExpiryTime: 5000, Nonce: nonce, Question: "q", Options: opts,
		}, 1000, "h")
	}
	if r := mk(1, 1); r.Error == nil {
		t.Fatal("1 option must be rejected")
	}
	if r := mk(11, 2); r.Error == nil {
		t.Fatal("11 options must be rejected")
	}
	for _, n := range []int{2, 10} {
		if r := mk(n, uint64(10+n)); r.Error != nil {
			t.Fatalf("%d options must be accepted: %v", n, r.Error)
		}
	}
	// smallest legal seed at the maximum option count must still allow a minimum trade
	c2, fc2, creator2 := nSetup(t)
	r := c2.DeliverMessageCreateMarket(&MessageCreateMarket{
		CreatorAddress: creator2, B0: FINALIZATION_BOUNTY + MIN_SEED_N, ExpiryTime: 5000, Nonce: 1, Question: "q", Options: tenLabels(),
	}, 1000, "h")
	if r.Error != nil {
		t.Fatalf("minimum seed N=10: %v", r.Error)
	}
	fc2.putAccount(t, addr(0xB1), 100_000_000_000)
	if rr := nBuy(c2, DeriveMarketId(creator2, 1), addr(0xB1), 9, PRECISION_SCALE); rr.Error != nil {
		t.Fatalf("minimum trade on a fresh option at minimum seed must pass the position cap: %v", rr.Error)
	}
}

// Binary (legacy LMSR) and N-outcome markets must coexist without touching each other.
func TestAuditBinaryAndNOutcomeCoexist(t *testing.T) {
	c, fc, creator := nSetup(t)
	bettor := addr(0xB1)
	fc.putAccount(t, bettor, 100_000_000_000)
	nid := nCreate(t, c, creator, 1, []string{"A", "B", "C"})
	if r := c.DeliverMessageCreateMarket(&MessageCreateMarket{CreatorAddress: creator, B0: nTestB0, ExpiryTime: 5000, Nonce: 2, Question: "binary?"}, 1000, "h"); r.Error != nil {
		t.Fatal(r.Error)
	}
	bid := DeriveMarketId(creator, 2)
	bm := nMarket(t, fc, bid)
	if len(bm.Options) != 0 || len(bm.Q) != 0 || bm.QYes == 0 || bm.QNo == 0 {
		t.Fatalf("legacy binary market must keep QYes/QNo and have no options: %+v", bm)
	}
	if r := c.DeliverMessageSubmitPrediction(&MessageSubmitPrediction{MarketId: bid, BettorAddress: bettor, Outcome: true, Shares: 2 * PRECISION_SCALE, MaxCost: 50_000_000}, 0, "h"); r.Error != nil {
		t.Fatalf("binary trade: %v", r.Error)
	}
	if r := nBuy(c, nid, bettor, 1, 2*PRECISION_SCALE); r.Error != nil {
		t.Fatalf("N trade: %v", r.Error)
	}
	bm2, nm := nMarket(t, fc, bid), nMarket(t, fc, nid)
	if bm2.QYes != bm.QYes+2*PRECISION_SCALE || bm2.QNo != bm.QNo || len(bm2.Q) != 0 {
		t.Fatalf("binary market state corrupted: %+v", bm2)
	}
	if nm.Q[1] != 2*PRECISION_SCALE || nm.QYes != 0 || nm.QNo != 0 {
		t.Fatalf("N market state corrupted: %+v", nm)
	}
	// payout-mode must stay standard; only 0 is accepted
	if r := c.DeliverMessageCreateMarket(&MessageCreateMarket{CreatorAddress: creator, B0: nTestB0, ExpiryTime: 5000, Nonce: 3, Question: "q", Options: []string{"A", "B"}, PayoutMode: 1}, 1000, "h"); r.Error == nil {
		t.Fatal("unknown payout mode must be rejected")
	}
}

// A voided N-outcome market refunds each bettor's cost and the pool covers it exactly.
func TestAuditNVoidedRefundsSolvent(t *testing.T) {
	c, fc, creator := nSetup(t)
	mid := nCreate(t, c, creator, 1, tenLabels())
	var costs uint64
	bs := make([][]byte, 4)
	for i := range bs {
		bs[i] = addr(byte(0xB0 + i))
		fc.putAccount(t, bs[i], 100_000_000_000)
		if r := nBuy(c, mid, bs[i], uint32(i*3), uint64(i+1)*PRECISION_SCALE); r.Error != nil {
			t.Fatal(r.Error)
		}
		costs += nPos(t, fc, mid, bs[i]).CostPaid
	}
	m := nMarket(t, fc, mid)
	m.Status = STATUS_VOIDED
	fc.set(KeyForMarket(mid), mustMarshal(t, m))
	SetGlobalHeight(m.ExpiryTime + 10)
	var refunded uint64
	for _, b := range bs {
		before := fc.account(b)
		if r := c.DeliverMessageClaimWinnings(&MessageClaimWinnings{MarketId: mid, ClaimantAddress: b}, 0); r.Error != nil {
			t.Fatalf("void refund: %v", r.Error)
		}
		refunded += fc.account(b) - before
	}
	if refunded != costs {
		t.Fatalf("refunded %d != total cost paid %d", refunded, costs)
	}
	if fc.pool(KeyForMarketPool(mid)) != 0 {
		t.Fatal("pool must be swept to treasury after the last refund")
	}
}

// ─── option label hardening (height-gated) ───────────────────────────────────

func withAuditFix(t *testing.T, h uint64) {
	t.Helper()
	old := AUDIT_FIX_HEIGHT
	AUDIT_FIX_HEIGHT = h
	t.Cleanup(func() { AUDIT_FIX_HEIGHT = old })
}

func TestAuditOptionLabelHardeningIsHeightGated(t *testing.T) {
	bad := [][]string{
		{"Yes", "yes"},          // ASCII case-insensitive duplicate
		{"Yes", "No\u200b"},     // zero-width space
		{"Yes", "\ufeffNo"},     // BOM
		{"Yes", "No\u202e"},     // bidi override
		{"Yes", " No"},          // edge whitespace
		{"Yes", "N\x00o"},       // control char
	}
	for _, opts := range bad {
		SetGlobalHeight(100)
		withAuditFix(t, ^uint64(0)) // disabled: legacy rules, labels accepted
		if pe := validateCreateExtras(&MessageCreateMarket{Options: opts, B0: nTestB0}); pe != nil {
			t.Fatalf("before activation %q must follow legacy rules, got %v", opts, pe)
		}
		AUDIT_FIX_HEIGHT = 50 // active at height 100
		if pe := validateCreateExtras(&MessageCreateMarket{Options: opts, B0: nTestB0}); pe == nil {
			t.Fatalf("after activation %q must be rejected", opts)
		}
	}
	SetGlobalHeight(100)
	withAuditFix(t, 50)
	if pe := validateCreateExtras(&MessageCreateMarket{Options: []string{"Yes", "No", "Draw (0-0)", "日本"}, B0: nTestB0}); pe != nil {
		t.Fatalf("ordinary labels must stay valid after activation: %v", pe)
	}
}

// ─── plugin.go / entropy / claim_slash regressions ───────────────────────────

func TestAuditLateFSMResponseDoesNotCrash(t *testing.T) {
	c, _ := newTestChain(t)
	// A reply for a request id that already timed out used to return ErrInvalidPluginRespId,
	// which ListenForInbound turns into log.Fatal (whole plugin exits).
	if pe := c.plugin.handleFSMResponse(&FSMToPlugin{Id: 987654321}); pe != nil {
		t.Fatalf("late/unknown response must be dropped, got %v", pe)
	}
}

func TestAuditEntropyDisabledByDefaultAndPure(t *testing.T) {
	// AUDIT_FIX_HEIGHT is now a live activation height (set in entropy.go); the gate is
	// monotonic: off below it, on at/after it.
	if auditFixActive(AUDIT_FIX_HEIGHT-1) || !auditFixActive(AUDIT_FIX_HEIGHT) {
		t.Fatal("audit gate boundary wrong")
	}
	a, b := nextEntropy(0, 5), nextEntropy(0, 5)
	if a != b || a == 0 || nextEntropy(a, 6) == nextEntropy(a, 7) {
		t.Fatal("accumulator step must be deterministic, non-zero and height-sensitive")
	}
}

func TestAuditEntropyV2WritesProperEncoding(t *testing.T) {
	c, fc, _ := nSetup(t)
	withAuditFix(t, 1)
	if pe := c.advancePanelEntropyV2(10); pe != nil {
		t.Fatal(pe)
	}
	acc := &PanelEntropyAccum{}
	if pe := Unmarshal(fc.get(PANEL_ENTROPY_KEY_V2), acc); pe != nil {
		t.Fatalf("stored value must be a PanelEntropyAccum (what file_dispute decodes): %v", pe)
	}
	if acc.Accumulator != nextEntropy(0, 10) {
		t.Fatal("first step must be nextEntropy(0,height)")
	}
	if pe := c.advancePanelEntropyV2(11); pe != nil {
		t.Fatal(pe)
	}
	Unmarshal(fc.get(PANEL_ENTROPY_KEY_V2), acc)
	if acc.Accumulator != nextEntropy(nextEntropy(0, 10), 11) {
		t.Fatal("accumulator must chain across blocks")
	}
	if len(PANEL_ENTROPY_KEY_V2) == 0 {
		t.Fatal("V2 key must not be empty")
	}
}

func TestAuditClaimSlashSweepIsAtomic(t *testing.T) {
	c, fc, _ := nSetup(t)
	resolver, disputer := addr(0x99), addr(0xD1)
	mid := addr(0x42)
	SetGlobalHeight(900)
	fc.set(KeyForMarket(mid), mustMarshal(t, &MarketState{Status: STATUS_FINALIZED}))
	fc.set(KeyForProposal(mid), mustMarshal(t, &ProposalRecord{ResolverAddr: resolver}))
	fc.set(KeyForDispute(mid), mustMarshal(t, &DisputeRecord{DisputerAddress: disputer, VoteStatus: VOTE_TALLIED}))
	fc.set(KeyForSlashRecord(disputer), mustMarshal(t, &SlashRecord{SlashedAddress: disputer, SlashAmount: 500}))
	fc.set(KeyForTreasuryReserve(mid), mustMarshal(t, &TreasuryReserve{LockedReserve: 800}))
	fc.set(KeyForResolverRecord(resolver), mustMarshal(t, &ResolverRecord{ResolverAddress: resolver, RrsScore: 100, IsActive: true}))
	fc.putPool(t, KeyForResolverFeePool(mid), 777)
	fc.putPool(t, KeyForTreasuryPool(), 1000)
	fc.putAccount(t, resolver, 10)

	w0 := fc.writes
	if r := c.DeliverMessageClaimSlash(&MessageClaimSlash{MarketId: mid, ClaimantAddress: resolver}, 0); r.Error != nil {
		t.Fatalf("claim_slash: %v", r.Error)
	}
	if n := fc.writes - w0; n != 1 {
		t.Fatalf("claim_slash must use ONE atomic StateWrite, used %d", n)
	}
	if got := fc.pool(KeyForTreasuryPool()); got != 1777 {
		t.Fatalf("treasury=%d want 1777 (resolver fee pool swept in the same write)", got)
	}
	if got := fc.pool(KeyForResolverFeePool(mid)); got != 0 {
		t.Fatalf("resolver fee pool=%d want 0", got)
	}
	if got := fc.account(resolver); got != 510 {
		t.Fatalf("claimant=%d want 510", got)
	}
	rr := &ResolverRecord{}
	if pe := Unmarshal(fc.get(KeyForResolverRecord(resolver)), rr); pe != nil || rr.RrsScore != 50 {
		t.Fatalf("resolver rrs=%d err=%v want 50", rr.RrsScore, pe)
	}
}
