import sys
path = "plugin/go/contract/patch_v4_test.go"
src = open(path).read()
old = 't.Fatal("V4 gate boundary wrong")'
new = 't.Fatalf("V4 gate boundary wrong: v4=%d v3=%d audit=%d resolver=%d", PATCH_V4_HEIGHT, PATCH_V3_HEIGHT, AUDIT_FIX_HEIGHT, RESOLVER_FIX_HEIGHT)'
if src.count(old) != 1:
    print("ABORT: found", src.count(old))
    sys.exit(1)
open(path, "w").write(src.replace(old, new))
print("patched")
