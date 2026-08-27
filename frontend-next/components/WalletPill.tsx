"use client";
import { useWallet } from "@/store/wallet";

export default function WalletPill() {
  const status = useWallet((s) => s.status);
  const praxisAddress = useWallet((s) => s.praxisAddress);
  const connect = useWallet((s) => s.connect);
  const disconnect = useWallet((s) => s.disconnect);

  const connected = status === "connected" || status === "drift";
  const short = praxisAddress ? praxisAddress.slice(0, 8) + "…" + praxisAddress.slice(-6) : null;

  const onClick = () => {
    if (connected) {
      if (window.confirm("Disconnect wallet " + (praxisAddress || "").slice(0, 10) + "…?")) disconnect();
    } else {
      void connect();
    }
  };

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-card border px-3 py-2 font-mono text-[10px] transition-colors ${
        connected
          ? "border-up/30 bg-up-dim text-up"
          : "border-line bg-surface text-ink-2 hover:border-up hover:text-up"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${connected ? "animate-pulseDot bg-up" : "bg-ink-3"}`} />
      <span>{status === "connecting" ? "Connecting…" : short ?? "Not connected"}</span>
      {connected && <span className="opacity-70">✕</span>}
    </button>
  );
}
