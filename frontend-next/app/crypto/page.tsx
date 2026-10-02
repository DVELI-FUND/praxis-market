"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchMarkets, yesPct, extractCat } from "@/lib/markets";
import { CATS_TREE, parseSub } from "@/lib/cats";
import CatIcon from "@/components/icons/CatIcon";
import { fmtPRX } from "@/lib/format";

export default function CryptoPage() {
  const [sub, setSub] = useState("");
  const { data: ms = [] } = useQuery({ queryKey: ["markets-crypto"], queryFn: fetchMarkets, staleTime: 15000 });

  const all = useMemo(() => ms.filter((m) => extractCat(m.rules) === "crypto"), [ms]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    all.forEach((m) => { const s = parseSub(m.rules) || ""; c[s] = (c[s] || 0) + 1; });
    return c;
  }, [all]);
  const filtered = useMemo(() => all.filter((m) => !sub || parseSub(m.rules) === sub), [all, sub]);
  const tree = CATS_TREE.find((c) => c.key === "crypto")!;

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[1280px] px-4 py-6 pb-24 md:px-8">
      <div className="mb-5">
        <div className="mb-2 flex items-center gap-2.5 font-mono text-[9px] uppercase tracking-[3px] text-up">
          <span className="inline-block h-px w-5 bg-up" /> Crypto
        </div>
        <h1 className="font-display text-[22px] font-extrabold tracking-[-0.3px]">
          Crypto · {sub ? tree.subs.find((s) => s.key === sub)?.label ?? "All" : "All"}
        </h1>
      </div>

      <div className="flex gap-6">
        <aside className="hidden w-44 shrink-0 md:block">
          <button onClick={() => setSub("")} className={`mb-1 flex w-full items-center justify-between rounded-card px-2.5 py-1.5 font-mono text-[10px] ${!sub ? "bg-surface text-up" : "text-ink-3 hover:text-ink-2"}`}>
            <span>All</span><span>{all.length}</span>
          </button>
          {tree.subs.map((s) => (
            <button key={s.key} onClick={() => setSub(s.key)} className={`mb-1 flex w-full items-center justify-between rounded-card px-2.5 py-1.5 font-mono text-[10px] ${sub === s.key ? "bg-surface text-up" : "text-ink-3 hover:text-ink-2"}`}>
              <span className="flex items-center gap-1.5"><CatIcon name={s.icon} className="h-3 w-3" />{s.label}</span>
              <span>{counts[s.key] || 0}</span>
            </button>
          ))}
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 md:hidden [scrollbar-width:none]">
            <button onClick={() => setSub("")} className={`shrink-0 rounded-full border px-3 py-1 font-mono text-[10px] ${!sub ? "border-up bg-up text-black" : "border-line text-ink-2"}`}>All</button>
            {tree.subs.map((s) => (
              <button key={s.key} onClick={() => setSub(s.key)} className={`flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 font-mono text-[10px] ${sub === s.key ? "border-up bg-up text-black" : "border-line text-ink-2"}`}>
                <CatIcon name={s.icon} className="h-3 w-3" />{s.label}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {filtered.map((m) => {
              const pct = yesPct(m);
              return (
                <Link key={m.marketId} href={`/market/${m.marketId}`} className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface-grad p-4 hover:border-line-2">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 truncate font-display text-[13px] font-bold text-ink">{m.question || m.rules}</div>
                    <div className="font-mono text-[9px] text-ink-3">{parseSub(m.rules)?.toUpperCase() || "crypto".toUpperCase()} · Vol {fmtPRX(m.qYes + m.qNo)}</div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <div className="rounded-lg bg-up px-3 py-1.5 font-mono text-[10px] font-bold text-black">YES {pct}¢</div>
                    <div className="rounded-lg bg-surface-2 px-3 py-1.5 font-mono text-[10px] font-bold text-ink-2">NO {100 - pct}¢</div>
                  </div>
                </Link>
              );
            })}
            {filtered.length === 0 && (
              <div className="rounded-card border border-line bg-surface p-6 text-center font-mono text-[11px] text-ink-3">
                No crypto markets yet
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
