"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/store/wallet";

export default function WalletPill({ size = "sm" }: { size?: "sm" | "lg" }) {
  const status = useWallet((s) => s.status);
  const praxisAddress = useWallet((s) => s.praxisAddress);
  const walletName = useWallet((s) => s.walletName);
  const connect = useWallet((s) => s.connect);
  const openModal = useWallet((s) => s.openModal);
  const disconnect = useWallet((s) => s.disconnect);

  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const connected = (status === "connected" || status === "drift") && !!praxisAddress;
  const short = praxisAddress ? praxisAddress.slice(0, 6) + "…" + praxisAddress.slice(-4) : "";

  if (!connected) {
    const big = size === "lg";
    return (
      <button
        onClick={() => void connect()}
        disabled={status === "connecting"}
        className={`inline-flex items-center justify-center gap-2 rounded-pill bg-grad-up font-mono font-bold text-black shadow-glowUp transition hover:brightness-110 disabled:opacity-60 ${
          big ? "px-8 py-3.5 text-[13px]" : "px-4 py-2 text-[11px]"
        }`}
      >
        <span className="text-[1.1em] leading-none">◈</span>
        {status === "connecting" ? "Connecting…" : "Connect Wallet"}
      </button>
    );
  }

  const drift = status === "drift";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(praxisAddress as string);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setMenu((m) => !m)}
        aria-haspopup="menu"
        aria-expanded={menu}
        className={`flex items-center gap-2 rounded-pill border px-3 py-2 font-mono text-[10px] transition-colors ${
          drift ? "border-amberx/50 bg-amberx/10 text-amberx" : "border-up/30 bg-up-dim text-up"
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${drift ? "bg-amberx" : "animate-pulseDot bg-up"}`} />
        <span>{drift ? "Account changed" : short}</span>
        <span className="opacity-70">▾</span>
      </button>

      {menu && (
        <div
          role="menu"
          className="absolute right-0 top-full z-[200] mt-2 w-[260px] max-w-[calc(100vw-2rem)] rounded-card border border-line bg-surface-grad p-3 shadow-card"
        >
          <div className="font-mono text-[9px] uppercase tracking-[2px] text-ink-3">{walletName || "Wallet"}</div>
          <div className="mt-1 break-all font-mono text-[10px] text-ink">{praxisAddress}</div>
          <div className="mt-3 flex flex-col gap-1.5">
            <button
              role="menuitem"
              onClick={copy}
              className="rounded-card border border-line bg-surface px-3 py-2 text-left font-mono text-[10px] text-ink-2 hover:text-ink"
            >
              {copied ? "✓ Copied" : "Copy address"}
            </button>
            <Link
              role="menuitem"
              href="/profile"
              onClick={() => setMenu(false)}
              className="rounded-card border border-line bg-surface px-3 py-2 font-mono text-[10px] text-ink-2 hover:text-ink"
            >
              Portfolio
            </Link>
            <button
              role="menuitem"
              onClick={() => {
                setMenu(false);
                openModal();
              }}
              className="rounded-card border border-line bg-surface px-3 py-2 text-left font-mono text-[10px] text-ink-2 hover:text-ink"
            >
              Switch wallet
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setMenu(false);
                disconnect();
              }}
              className="rounded-card border border-down/40 bg-down-dim px-3 py-2 text-left font-mono text-[10px] text-down hover:brightness-110"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
