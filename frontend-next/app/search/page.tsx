"use client";
import { useEffect, useMemo, useState } from "react";
import { useMarkets } from "@/hooks/useMarkets";
import MarketCard from "@/components/MarketCard";
import { extractCat, stripCatPrefix } from "@/lib/markets";

const CATS = ["all", "crypto", "sports", "politics", "finance", "esports", "other"];

function loadBookmarks(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem("praxis_bookmarks") || "[]") as string[];
  } catch {
    return [];
  }
}

export default function SearchPage() {
  const { data: markets = [] } = useMarkets();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [bookmarks, setBookmarks] = useState<string[]>(loadBookmarks);

  useEffect(() => {
    setBookmarks(loadBookmarks());
  }, []);

  const toggleBookmark = (mid: string) => {
    setBookmarks((prev) => {
      const next = prev.includes(mid) ? prev.filter((x) => x !== mid) : [...prev, mid];
      if (typeof window !== "undefined") {
        window.localStorage.setItem("praxis_bookmarks", JSON.stringify(next));
      }
      return next;
    });
  };

  const results = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return markets.filter((m) => {
      const catOk = cat === "all" || extractCat(m.rules) === cat;
      const textOk =
        !ql ||
        m.question.toLowerCase().includes(ql) ||
        m.marketId.toLowerCase().includes(ql) ||
        m.creator.toLowerCase().includes(ql) ||
        stripCatPrefix(m.rules).toLowerCase().includes(ql);
      return catOk && textOk;
    });
  }, [markets, q, cat]);

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2.5 font-mono text-[9px] uppercase tracking-[3px] text-up">
          <span className="inline-block h-px w-5 bg-up" /> Discover
        </div>
        <h1 className="font-display text-[22px] font-extrabold tracking-[-0.3px]">Search Markets</h1>
        <p className="mt-1 text-[13px] text-ink-2">Find markets by keyword, category, or creator</p>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search markets..."
        className="mb-4 w-full rounded-card border border-line-2 bg-bg px-4 py-3 font-mono text-[13px] text-ink outline-none focus:border-up"
      />

      <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 font-mono text-[10px] transition-colors ${
              cat === c
                ? "border-up bg-up font-semibold text-black"
                : "border-line bg-transparent text-ink-2 hover:border-up hover:text-up"
            }`}
          >
            {c === "all" ? "All" : c.charAt(0).toUpperCase() + c.slice(1)}
          </button>
        ))}
      </div>

      {results.length === 0 ? (
        <div className="py-10 text-center font-mono text-[11px] text-ink-3">
          {q || cat !== "all" ? "No markets found" : "Type to search markets"}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {results.map((m, i) => (
            <div key={m.marketId} className="animate-fadeUp" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
              <MarketCard
                market={m}
                bookmarked={bookmarks.includes(m.marketId)}
                onToggleBookmark={toggleBookmark}
              />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
