"use client";
import { useEffect, useRef, useState } from "react";
import { bls12_381 } from "@noble/curves/bls12-381";
import { b2h } from "@/lib/format";
import { useWallet } from "@/store/wallet";
import { decryptKeystore, encryptKey, PRAXIS_KEYSTORE_LS, type KeystoreFile } from "@/lib/keystore";

const inp = "w-full rounded-card border border-line bg-bg-2 px-3 py-2 font-mono text-[11px] text-ink outline-none focus:border-up/60";
const lbl = "mb-1 block font-mono text-[9px] uppercase tracking-[2px] text-ink-3";
const btnUp = "rounded border border-up bg-up px-4 py-2 font-mono text-[11px] font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-50";
const btnGhost = "rounded border border-line bg-surface px-4 py-2 font-mono text-[11px] text-ink-2 hover:text-ink";

export default function KeystorePanel() {
  const [open, setOpen] = useState(false);
  const importKey = useWallet((s) => s.importKey);

  const fileRef = useRef<HTMLInputElement>(null);
  const [impPw, setImpPw] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [quickPw, setQuickPw] = useState("");
  const [busy, setBusy] = useState<"" | "import" | "create" | "quick">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saved, setSaved] = useState<KeystoreFile | null>(null);

  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(PRAXIS_KEYSTORE_LS);
      if (raw) setSaved(JSON.parse(raw));
    } catch {}
  }, [open]);

  const unlock = async (priv: Uint8Array, expectPub: string) => {
    const pub = bls12_381.getPublicKey(priv);
    if (b2h(pub) !== expectPub) throw new Error("Wrong password or corrupted keystore");
    await importKey(b2h(priv));
    return pub;
  };

  const doImport = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return setMsg({ ok: false, text: "Select a keystore file" });
    if (!impPw) return setMsg({ ok: false, text: "Enter password" });
    setBusy("import"); setMsg(null);
    try {
      const raw = JSON.parse(await f.text()) as KeystoreFile;
      const priv = await decryptKeystore(raw, impPw);
      await unlock(priv, raw.publicKey);
      localStorage.setItem(PRAXIS_KEYSTORE_LS, JSON.stringify(raw));
      setSaved(raw);
      setMsg({ ok: true, text: "Keystore unlocked — " + (raw.keyAddress || "").slice(0, 8) + "…" });
      setImpPw("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setMsg({ ok: false, text: "Import failed: " + (e as Error).message });
    } finally { setBusy(""); }
  };

  const doCreate = async () => {
    if (!pw1) return setMsg({ ok: false, text: "Enter a password" });
    if (pw1 !== pw2) return setMsg({ ok: false, text: "Passwords do not match" });
    if (pw1.length < 8) return setMsg({ ok: false, text: "Password must be at least 8 characters" });
    setBusy("create"); setMsg(null);
    try {
      const priv = bls12_381.utils.randomPrivateKey();
      const pub = bls12_381.getPublicKey(priv);
      const hash = await crypto.subtle.digest("SHA-256", pub as BufferSource);
      const address = b2h(new Uint8Array(hash).slice(0, 20));
      const base = await encryptKey(priv, pw1);
      const keystore: KeystoreFile = { ...base, publicKey: b2h(pub), keyAddress: address };
      const blob = new Blob([JSON.stringify(keystore, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "praxis-keystore-" + address.slice(0, 8) + ".json";
      a.click();
      URL.revokeObjectURL(url);
      await importKey(b2h(priv));
      localStorage.setItem(PRAXIS_KEYSTORE_LS, JSON.stringify(keystore));
      setSaved(keystore);
      setMsg({ ok: true, text: "Keystore created and loaded" });
      setPw1(""); setPw2("");
    } catch (e) {
      setMsg({ ok: false, text: "Create failed: " + (e as Error).message });
    } finally { setBusy(""); }
  };

  const doQuick = async () => {
    if (!saved) return;
    if (!quickPw) return setMsg({ ok: false, text: "Enter password" });
    setBusy("quick"); setMsg(null);
    try {
      const priv = await decryptKeystore(saved, quickPw);
      await unlock(priv, saved.publicKey);
      setMsg({ ok: true, text: "Session restored — " + (saved.keyAddress || "").slice(0, 8) + "…" });
      setQuickPw("");
    } catch (e) {
      setMsg({ ok: false, text: "Unlock failed: " + (e as Error).message });
    } finally { setBusy(""); }
  };

  const clearSaved = () => {
    localStorage.removeItem(PRAXIS_KEYSTORE_LS);
    setSaved(null);
    setMsg({ ok: true, text: "Saved keystore removed" });
  };

  return (
    <section className="mt-6">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-card border border-line bg-surface px-4 py-3 font-mono text-[9px] uppercase tracking-[2px] text-ink-2 hover:text-ink"
      >
        Advanced — Manual Keystore
        <span>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-4">
          {saved && (
            <div className="rounded-card border border-line bg-surface p-4">
              <div className="mb-3 border-b border-line pb-2 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">// quick_unlock</div>
              <div className="mb-2 font-mono text-[10px] text-ink-2">Saved: {(saved.keyAddress || "").slice(0, 8)}…{(saved.keyAddress || "").slice(-6)}</div>
              <input type="password" className={inp} placeholder="Keystore password…" value={quickPw} onChange={(e) => setQuickPw(e.target.value)} />
              <div className="mt-2 flex gap-2">
                <button className={btnUp} disabled={busy !== ""} onClick={doQuick}>{busy === "quick" ? "…" : "🔓 Unlock Keystore"}</button>
                <button className={btnGhost} onClick={clearSaved}>Clear</button>
              </div>
            </div>
          )}

          <div className="rounded-card border border-line bg-surface p-4">
            <div className="mb-3 border-b border-line pb-2 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">// import_keystore</div>
            <label className={lbl}>Keystore file (.json)</label>
            <input ref={fileRef} type="file" accept=".json,application/json" className="mb-1 w-full font-mono text-[10px] text-ink-2 file:mr-3 file:rounded file:border-0 file:bg-ink-2 file:px-3 file:py-1.5 file:text-[10px] file:text-black" />
            <div className="mb-3 font-mono text-[9px] text-ink-3">Upload your encrypted Praxis keystore JSON</div>
            <label className={lbl}>Password</label>
            <input type="password" className={inp} placeholder="Keystore password…" value={impPw} onChange={(e) => setImpPw(e.target.value)} />
            <div className="mt-3 flex gap-2">
              <button className={btnUp} disabled={busy !== ""} onClick={doImport}>{busy === "import" ? "…" : "🔓 Unlock Keystore"}</button>
              <button className={btnGhost} onClick={() => { setImpPw(""); if (fileRef.current) fileRef.current.value = ""; }}>Clear</button>
            </div>
          </div>

          <div className="rounded-card border border-line bg-surface p-4">
            <div className="mb-3 border-b border-line pb-2 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">// create_keystore</div>
            <div className="mb-3 rounded-card border border-amberx/40 bg-amberx/5 p-2.5 font-mono text-[10px] text-amberx">
              Generates a new BLS12-381 keypair and downloads an encrypted keystore file.
            </div>
            <label className={lbl}>Password</label>
            <input type="password" className={inp} placeholder="Choose a strong password…" value={pw1} onChange={(e) => setPw1(e.target.value)} />
            <label className={`${lbl} mt-3`}>Confirm password</label>
            <input type="password" className={inp} placeholder="Confirm password…" value={pw2} onChange={(e) => setPw2(e.target.value)} />
            <button className={`${btnUp} mt-3`} disabled={busy !== ""} onClick={doCreate}>{busy === "create" ? "…" : "⚙ Generate & Download"}</button>
          </div>

          <div className="rounded-card border border-line bg-surface p-4">
            <div className="mb-3 border-b border-line pb-2 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">// signing_spec</div>
            <pre className="font-mono text-[9px] leading-relaxed text-ink-3">{`1. sign_bytes = proto.Marshal(Transaction{…, signature:nil})
2. time = BigInt(Date.now()) × 1000n — microseconds
3. BLS12-381 G2 signature (96 bytes) — @noble/curves
4. address = SHA256(pubKey).slice(0,20)
5. Keystore = AES-GCM + Argon2id (3/64MB/4) · PBKDF2-200k legacy`}</pre>
          </div>

          {msg && (
            <div className={`rounded-card border p-3 font-mono text-[10px] ${msg.ok ? "border-up/40 bg-up/5 text-up" : "border-down/40 bg-down/5 text-down"}`}>
              {msg.text}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
