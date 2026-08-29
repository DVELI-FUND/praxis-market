"use client";
import { useState } from "react";
import { useWallet } from "@/store/wallet";
import { aesDecrypt, aesEncrypt } from "@/lib/wallet";
import { argon2Available, decryptKeystore, encryptKeystore } from "@/lib/keystore";
import { useToast } from "@/store/toast";
import { b2h } from "@/lib/format";

type Mode = null | "raw" | "export" | "import";

export default function AdvancedKeys() {
  const { privKey, importKey } = useWallet();
  const toast = useToast((s) => s.show);
  const [mode, setMode] = useState<Mode>(null);
  const [raw, setRaw] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [ks, setKs] = useState("");
  const [out, setOut] = useState("");
  const [outKind, setOutKind] = useState("");
  const [busy, setBusy] = useState(false);

  const inputCls =
    "w-full rounded-card border border-line-2 bg-bg px-3 py-2 font-mono text-[11px] text-ink outline-none focus:border-up";

  const doRaw = async () => {
    const hex = raw.trim().toLowerCase().replace(/^0x/, "");
    if (!/^[0-9a-f]{64}$/.test(hex)) {
      toast("Private key must be 64 hex chars", true);
      return;
    }
    try {
      await importKey(hex);
      toast("✓ Key loaded — session only, export a keystore to persist");
      setMode(null);
      setRaw("");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    }
  };

  const doExport = async () => {
    if (!privKey) {
      toast("No key loaded", true);
      return;
    }
    if (pw.length < 8) {
      toast("Password min 8 chars", true);
      return;
    }
    if (pw !== pw2) {
      toast("Passwords do not match", true);
      return;
    }
    setBusy(true);
    try {
      if (argon2Available()) {
        const ksObj = await encryptKeystore(privKey, pw);
        setOut(JSON.stringify(ksObj));
        setOutKind("argon2id JSON — compatible with legacy Praxis & Canopy CLI");
      } else {
        const hex = await aesEncrypt(privKey, pw);
        setOut(hex);
        setOutKind("PBKDF2-100k hex (argon2 bundle unavailable)");
      }
      toast("✓ Keystore built — copy and store safely");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    const text = ks.trim();
    if (!text || !pw) {
      toast("Paste keystore + password", true);
      return;
    }
    setBusy(true);
    try {
      let priv: Uint8Array;
      if (text.startsWith("{")) {
        // legacy / canopy JSON keystore (argon2id | canopy | pbkdf2-200k)
        priv = await decryptKeystore(JSON.parse(text), pw);
      } else {
        // our PBKDF2-100k hex format
        priv = await aesDecrypt(text, pw);
      }
      if (priv.length !== 32) throw new Error("bad keystore");
      await importKey(b2h(priv));
      toast("✓ Keystore unlocked");
      setMode(null);
      setKs("");
      setPw("");
    } catch {
      toast("Decrypt failed — wrong password or corrupted keystore", true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-3.5 animate-fadeUp rounded-card border border-line bg-surface p-4">
      <div className="mb-4 border-b border-line pb-2.5 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">
        // advanced_keys
      </div>

      {mode === null && (
        <div className="grid grid-cols-3 gap-1.5">
          <button onClick={() => setMode("raw")} className="rounded-card border border-line-2 px-2 py-2 font-mono text-[9px] text-ink-2 transition-colors hover:border-up hover:text-up">
            Import raw key
          </button>
          <button onClick={() => setMode("export")} className="rounded-card border border-line-2 px-2 py-2 font-mono text-[9px] text-ink-2 transition-colors hover:border-up hover:text-up">
            Export keystore
          </button>
          <button onClick={() => setMode("import")} className="rounded-card border border-line-2 px-2 py-2 font-mono text-[9px] text-ink-2 transition-colors hover:border-up hover:text-up">
            Import keystore
          </button>
        </div>
      )}

      {mode === "raw" && (
        <div className="space-y-2">
          <input value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="64-hex BLS private key" className={inputCls} />
          <div className="flex gap-1.5">
            <button onClick={() => void doRaw()} className="flex-1 rounded-card bg-up py-2 font-sans text-[11px] font-bold text-black">Load key</button>
            <button onClick={() => setMode(null)} className="rounded-card border border-line-2 px-3 py-2 font-mono text-[9px] text-ink-2">Cancel</button>
          </div>
        </div>
      )}

      {mode === "export" && (
        <div className="space-y-2">
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password (min 8)" className={inputCls} />
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Repeat password" className={inputCls} />
          {out && (
            <>
              <textarea readOnly value={out} rows={4} className={`${inputCls} break-all opacity-70`} onFocus={(e) => e.currentTarget.select()} />
              <div className="font-mono text-[8px] text-ink-3">{outKind}</div>
            </>
          )}
          <div className="flex gap-1.5">
            <button onClick={() => void doExport()} disabled={busy} className="flex-1 rounded-card bg-up py-2 font-sans text-[11px] font-bold text-black disabled:opacity-40">
              {busy ? "▪▪▪" : "Build keystore"}
            </button>
            <button onClick={() => { setMode(null); setOut(""); setPw(""); setPw2(""); }} className="rounded-card border border-line-2 px-3 py-2 font-mono text-[9px] text-ink-2">
              Close
            </button>
          </div>
        </div>
      )}

      {mode === "import" && (
        <div className="space-y-2">
          <textarea value={ks} onChange={(e) => setKs(e.target.value)} placeholder='Keystore — JSON {"kdf":…} or Praxis hex' rows={4} className={`${inputCls} break-all`} />
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" className={inputCls} />
          <div className="flex gap-1.5">
            <button onClick={() => void doImport()} disabled={busy} className="flex-1 rounded-card bg-up py-2 font-sans text-[11px] font-bold text-black disabled:opacity-40">
              {busy ? "▪▪▪" : "Unlock keystore"}
            </button>
            <button onClick={() => { setMode(null); setKs(""); setPw(""); }} className="rounded-card border border-line-2 px-3 py-2 font-mono text-[9px] text-ink-2">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 font-mono text-[8px] leading-relaxed text-ink-3">
        Formats: Canopy argon2id JSON · canopy Argon2i · legacy PBKDF2-200k · Praxis PBKDF2-100k hex · imported keys live in memory only
      </div>
    </section>
  );
}
