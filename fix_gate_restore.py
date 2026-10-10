import sys

def patch_v3_test():
    path = "plugin/go/contract/patch_v3_test.go"
    src = open(path).read()
    bad = "\t\tPATCH_V3_HEIGHT, RESOLVER_FIX_HEIGHT, AUDIT_FIX_HEIGHT = ^uint64(0), 64483, 64483\n"
    fn = "func TestV3_BinaryCostMatchesFloatWithinOneUnit(t *testing.T) {\n"
    fcall = "\t\tfl, _ := ComputeTradeCost(qy, qn, b, sh, out) // gate off -> float\n"
    if "oP, oR, oA :=" in src and bad not in src:
        print("patch_v3_test.go: already patched"); return True
    if src.count(bad) != 1 or src.count(fn) != 1 or src.count(fcall) != 1:
        print("ABORT patch_v3_test.go: unexpected content", src.count(bad), src.count(fn), src.count(fcall)); return False
    src = src.replace(fn, fn + "\toP, oR, oA := PATCH_V3_HEIGHT, RESOLVER_FIX_HEIGHT, AUDIT_FIX_HEIGHT\n\tdefer func() { PATCH_V3_HEIGHT, RESOLVER_FIX_HEIGHT, AUDIT_FIX_HEIGHT = oP, oR, oA }()\n")
    src = src.replace(fcall, "\t\tPATCH_V3_HEIGHT = ^uint64(0)\n\t\tSetGlobalHeight(100)\n" + fcall)
    src = src.replace(bad, "")
    open(path, "w").write(src)
    print("patch_v3_test.go: patched"); return True

def patch_golden():
    path = "plugin/go/contract/lmsr_golden_test.go"
    g = open(path).read()
    fn = "func TestLegacyLmsrGolden(t *testing.T) {\n"
    marker = "SetGlobalHeight(1) // float path"
    if marker in g:
        print("lmsr_golden_test.go: already patched"); return True
    if g.count(fn) != 1:
        print("ABORT lmsr_golden_test.go: unexpected content"); return False
    g = g.replace(fn, fn + "\t" + marker + ": pin below every gate so test order cannot change the engine\n")
    open(path, "w").write(g)
    print("lmsr_golden_test.go: patched"); return True

ok = patch_v3_test() and patch_golden()
sys.exit(0 if ok else 1)
