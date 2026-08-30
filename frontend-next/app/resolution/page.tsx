"use client";
import { useState } from "react";
import Link from "next/link";
import { useMarkets } from "@/hooks/useMarkets";
import { useHeight } from "@/hooks/useHeight";
import { STATUS, stripCatPrefix } from "@/lib/markets";
import { fmtCountdown } from "@/lib/format";

type Stage = "proposed" | "review" | "finalized";

export default function ResolutionPage() {
  const { data: markets = [] } = useMarkets();
  const { data: chain } = useHeight();
  const [stage, setStage] = useState<Stage>("proposed");

  const proposed = markets.filter((m) => m.status === STATUS.PROPOSED || m.status === STATUS.EXPIRED);
  const review = markets.filter((m) => m.status === STATUS.DISPUTED);
  const finalized = markets.filter((m) => m.status === STATUS.FINALIZED);

  const rows = stage === "proposed" ? proposed : stage === "review" ? review : finalized;

  const STAGES: { id: Stage; label: string; count: number; desc: string; accent: string }[] = [
    { id: "proposed", label: "Proposed", count: proposed.length, desc: "Outcome isn't final yet. Stake to challenge it if incorrect or resolved too early.", accent: "border-amberx/40 text-amberx" },
    { id: "review", label: "In Review", count: review.length, desc: "Someone staked to challenge the outcome. The resolvers are reviewing the dispute.", accent: "border-bluex/40 text-bluex" },
    { id: "finalized", label: "Finalized", count: finalized.length, desc: "No dispute was filed, or the committee ruled. The outcome is final and will not change.", accent: "border-up/40 text-up" },
  ];

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[1100px] px-4 py-8 pb-24 md:px-8">
      <div className="mb-2 font-display text-[26px] font-extrabold tracking-[-0.5px] text-white">Market Resolution</div>
      <p className="mb-6 max-w-[560px] text-[13px] leading-relaxed text-ink-2">
        Disagree with an outcome? Stake PRX to challenge it. If the challenge is accepted your stake is returned plus a reward; if rejected it is forfeited.
      </p>

      {/* stage cards */}
      <div className="mb-8 grid grid-cols-1 gap-3 md:grid-cols-3">
        {STAGES.map((s) => (
          <button
            key={s.id}
            onClick={() => setStage(s.id)}
            className={`rounded-card border bg-surface-grad p-4 text-left shadow-card transition-all ${
              stage === s.id ? s.accent + " shadow-glowUp" : "border-line hover:border-line-2"
            }`}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-display text-[14px] font-bold text-ink">{s.label}</span>
              <span className="font-display text-[22px] font-extrabold text-white tabular-nums">{s.count}</span>
            </div>
            <p className="font-mono text-[9px] leading-relaxed text-ink-3">{s.desc}</p>
          </button>
        ))}
      </div>

      {/* table */}
      <div className="overflow-hidden rounded-card border border-line bg-surface-grad shadow-card">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b border-line px-4 py-2.5 font-mono text-[8px] uppercase tracking-[1.5px] text-ink-3">
          <span>Market</span>
          <span className="w-[90px] text-right">Status</span>
          <span className="w-[90px] text-right">Window</span>
          <span className="w-[80px] text-right">Action</span>
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center font-mono text-[10px] text-ink-3">No markets in this stage.</div>
        ) : (
          rows.map((m) => (
            <div key={m.marketId} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-line/50 px-4 py-3 last:border-b-0">
              <span className="line-clamp-1 font-sans text-[12px] font-semibold text-ink">
                {stripCatPrefix(m.question || m.rules || "")}
              </span>
              <span className="w-[90px] text-right font-mono text-[9px] text-ink-2">{m.status}</span>
              <span className="w-[90px] text-right font-mono text-[9px] text-amberx tabular-nums">
                {fmtCountdown(Number(m.expiry), chain?.height ?? 0)}
              </span>
              <span className="w-[80px] text-right">
                <Link href={`/market/${m.marketId}`} className="rounded-card border border-line-2 px-2.5 py-1 font-mono text-[9px] text-ink-2 transition-colors hover:border-up hover:text-up">
                  View
                </Link>
              </span>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
