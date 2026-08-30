"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMarkets } from "@/hooks/useMarkets";
import { useHeight } from "@/hooks/useHeight";
import { fmtCountdown } from "@/lib/format";
import { stripCatPrefix, yesPct } from "@/lib/markets";

export default function WatchlistPage() {
  const { data: markets = [] } = useMarkets();
  const { data: chain } = useHeight();
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      setIds(JSON.parse(window.localStorage.getItem("praxis_bookmarks") || "[]"));
    } catch {
      setIds([]);
    }
  }, []);

  const watched = markets.filter((m) => ids.includes(m.marketId));

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-8 pb-24 md:px-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2.5 font-mono text-[9px] uppercase tracking-[3px] text-amberx">
          <span className="inline-block h-px w-5 bg-amberx" /> Watchlist
        </div>
        <h1 className="font-display text-[22px] font-extrabold tracking-[-0.3px]">Starred Markets</h1>
        <p className="mt-1 text-[13px] text-ink-2">{watched.length} market{watched.length !== 1 ? "s" : ""} you're tracking</p>
      </div>

      {watched.length === 0 ? (
        <div className="rounded-card border border-line bg-surface p-8 text-center">
          <div className="mb-2 font-mono text-[26px] text-amberx">★</div>
          <div className="font-mono text-[11px] text-ink-3">No starred markets — tap the ☆ on any market card</div>
        </div>
      ) : (
        <div className="space-y-2">
          {watched.map((m) => {
            const pct = yesPct(m);
            return (
              <Link key={m.marketId} href={`/market/${m.marketId}`} className="flex items-center gap-3 rounded-card border border-line bg-surface-grad p-3 shadow-card transition-colors hover:border-line-2">
                <span className="text-amberx">★</span>
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-1 font-sans text-[12px] font-semibold text-ink">{stripCatPrefix(m.question || m.rules || "")}</div>
                  <div className="mt-0.5 font-mono text-[9px] text-ink-3">Ends {fmtCountdown(Number(m.expiry), chain?.height ?? 0)}</div>
                </div>
                <span className="font-display text-[16px] font-extrabold text-up tabular-nums">{pct}%</span>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
