"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/store/wallet";
import {
  ensureWalletDiscovery,
  isMobileBrowser,
  listWallets,
  mobileDeepLinks,
  subscribeWallets,
  WALLET_DOWNLOADS,
  type DiscoveredWallet,
} from "@/lib/walletProviders";

const row =
  "flex w-full items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-up/60 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50";

export default function WalletModal() {
  const router = useRouter();
  const open = useWallet((s) => s.modalOpen);
  const status = useWallet((s) => s.status);
  const error = useWallet((s) => s.error);
  const walletName = useWallet((s) => s.walletName);
  const closeModal = useWallet((s) => s.closeModal);
  const connectWallet = useWallet((s) => s.connectWallet);

  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);
  const [searching, setSearching] = useState(true);
  const busy = status === "connecting";

  useEffect(() => {
    if (!open) return;
    ensureWalletDiscovery();
    setWallets(listWallets());
    setSearching(true);
    const unsub = subscribeWallets(() => setWallets(listWallets()));
    const t = setTimeout(() => setSearching(false), 1500);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      unsub();
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, closeModal]);

  if (!open) return null;

  const mobile = isMobileBrowser();
  const host = typeof window !== "undefined" ? window.location.host : "";

  return (
    <div
      className="fixed inset-0 z-[240] flex items-end justify-center bg-black/70 backdrop-blur-[4px] sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Connect wallet"
        className="max-h-[92vh] w-full max-w-[440px] overflow-y-auto rounded-t-[20px] border border-line bg-surface-grad p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-card sm:rounded-card"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-[18px] font-extrabold text-ink">Connect wallet</h2>
            <p className="mt-1 font-mono text-[10px] leading-relaxed text-ink-3">
              Pick the wallet you already use. You sign one free message — no gas, no transaction, no funds move.
            </p>
          </div>
          <button
            onClick={closeModal}
            disabled={busy}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill border border-line-2 bg-surface font-mono text-[12px] text-ink-2 hover:text-ink disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        {host && (
          <div className="mb-3 rounded-card border border-amberx/30 bg-amberx/10 px-3 py-2 font-mono text-[10px] leading-relaxed text-amberx">
            Safety check: the wallet pop-up must say <b>{host}</b>. If it shows any other site, reject it.
          </div>
        )}

        {busy && (
          <div className="mb-3 rounded-card border border-up/30 bg-up-dim px-3 py-3 font-mono text-[10px] leading-relaxed text-up" role="status">
            Waiting for {walletName || "your wallet"}… approve the signature request there. On a new device you are asked
            twice, to confirm your wallet gives a stable Praxis address.
          </div>
        )}

        {error && !busy && (
          <div className="mb-3 rounded-card border border-down/40 bg-down-dim px-3 py-2 font-mono text-[10px] leading-relaxed text-down" role="alert">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {wallets.map((w) => (
            <button key={w.id} className={row} disabled={busy} onClick={() => void connectWallet(w)}>
              {w.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={w.icon} alt="" className="h-8 w-8 rounded-lg" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-3 font-mono text-[12px] text-ink-2">◈</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-[13px] font-bold text-ink">{w.name}</span>
                <span className="block font-mono text-[9px] uppercase tracking-[1.5px] text-up">Detected</span>
              </span>
              <span className="font-mono text-[12px] text-ink-3">→</span>
            </button>
          ))}

          {wallets.length === 0 && searching && (
            <div className="rounded-card border border-line bg-surface px-4 py-4 text-center font-mono text-[10px] text-ink-3">
              Looking for wallets…
            </div>
          )}

          {wallets.length === 0 && !searching && (
            <div className="rounded-card border border-line bg-surface px-4 py-4">
              <div className="font-display text-[13px] font-bold text-ink">No wallet found in this browser</div>
              {mobile ? (
                <>
                  <p className="mt-1 font-mono text-[10px] leading-relaxed text-ink-3">
                    Open Praxis inside your wallet app&apos;s built-in browser:
                  </p>
                  <div className="mt-3 flex flex-col gap-2">
                    {mobileDeepLinks().map((l) => (
                      <a key={l.name} href={l.href} className={row}>
                        <span className="flex-1 font-display text-[13px] font-bold text-ink">Open in {l.name}</span>
                        <span className="font-mono text-[12px] text-ink-3">↗</span>
                      </a>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-1 font-mono text-[10px] leading-relaxed text-ink-3">
                    Install a browser wallet, then reload this page:
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {WALLET_DOWNLOADS.map((d) => (
                      <a
                        key={d.name}
                        href={d.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-pill border border-line-2 bg-surface-2 px-3 py-1.5 font-mono text-[10px] text-ink-2 hover:border-up hover:text-up"
                      >
                        {d.name} ↗
                      </a>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="my-4 flex items-center gap-3 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">
          <span className="h-px flex-1 bg-line" />
          or
          <span className="h-px flex-1 bg-line" />
        </div>

        <button
          className={row}
          disabled={busy}
          onClick={() => {
            useWallet.getState().closeModal();
            router.push("/profile");
          }}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-3 font-mono text-[12px] text-ink-2">⚿</span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[13px] font-bold text-ink">Use a Praxis keystore file</span>
            <span className="block font-mono text-[9px] text-ink-3">Encrypted key file, unlocked with your password</span>
          </span>
          <span className="font-mono text-[12px] text-ink-3">→</span>
        </button>

        <p className="mt-4 font-mono text-[9px] leading-relaxed text-ink-3">
          Non-custodial: your Praxis key is derived in this browser from your wallet signature and is never sent to any
          server. Never sign this request on a site you do not recognise.
        </p>
      </div>
    </div>
  );
}
