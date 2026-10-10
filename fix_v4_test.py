import sys

path = "plugin/go/contract/patch_v4_test.go"
src = open(path).read()

old = "\n".join([
    "func TestV4_GateOffByDefault(t *testing.T) {",
    "\tif PATCH_V4_HEIGHT != ^uint64(0) {",
    "\t\tt.Fatal(\"PATCH_V4_HEIGHT must ship disabled\")",
    "\t}",
    "\tif patchV4Active(1 << 62) {",
    "\t\tt.Fatal(\"v4 gate must be off\")",
    "\t}",
    "}",
])

new = "\n".join([
    "func TestV4_GateBoundary(t *testing.T) {",
    "\t// V4 is live on the chain (height set); the gate must flip exactly at its height.",
    "\tif PATCH_V4_HEIGHT == ^uint64(0) {",
    "\t\tt.Skip(\"V4 gate disabled in this build\")",
    "\t}",
    "\tif patchV4Active(PATCH_V4_HEIGHT-1) || !patchV4Active(PATCH_V4_HEIGHT) {",
    "\t\tt.Fatal(\"V4 gate boundary wrong\")",
    "\t}",
    "}",
])

n = src.count(old)
if n != 1:
    print("ABORT: expected 1 match, found", n)
    sys.exit(1)

open(path, "w").write(src.replace(old, new))
print("patched", path)
