"use client";
import CatIcon from "./icons/CatIcon";
import { CATS_TREE, subDef, parseSub } from "@/lib/cats";
import { useMemo, useState } from "react";
import { useMarkets } from "@/hooks/useMarkets";
import { useHeight } from "@/hooks/useHeight";
import {
  CAT_EMOJI,
  STATUS,
  extractCat,
  filterByTab,
  sortMarkets,
  type SortKey,
  type TabKey,
  marketVol } from "@/lib/markets";
import { fmtPRX } from "@/lib/format";
import MarketCard from "./MarketCard";

const CATS = [{ key: "all", label: "All", icon: "other" }, ...CATS_TREE.map(c => ({ key: c.key, label: c.label, icon: c.icon }))];
const TABS: { key: TabKey; label: string }[] = [
  { key: "live", label: "⬤ Live" },
  { key: "proposed", label: "⚖ Proposed" },
  { key: "closed", label: "◎ Closed" },
];
const EMPTY_LABELS: Record<TabKey, string> = {
  live: "No open markets yet",
  proposed: "No markets awaiting resolution",
  closed: "No recently closed markets",
};

function loadBookmarks(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem("praxis_bookmarks") || "[]") as string[];
  } catch {
    return [];
  }
}

export default function MarketsBoard() {
  const { data: markets = [], isLoading, isError, error, refetch } = useMarkets();
  const { data: heightInfo } = useHeight();
  const [tab, setTab] = useState<TabKey>("live");
  const [cat, setCat] = useState<string>("all");
  const [sub, setSub] = useState("");
  const subs = cat !== "all" ? CATS_TREE.find(c => c.key === cat)?.subs ?? [] : [];
  const [sort, setSort] = useState<SortKey>("vol");
  const [bookmarks, setBookmarks] = useState<string[]>(loadBookmarks);

  const toggleBookmark = (mid: string) => {
    setBookmarks((prev) => {
      const next = prev.includes(mid) ? prev.filter((x) => x !== mid) : [...prev, mid];
      if (typeof window !== "undefined") {
        window.localStorage.setItem("praxis_bookmarks", JSON.stringify(next));
      }
      return next;
    });
  };

  const visible = useMemo(() => {
    let list = filterByTab(markets, tab).filter((m) => m.status !== 1);
    if (cat !== "all") list = list.filter((m) => extractCat(m.rules) === cat && (!sub || parseSub(m.rules) === sub));
    return sortMarkets(list, sort);
  }, [markets, tab, cat, sub, sort]);

  const emptyLabel =
    tab === "live"
      ? cat === "all"
        ? "No live markets yet"
        : `No live ${cat} markets yet`
      : EMPTY_LABELS[tab];

  const liveCount = useMemo(() => markets.filter((m) => m.status === STATUS.LIVE).length, [markets]);
  const totalVolume = useMemo(() => markets.reduce<bigint>((s, m) => s + marketVol(m), 0n), [markets]);

  return (
    <section>
      {/* header row */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <div className="mb-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[3px] text-up">
            <span className="inline-block h-px w-[18px] bg-up" /> Live on Canopy
          </div>
          <div className="font-display text-[22px] font-extrabold tracking-[-0.3px]">Prediction Markets</div>
        </div>
        <button
          onClick={() => void refetch()}
          className="rounded-card border border-line-2 bg-transparent px-3 py-1.5 font-mono text-[11px] text-ink-2 transition-colors hover:border-up hover:text-up"
        >
          ↻ Refresh
        </button>
      </div>

      {/* stat chips */}
      <div className="mb-3.5 flex gap-1.5 overflow-x-auto pb-1">
        <div className="flex items-center gap-1.5 whitespace-nowrap rounded-card border border-line bg-surface px-2.5 py-1.5 font-mono text-[11px] text-ink-2">
          Markets <b className="font-display text-[15px] font-bold text-ink">{liveCount}</b>
        </div>
        <div className="flex items-center gap-1.5 whitespace-nowrap rounded-card border border-line bg-surface px-2.5 py-1.5 font-mono text-[11px] text-ink-2">
          Block <b className="font-display text-[15px] font-bold text-ink tabular-nums">{heightInfo?.height ?? "—"}</b>
        </div>
        <div className="flex items-center gap-1.5 whitespace-nowrap rounded-card border border-line bg-surface px-2.5 py-1.5 font-mono text-[11px] text-ink-2">
          Vol <b className="font-display text-[15px] font-bold text-up tabular-nums">{fmtPRX(totalVolume)}</b>
        </div>
      </div>

      {/* category pills */}
      <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        {CATS.map((c) => (<button key={c.key} onClick={() => setCat(c.key)} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[12px] ${cat === c.key ? "border-up bg-up text-black" : "border-line text-ink-2"}`}><CatIcon name={c.icon} className="h-3 w-3" />{c.label}</button>))}
      </div>

      {subs.length > 0 && (<div className="flex flex-wrap gap-1.5 mt-2"><button onClick={() => setSub("")} className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${!sub ? "border-amberx bg-amberx/10 text-amberx" : "border-line text-ink-3"}`}>All</button>{subs.map(x => (<button key={x.key} onClick={() => setSub(x.key)} className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${sub === x.key ? "border-amberx bg-amberx/10 text-amberx" : "border-line text-ink-3"}`}><CatIcon name={x.icon} className="h-2.5 w-2.5" />{x.label}</button>))}</div>)}{/* status tabs + sort */}
      <div className="mb-4 flex items-center justify-between gap-2 border-b border-line">
        <div className="flex flex-1 gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-4 py-2 font-mono text-[12px] tracking-[1px] transition-colors ${
                tab === t.key
                  ? "border-up text-up"
                  : "border-transparent text-ink-3 hover:text-ink-2"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-card border border-line bg-surface px-2.5 py-1.5 font-mono text-[11px] text-ink-2 transition-colors hover:border-up hover:text-up">
          <span className="opacity-60">↑↓</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-card border border-line bg-surface-grad px-3 py-1.5 font-mono text-[12px] text-ink-2 outline-none focus:border-line-2"
          >
            <option value="vol">Volume</option>
            <option value="totalVol">Liquidity</option>
            <option value="newest">Newest</option>
            <option value="closing">Expiring Soon</option>
            <option value="trending">Trending</option>
            <option value="competitive">Competitive</option>
            <option value="yes">Highest YES</option>
          </select>
        </label>
      </div>

      {/* grid / states */}
      {isLoading && markets.length === 0 ? (
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-card border border-line bg-surface-grad p-3.5">
              {/* Banner skeleton */}
              <div className="mb-3 aspect-[16/5] w-full rounded border border-line bg-line/30 animate-pulseDot" />
              {/* Question skeleton */}
              <div className="mb-2 space-y-1.5">
                <div className="h-3 w-3/4 rounded bg-line/30 animate-pulseDot" />
                <div className="h-3 w-1/2 rounded bg-line/30 animate-pulseDot" />
              </div>
              {/* Status pill skeleton */}
              <div className="mb-3 flex items-center gap-2">
                <div className="h-5 w-12 rounded-pill bg-line/30 animate-pulseDot" />
                <div className="h-5 w-16 rounded-pill bg-line/30 animate-pulseDot" />
              </div>
              {/* YES/NO bars skeleton */}
              <div className="mb-3">
                <div className="h-6 w-full rounded bg-line/30 animate-pulseDot" />
              </div>
              {/* Bottom info skeleton */}
              <div className="flex items-center justify-between">
                <div className="h-3 w-20 rounded bg-line/30 animate-pulseDot" />
                <div className="h-3 w-16 rounded bg-line/30 animate-pulseDot" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-card border border-down/40 bg-down-dim p-4 font-mono text-[13px] text-down">
           Cannot reach plugin RPC at <code>{String(error?.message || error)}</code>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-card border border-amberx/30 bg-amberx/5 p-4 font-mono text-[13px] text-amberx">
          {emptyLabel}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {visible.map((m, i) => (
            <div
              key={m.marketId}
              className={`animate-fadeUp ${i === 0 ? "md:col-span-2" : ""}`}
              style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
            >
              <MarketCard
                market={m}
                featured={i === 0}
                bookmarked={bookmarks.includes(m.marketId)}
                onToggleBookmark={toggleBookmark}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
