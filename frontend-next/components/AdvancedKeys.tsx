"use client";
import { useRef, useState } from "react";
import { useWallet } from "@/store/wallet";
import { aesDecrypt, aesEncrypt, addressFromPub } from "@/lib/wallet";
import { argon2Available, decryptKeystore, encryptKeystore } from "@/lib/keystore";
import { useToast } from "@/store/toast";
import { b2h } from "@/lib/format";
import { bls12_381 } from "@noble/curves/bls12-381";

function download(name: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const inputCls =
  "w-full rounded-card border border-line-2 bg-bg px-3 py-2 font-mono text-[11px] text-ink outline-none focus:border-up";

export default function AdvancedKeys() {
  const { privKey, importKey } = useWallet();
  const toast = useToast((s) => s.show);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [ks, setKs] = useState("");
  const [pw, setPw] = useState("");
  const [cpw, setCpw] = useState("");
  const [cpw2, setCpw2] = useState("");
  const [epw, setEpw] = useState("");
  const [epw2, setEpw2] = useState("");
  const [out, setOut] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (f: File | null) => {
    if (!f) return;
    const text = await f.text();
    setKs(text.trim());
    toast("✓ Keystore file loaded — enter password");
  };

  const doImport = async () => {
    const text = ks.trim();
    if (!text || !pw) {
      toast("Load a keystore file + password", true);
      return;
    }
    setBusy(true);
    try {
      let priv: Uint8Array;
      if (text.startsWith("{")) {
        priv = await decryptKeystore(JSON.parse(text), pw);
      } else {
        priv = await aesDecrypt(text, pw);
      }
      if (priv.length !== 32) throw new Error("bad keystore");
      await importKey(b2h(priv));
      toast("✓ Keystore unlocked");
      setKs("");
      setPw("");
    } catch {
      toast("Decrypt failed — wrong password or corrupted keystore", true);
    } finally {
      setBusy(false);
    }
  };

  const doCreate = async () => {
    if (cpw.length < 8) {
      toast("Password min 8 chars", true);
      return;
    }
    if (cpw !== cpw2) {
      toast("Passwords do not match", true);
      return;
    }
    setBusy(true);
    try {
      const priv = crypto.getRandomValues(new Uint8Array(32));
      const pub = bls12_381.getPublicKey(priv);
      const addr = await addressFromPub(pub);
      const payload = argon2Available()
        ? JSON.stringify(await encryptKeystore(priv, cpw))
        : await aesEncrypt(priv, cpw);
      download(`praxis-keystore-${addr.slice(0, 8)}.json`, payload);
      toast("✓ Keystore downloaded — " + addr.slice(0, 10) + "…");
      setCpw("");
      setCpw2("");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  };

  const doExport = async () => {
    if (!privKey) {
      toast("No key loaded — connect wallet first", true);
      return;
    }
    if (epw.length < 8) {
      toast("Password min 8 chars", true);
      return;
    }
    if (epw !== epw2) {
      toast("Passwords do not match", true);
      return;
    }
    setBusy(true);
    try {
      const payload = argon2Available()
        ? JSON.stringify(await encryptKeystore(privKey, epw))
        : await aesEncrypt(privKey, epw);
      setOut(payload);
      toast("✓ Keystore built — copy or it stays on screen");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-3.5 animate-fadeUp rounded-card border border-line bg-surface">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 font-mono text-[9px] uppercase tracking-[2px] text-up"
      >
        Advanced — Manual Keystore
        <span>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="space-y-3 px-4 pb-4">
          {/* IMPORT */}
          <div className="rounded-card border border-line bg-bg-2 p-3">
            <div className="mb-3 border-b border-line pb-2 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">
              // import_keystore
            </div>
            <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-2">Keystore file (.json)</div>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
              className="mb-1 w-full rounded-card border border-line-2 bg-bg px-2 py-2 font-mono text-[10px] text-ink-2"
            />
            <div className="mb-2 font-mono text-[8px] text-ink-3">Upload your encrypted Praxis keystore JSON</div>
            <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-2">Password</div>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Keystore password…" className={inputCls} />
            <textarea
              value={ks}
              onChange={(e) => setKs(e.target.value)}
              placeholder="…or paste keystore JSON / Praxis hex here"
              rows={2}
              className={`${inputCls} mt-2 break-all opacity-70`}
            />
            <div className="mt-2 flex gap-1.5">
              <button onClick={() => void doImport()} disabled={busy} className="rounded-card bg-up px-4 py-2 font-sans text-[11px] font-bold text-black disabled:opacity-40">
                {busy ? "▪▪▪" : "🔓 Unlock Keystore"}
              </button>
              <button onClick={() => { setKs(""); setPw(""); if (fileRef.current) fileRef.current.value = ""; }} className="rounded-card border border-line-2 px-3 py-2 font-mono text-[9px] text-ink-2">
                Clear
              </button>
            </div>
          </div>

          {/* CREATE */}
          <div className="rounded-card border border-line bg-bg-2 p-3">
            <div className="mb-3 border-b border-line pb-2 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">
              // create_keystore
            </div>
            <div className="mb-3 rounded-card border border-amberx/40 bg-amberx/5 p-2 font-mono text-[9px] text-amberx">
              Generates a new BLS12-381 keypair and downloads an encrypted keystore file.
            </div>
            <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-2">Password</div>
            <input type="password" value={cpw} onChange={(e) => setCpw(e.target.value)} placeholder="Choose a strong password…" className={inputCls} />
            <div className="mb-1 mt-2 font-mono text-[9px] uppercase tracking-[2px] text-ink-2">Confirm password</div>
            <input type="password" value={cpw2} onChange={(e) => setCpw2(e.target.value)} placeholder="Confirm password…" className={inputCls} />
            <button onClick={() => void doCreate()} disabled={busy} className="mt-2 rounded-card bg-up px-4 py-2 font-sans text-[11px] font-bold text-black disabled:opacity-40">
              {busy ? "▪▪▪" : "⊕ Generate & Download"}
            </button>
          </div>

          {/* EXPORT current session key */}
          <div className="rounded-card border border-line bg-bg-2 p-3">
            <div className="mb-3 border-b border-line pb-2 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">
              // export_keystore (current key)
            </div>
            <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-2">Password</div>
            <input type="password" value={epw} onChange={(e) => setEpw(e.target.value)} placeholder="Choose a strong password…" className={inputCls} />
            <div className="mb-1 mt-2 font-mono text-[9px] uppercase tracking-[2px] text-ink-2">Confirm password</div>
            <input type="password" value={epw2} onChange={(e) => setEpw2(e.target.value)} placeholder="Confirm password…" className={inputCls} />
            {out && (
              <textarea readOnly value={out} rows={3} className={`${inputCls} mt-2 break-all opacity-70`} onFocus={(e) => e.currentTarget.select()} />
            )}
            <button onClick={() => void doExport()} disabled={busy} className="mt-2 rounded-card bg-up px-4 py-2 font-sans text-[11px] font-bold text-black disabled:opacity-40">
              {busy ? "▪▪▪" : "⊕ Build Keystore"}
            </button>
          </div>

          <div className="font-mono text-[8px] leading-relaxed text-ink-3">
            Formats: Canopy argon2id JSON · canopy Argon2i · legacy PBKDF2-200k · Praxis PBKDF2-100k hex · imported keys live in memory only
          </div>
        </div>
      )}
    </section>
  );
}
