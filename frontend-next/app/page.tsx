"use client";
import MarketsBoard from "@/components/MarketsBoard";
import WalletPill from "@/components/WalletPill";
import { useHeight } from "@/hooks/useHeight";

const PH4_CANARY = "PRAXIS-NEXT-PH4";

export default function Page() {
  const { data, isError } = useHeight();
  const live = !isError && (data?.height ?? 0) > 0;

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <div
            className="font-display text-lg font-extrabold tracking-widest text-up"
            style={{ textShadow: "0 0 30px rgba(0,232,122,0.25)" }}
          >
            PRAXIS
          </div>
          <div className="font-mono text-[9px] tracking-[2px] text-ink-3">$PRX · NEXT</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-card border border-line bg-surface px-3 py-2 font-mono text-[10px] text-ink-2">
            <span className={`h-1.5 w-1.5 rounded-full ${live ? "animate-pulseDot bg-up" : "bg-ink-3"}`} />
            <span className={live ? "text-up" : "text-down"}>{live ? "connected" : "connecting…"}</span>
            <span className="text-ink-3">#{data?.height ?? "—"}</span>
          </div>
          <WalletPill />
        </div>
      </header>

      <MarketsBoard />

      <span className="hidden" aria-hidden="true">{PH4_CANARY}</span>
    </main>
  );
}
