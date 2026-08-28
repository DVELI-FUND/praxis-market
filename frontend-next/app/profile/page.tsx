"use client";
import { useState } from "react";
import { useWallet } from "@/store/wallet";
import { queryAccount } from "@/lib/rpc";
import { fmtPRX } from "@/lib/format";
import MyPredictions from "@/components/MyPredictions";

export default function ProfilePage() {
  const { status, ethAddress, praxisAddress, pubHex, error, connect, disconnect } = useWallet();
  const connected = status === "connected" || status === "drift";

  const [balance, setBalance] = useState<string | null>(null);
  const [balErr, setBalErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const queryBalance = async () => {
    if (!praxisAddress) return;
    setLoading(true);
    setBalErr(null);
    try {
      const d = await queryAccount(praxisAddress);
      setBalance(fmtPRX(d.amount || 0));
    } catch (e) {
      setBalErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2.5 font-mono text-[9px] uppercase tracking-[3px] text-up">
          <span className="inline-block h-px w-5 bg-up" /> Account
        </div>
        <h1 className="font-display text-[22px] font-extrabold tracking-[-0.3px]">Profile</h1>
        <p className="mt-1 text-[13px] text-ink-2">Your identity, keys, and activity on Praxis</p>
      </div>

      {error && (
        <div className="mb-4 rounded-card border border-down/40 bg-down-dim p-3 font-mono text-[10px] text-down">
          ⚠ {error}
        </div>
      )}

      <section className="mb-3.5 animate-fadeUp rounded-card border border-line bg-surface p-4">
        <div className="mb-4 border-b border-line pb-2.5 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">
          // connect_wallet — recommended
        </div>
        {!connected ? (
          <>
            <div className="mb-3.5 font-mono text-[11px] leading-relaxed text-ink-2">
              Connect MetaMask to automatically derive your Praxis BLS signing key.
              <br />
              <em>Same MetaMask account = same Praxis key on any device. No file import needed.</em>
            </div>
            <button
              onClick={() => void connect()}
              className="rounded-card bg-up py-2 font-sans text-[13px] font-semibold text-black transition-all hover:brightness-110"
              style={{ paddingLeft: 18, paddingRight: 18 }}
            >
              🦊 Connect Wallet
            </button>
          </>
        ) : (
          <>
            <div className="mb-3 font-mono text-[11px] text-up">✓ connected</div>
            <div className="mb-2.5">
              <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-2">ETH Address</div>
              <div className="font-mono text-[11px] text-up">{ethAddress}</div>
            </div>
            <div className="mb-3.5">
              <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-2">Praxis Address (derived)</div>
              <div className="font-mono text-[11px] text-cyanx">{praxisAddress}</div>
            </div>
            <button
              onClick={disconnect}
              className="rounded-card border border-line-2 bg-transparent px-3 py-1.5 font-mono text-[10px] text-ink-2 transition-colors hover:border-up hover:text-up"
            >
              Disconnect
            </button>
          </>
        )}
      </section>

      <section className="mb-3.5 animate-fadeUp rounded-card border border-line bg-surface p-4" style={{ animationDelay: "60ms" }}>
        <div className="mb-4 border-b border-line pb-2.5 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">
          // session_status
        </div>
        <div className={`font-mono text-[11px] ${connected ? "text-up" : "text-ink-2"}`}>
          {connected
            ? "✓ loaded — " + (praxisAddress || "").slice(0, 16) + "…"
            : "○ No key loaded — transactions cannot be signed"}
        </div>
        {connected && pubHex && (
          <div className="mt-3.5">
            <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-2">Public Key (48 bytes · G1)</div>
            <div className="break-all font-mono text-[9px] text-ink-2">{pubHex}</div>
          </div>
        )}
      </section>

      <section className="mb-3.5 animate-fadeUp rounded-card border border-line bg-surface p-4" style={{ animationDelay: "120ms" }}>
        <div className="mb-4 border-b border-line pb-2.5 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">
          // balance_lookup
        </div>
        <div className="mb-3">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-2">Address (40 hex)</div>
          <input
            readOnly
            value={praxisAddress || ""}
            placeholder="e7c7dad1…"
            className="w-full rounded-card border border-line-2 bg-bg px-3 py-2 font-mono text-[12px] text-ink outline-none"
          />
        </div>
        <button
          onClick={() => void queryBalance()}
          disabled={loading || !praxisAddress}
          className="rounded-card bg-up px-4 py-2 font-sans text-[13px] font-semibold text-black transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Query Balance
        </button>
        {balErr && <div className="mt-3 font-mono text-[10px] text-down">⚠ {balErr}</div>}
        {balance !== null && (
          <div className="mt-4 flex items-center gap-3.5">
            <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border border-line-2 bg-bg-2 font-mono text-[10px] text-up">
              PRX
            </div>
            <div>
              <div className="font-display text-[22px] font-extrabold tabular-nums">{balance}</div>
              <div className="font-mono text-[9px] tracking-[1px] text-ink-3">$PRX LIQUID</div>
            </div>
          </div>
        )}
      </section>

      <MyPredictions />

      <section className="animate-fadeUp rounded-card border border-line bg-surface p-4" style={{ animationDelay: "180ms" }}>
        <div className="mb-4 border-b border-line pb-2.5 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">
          // signing_spec
        </div>
        <div className="font-mono text-[10px] leading-[1.7] text-ink-2">
          1. sign_bytes = proto.Marshal(Transaction{`{…, `}<em>signature:nil</em>{`}`}
          <br />
          2. time = <em>BigInt(Date.now()) × 1000n</em> — microseconds
          <br />
          3. BLS12-381 <em>G2 signature (96 bytes)</em> — @noble/curves
          <br />
          4. address = <em>SHA256(pubKey).slice(0,20)</em>
          <br />
          5. Keystore cache = <em>AES-256-GCM + PBKDF2 (100k iterations)</em>
        </div>
      </section>
    </main>
  );
}
