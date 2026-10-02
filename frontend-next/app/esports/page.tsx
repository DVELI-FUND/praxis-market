"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchMarkets, yesPct, extractOutcomes, extractCat, isCancelled } from "@/lib/markets";
import type { Market } from "@/lib/markets";
import { CATS_TREE, parseSub, parseKo, parseLg } from "@/lib/cats";
import CatIcon from "@/components/icons/CatIcon";
import { fmtPRX } from "@/lib/format";
import TradeRail from "@/components/TradeRail";

const PAIRS: [string, string][] = [
  ["#e5484d", "#3e63dd"], ["#f5d90a", "#3e63dd"], ["#e5484d", "#46a758"],
  ["#d6c7a1", "#3e63dd"], ["#06b6d4", "#f97316"], ["#f59e0b", "#e5484d"],
];
const DARK = new Set(["#f5d90a", "#d6c7a1"]);

interface Game { m: Market; ko: number; lg: string; sub: string }
const outs = (m: Market) => {
  const o = extractOutcomes(m.rules) as unknown as { yes?: string; no?: string } | null;
  return { a: o?.yes || "YES", b: o?.no || "NO" };
};

export default function EsportsPage() {
  const [sub, setSub] = useState("");
  const [mode, setMode] = useState<"games" | "props">("games");
  const [liveOnly, setLiveOnly] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const { data: ms = [] } = useQuery({ queryKey: ["markets-esports"], queryFn: fetchMarkets, staleTime: 15000 });
  const now = Date.now();

  const sports = useMemo(() => ms.filter((m) => extractCat(m.rules) === "esports" && !isCancelled(m)), [ms]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    sports.forEach((m) => { const s = parseSub(m.rules) || ""; c[s] = (c[s] || 0) + 1; });
    return c;
  }, [sports]);

  const tagged = useMemo(() => sports.map((m) => ({
    m, koStr: parseKo(m.rules), lg: parseLg(m.rules) || parseSub(m.rules)?.toUpperCase() || "SPORTS", sub: parseSub(m.rules) || "",
  })), [sports]);

  const games = useMemo(() => tagged
    .filter((g) => g.koStr && (!sub || g.sub === sub))
    .map((g) => ({ ...g, ko: Date.parse(g.koStr!) }))
    .filter((g) => !isNaN(g.ko)) as (Game & { koStr: string })[], [tagged, sub]);

  const props = useMemo(() => tagged.filter((g) => !g.koStr && (!sub || g.sub === sub)), [tagged, sub]);
  const live = games.filter((g) => g.ko <= now);
  const upcoming = games.filter((g) => g.ko > now).sort((a, b) => a.ko - b.ko);

  const byDate = useMemo(() => {
    const map = new Map<string, Map<string, typeof games>>();
    for (const g of (liveOnly ? [] : upcoming)) {
      const d = new Date(g.ko).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      if (!map.has(d)) map.set(d, new Map());
      const lm = map.get(d)!;
      if (!lm.has(g.lg)) lm.set(g.lg, []);
      lm.get(g.lg)!.push(g);
    }
    return map;
  }, [upcoming, liveOnly]);

  const GameCard = ({ g, i }: { g: Game; i: number }) => {
    const pct = yesPct(g.m);
    const { a, b } = outs(g.m);
    const [cA, cB] = PAIRS[i % PAIRS.length];
    const vol = g.m.qYes + g.m.qNo;
    const isLive = g.ko <= now;
    return (
      <div onClick={() => setSelectedMarket(g.m)} className="rounded-card border border-line bg-surface-grad p-3 cursor-pointer hover:border-line-2 transition-colors">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-[10px] text-ink-3">
            {isLive ? (
              <span className="flex items-center gap-1 font-bold text-down"><span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-down" />LIVE</span>
            ) : (
              <span>{new Date(g.ko).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
            )}
            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-bold text-ink-2">{g.lg}</span>
            {vol > 0n && <span>Vol {fmtPRX(vol)}</span>}
          </div>
          <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[9px] text-ink-2">Trade ›</span>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-display text-[12px] font-bold text-ink">{a}</span>
            <div style={{ background: cA, color: DARK.has(cA) ? "#0a0a0a" : "#fff" }} className="shrink-0 rounded-lg px-3 py-1.5 font-mono text-[10px] font-bold">
              {a.slice(0, 8).toUpperCase()} {pct}¢
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-display text-[12px] font-bold text-ink">{b}</span>
            <div style={{ background: cB, color: DARK.has(cB) ? "#0a0a0a" : "#fff" }} className="shrink-0 rounded-lg px-3 py-1.5 font-mono text-[10px] font-bold">
              {b.slice(0, 8).toUpperCase()} {100 - pct}¢
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[1280px] px-4 py-6 pb-24 md:px-8">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[3px] text-up">
            <span className="inline-block h-px w-5 bg-up" /> Esports
          </div>
          <h1 className="font-display text-[26px] font-extrabold tracking-[-0.3px]">
            Sports · {sub ? CATS_TREE.find((c) => c.key === "esports")?.subs.find((s) => s.key === sub)?.label ?? "All" : "All"}
          </h1>
        </div>
        <div className="flex rounded-full border border-line p-0.5">
          {(["games", "props"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`rounded-full px-3 py-1 font-mono text-[11px] font-bold ${mode === m ? "bg-up text-black" : "text-ink-3"}`}>
              {m === "games" ? "Games" : "Props"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-6">
        <aside className="hidden w-44 shrink-0 md:block">
          <button onClick={() => setSub("")} className={`mb-1 flex w-full items-center justify-between rounded-card px-2.5 py-1.5 font-mono text-[11px] ${!sub ? "bg-surface text-up" : "text-ink-3 hover:text-ink-2"}`}>
            <span>All</span><span>{sports.length}</span>
          </button>
          {CATS_TREE.find((c) => c.key === "esports")!.subs.map((s) => (
            <button key={s.key} onClick={() => setSub(s.key)} className={`mb-1 flex w-full items-center justify-between rounded-card px-2.5 py-1.5 font-mono text-[11px] ${sub === s.key ? "bg-surface text-up" : "text-ink-3 hover:text-ink-2"}`}>
              <span className="flex items-center gap-1.5"><CatIcon name={s.icon} className="h-3 w-3" />{s.label}</span>
              <span>{counts[s.key] || 0}</span>
            </button>
          ))}
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 md:hidden [scrollbar-width:none]">
            <button onClick={() => setSub("")} className={`shrink-0 rounded-full border px-3 py-1 font-mono text-[11px] ${!sub ? "border-up bg-up text-black" : "border-line text-ink-2"}`}>All</button>
            {CATS_TREE.find((c) => c.key === "esports")!.subs.map((s) => (
              <button key={s.key} onClick={() => setSub(s.key)} className={`flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 font-mono text-[11px] ${sub === s.key ? "border-up bg-up text-black" : "border-line text-ink-2"}`}>
                <CatIcon name={s.icon} className="h-3 w-3" />{s.label}
              </button>
            ))}
          </div>

          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 font-mono text-[11px] text-down">
              <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-down" /> Live Now · {live.length}
            </div>
            <button onClick={() => setLiveOnly(!liveOnly)} className={`rounded-full border px-2.5 py-1 font-mono text-[10px] ${liveOnly ? "border-up bg-up/10 text-up" : "border-line text-ink-3"}`}>
              Live only
            </button>
          </div>

          {mode === "games" ? (
            <div className="space-y-6">
              {live.length > 0 && !liveOnly && (
                <section><div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-ink-3">Live</div><div className="grid gap-3 md:grid-cols-2">{live.map((g, i) => <GameCard key={g.m.marketId} g={g} i={i} />)}</div></section>
              )}
              {liveOnly && (
                <div className="grid gap-3 md:grid-cols-2">{live.map((g, i) => <GameCard key={g.m.marketId} g={g} i={i} />)}</div>
              )}
              {[...byDate.entries()].map(([date, leagues]) => (
                <section key={date}>
                  <div className="mb-2 flex items-center gap-2 font-display text-[14px] font-bold text-ink">
                    {date} <span className="font-mono text-[10px] text-ink-3">· {[...leagues.values()].reduce((n, l) => n + l.length, 0)}</span>
                  </div>
                  {[...leagues.entries()].map(([lg, gs]) => (
                    <div key={lg} className="mb-4">
                      <div className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-ink-3">{lg}</div>
                      <div className="grid gap-3 md:grid-cols-2">{gs.map((g, i) => <GameCard key={g.m.marketId} g={g} i={i + lg.length} />)}</div>
                    </div>
                  ))}
                </section>
              ))}
              {games.length === 0 && (
                <div className="rounded-card border border-line bg-surface p-6 text-center font-mono text-[12px] text-ink-3">
                  No scheduled matches yet — create tournament markets with a start time to populate
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {props.map((g) => {
                const pct = yesPct(g.m);
                return (
                  <Link key={g.m.marketId} href={`/market/${g.m.marketId}`} className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface-grad p-3 hover:border-line-2">
                    <div className="min-w-0">
                      <div className="truncate font-display text-[13px] font-bold text-ink">{g.m.question || g.m.rules}</div>
                      <div className="font-mono text-[10px] text-ink-3">{g.lg} · Vol {fmtPRX(g.m.qYes + g.m.qNo)}</div>
                    </div>
                    <div className="shrink-0 rounded-lg bg-up px-2.5 py-1 font-mono text-[11px] font-bold text-black">{pct}¢</div>
                  </Link>
                );
              })}
              {props.length === 0 && <div className="rounded-card border border-line bg-surface p-6 text-center font-mono text-[12px] text-ink-3">No props yet</div>}
            </div>
          )}
        </div>

        <aside className="hidden w-80 shrink-0 xl:block">
          <div className="sticky top-4">
            {selectedMarket ? (
              <TradeRail market={selectedMarket} onClose={() => setSelectedMarket(null)} />
            ) : (
              <div className="rounded-card border border-line bg-surface p-6 text-center font-mono text-[11px] text-ink-3">
                Select a game to trade
              </div>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
