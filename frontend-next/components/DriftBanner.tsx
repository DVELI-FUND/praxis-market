"use client";
import { useWallet } from "@/store/wallet";

export default function DriftBanner() {
  const status = useWallet((s) => s.status);
  const connect = useWallet((s) => s.connect);
  if (status !== "drift") return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[210] flex items-center justify-between gap-3 border-b border-amberx/40 bg-[#1a1408] px-4 py-2.5">
      <div className="font-mono text-[10px] text-amberx">⚠ Wallet account changed on device</div>
      <button
        onClick={() => void connect()}
        className="rounded-card bg-amberx px-3 py-1 font-mono text-[10px] font-bold text-black"
      >
        Reconnect
      </button>
    </div>
  );
}
