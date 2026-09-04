"use client";
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
} from "@/lib/markets";
import { fmtPRX } from "@/lib/format";
import MarketCard from "./MarketCard";

const CATS = ["all", "crypto", "sports", "politics", "finance", "esports", "other"];
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
    let list = filterByTab(markets, tab);
    if (cat !== "all") list = list.filter((m) => extractCat(m.rules) === cat);
    return sortMarkets(list, sort);
  }, [markets, tab, cat, sort]);

  const liveCount = useMemo(() => markets.filter((m) => m.status === STATUS.LIVE).length, [markets]);
  const totalVolume = useMemo(() => markets.reduce<bigint>((s, m) => s + m.qYes + m.qNo, 0n), [markets]);

  return (
    <section>
      {/* header row */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <div className="mb-1 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[3px] text-up">
            <span className="inline-block h-px w-[18px] bg-up" /> Live on Canopy
          </div>
          <div className="font-display text-[22px] font-extrabold tracking-[-0.3px]">Prediction Markets</div>
        </div>
        <button
          onClick={() => void refetch()}
          className="rounded-card border border-line-2 bg-transparent px-3 py-1.5 font-mono text-[9px] text-ink-2 transition-colors hover:border-up hover:text-up"
        >
          ↻ Refresh
        </button>
      </div>

      {/* stat chips */}
      <div className="mb-3.5 flex gap-1.5 overflow-x-auto pb-1">
        <div className="flex items-center gap-1.5 whitespace-nowrap rounded-card border border-line bg-surface px-2.5 py-1.5 font-mono text-[9px] text-ink-2">
          Markets <b className="font-display text-[13px] font-bold text-ink">{liveCount}</b>
        </div>
        <div className="flex items-center gap-1.5 whitespace-nowrap rounded-card border border-line bg-surface px-2.5 py-1.5 font-mono text-[9px] text-ink-2">
          Block <b className="font-display text-[13px] font-bold text-ink tabular-nums">{heightInfo?.height ?? "—"}</b>
        </div>
        <div className="flex items-center gap-1.5 whitespace-nowrap rounded-card border border-line bg-surface px-2.5 py-1.5 font-mono text-[9px] text-ink-2">
          Vol <b className="font-display text-[13px] font-bold text-up tabular-nums">{fmtPRX(totalVolume)}</b>
        </div>
      </div>

      {/* category pills */}
      <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 font-mono text-[10px] transition-colors ${
              cat === c
                ? "border-up bg-up font-semibold text-black"
                : "border-line bg-transparent text-ink-2 hover:border-up hover:bg-up-dim hover:text-up"
            }`}
          >
            {c === "all" ? "All" : `${CAT_EMOJI[c] || "◈"} ${c.charAt(0).toUpperCase() + c.slice(1)}`}
          </button>
        ))}
      </div>

      {/* status tabs + sort */}
      <div className="mb-4 flex items-center justify-between gap-2 border-b border-line">
        <div className="flex flex-1 gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-4 py-2 font-mono text-[10px] tracking-[1px] transition-colors ${
                tab === t.key
                  ? "border-up text-up"
                  : "border-transparent text-ink-3 hover:text-ink-2"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-card border border-line bg-surface px-2.5 py-1.5 font-mono text-[9px] text-ink-2 transition-colors hover:border-up hover:text-up">
          <span className="opacity-60">↑↓</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-card border border-line bg-surface-grad px-3 py-1.5 font-mono text-[10px] text-ink-2 outline-none focus:border-line-2"
          >
            <option value="vol">24H Volume</option>
            <option value="totalVol">Total Volume</option>
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
        <div className="py-10 text-center font-mono text-[11px] text-ink-3">
          <span className="animate-pulseDot">▪ ▪ ▪</span>&nbsp;&nbsp;loading markets
        </div>
      ) : isError ? (
        <div className="rounded-card border border-down/40 bg-down-dim p-4 font-mono text-[11px] text-down">
           Cannot reach plugin RPC at <code>{String(error?.message || error)}</code>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-card border border-amberx/30 bg-amberx/5 p-4 font-mono text-[11px] text-amberx">
          {cat !== "all" ? "No markets in this category" : EMPTY_LABELS[tab]}
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
