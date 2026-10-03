"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isMasterAuthority } from "@/lib/genesis";
import { useWallet } from "@/store/wallet";
import { fetchMarkets, extractCat, isCancelled } from "@/lib/markets";
import { CATS_TREE, parseSub } from "@/lib/cats";
import CatIcon from "@/components/icons/CatIcon";
import MarketCard from "@/components/MarketCard";

export default function OtherPage() {
  const [sub, setSub] = useState("");
  const { praxisAddress } = useWallet();
  const isMaster = isMasterAuthority(praxisAddress);
  const { data: ms = [] } = useQuery({ queryKey: ["markets-other"], queryFn: fetchMarkets, staleTime: 15000 });

  const all = useMemo(() => ms.filter((m) => extractCat(m.rules) === "other" && !isCancelled(m)), [ms]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    all.forEach((m) => { const s = parseSub(m.rules) || ""; c[s] = (c[s] || 0) + 1; });
    return c;
  }, [all]);
  const filtered = useMemo(() => all.filter((m) => !sub || parseSub(m.rules) === sub), [all, sub]);
  const tree = CATS_TREE.find((c) => c.key === "other")!;

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[1280px] px-4 py-6 pb-24 md:px-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2.5 font-mono text-[12px] uppercase tracking-[3px] text-up">
          <span className="inline-block h-px w-5 bg-up" /> Other
        </div>
        <h1 className="font-display text-[26px] font-extrabold tracking-[-0.3px]">
          Other · {sub ? tree.subs.find((s) => s.key === sub)?.label ?? "All" : "All"}
        </h1>
      </div>

      <div className="flex gap-6">
        <aside className="hidden w-48 shrink-0 md:block">
          <button onClick={() => setSub("")} className={`mb-1 flex w-full items-center justify-between rounded-card px-3 py-2 font-mono text-[15px] ${!sub ? "bg-surface text-up" : "text-ink-3 hover:text-ink-2"}`}>
            <span>All</span><span>{all.length}</span>
          </button>
          {tree.subs.map((s) => (
            <button key={s.key} onClick={() => setSub(s.key)} className={`mb-1 flex w-full items-center justify-between rounded-card px-3 py-2 font-mono text-[15px] ${sub === s.key ? "bg-surface text-up" : "text-ink-3 hover:text-ink-2"}`}>
              <span className="flex items-center gap-2"><CatIcon name={s.icon} className="h-3.5 w-3.5" />{s.label}</span>
              <span>{counts[s.key] || 0}</span>
            </button>
          ))}
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1 md:hidden [scrollbar-width:none]">
            <button onClick={() => setSub("")} className={`shrink-0 rounded-full border px-3.5 py-1.5 font-mono text-[15px] ${!sub ? "border-up bg-up text-black" : "border-line text-ink-2"}`}>All</button>
            {tree.subs.map((s) => (
              <button key={s.key} onClick={() => setSub(s.key)} className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 font-mono text-[15px] ${sub === s.key ? "border-up bg-up text-black" : "border-line text-ink-2"}`}>
                <CatIcon name={s.icon} className="h-3.5 w-3.5" />{s.label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((m) => (
              <MarketCard key={m.marketId} market={m} bookmarked={false} onToggleBookmark={() => {}} />
            ))}
          </div>
          {filtered.length === 0 && (
            <div className="rounded-card border border-line bg-surface p-8 text-center">
              <div className="mb-3 font-mono text-[14px] text-ink-3">
                No other markets yet
              </div>
              {isMaster && (
                <Link href="/action/create" className="inline-flex items-center gap-2 rounded-card bg-up px-4 py-2 font-mono text-[13px] font-bold text-black transition-all hover:bg-up/90">
                  <span>+</span> Create Other Market
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
