"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { marketVol, marketLiquidity } from "@/lib/markets";
import type { Market } from "@/lib/markets";
import { CAT_SYMBOLS, extractCat, extractOutcomes, stripCatPrefix, yesPct, nPrices } from "@/lib/markets";
import BannerImg from "./BannerImg";
import CatIcon from "./icons/CatIcon";
import { catDef, subDef, parseSub } from "@/lib/cats";
import { fmtPRX, fmtCountdown } from "@/lib/format";
import { useHeight } from "@/hooks/useHeight";
import StatusPill from "./StatusPill";

interface Props {
  market: Market;
  featured?: boolean;
  bookmarked: boolean;
  onToggleBookmark: (mid: string) => void;
}

export default function MarketCard({ market, featured = false, bookmarked, onToggleBookmark }: Props) {
  const { data: chain } = useHeight();
  const isNOutcome = market.options.length > 0;
  
  // Binary market: use yesPct
  const pct = isNOutcome ? 0 : yesPct(market);
  const noPct = 100 - pct;
  const traded = marketVol(market);
  const vol = traded > 0n ? fmtPRX(traded) : "—";
  const liq = fmtPRX(marketLiquidity(market));

  // N-outcome: calculate prices for all options
  const nPricesArr = isNOutcome ? nPrices(market.q, market.b0) : [];

  const [flash, setFlash] = useState<"" | "up" | "down">("");
  const prevPct = useRef(pct);
  useEffect(() => {
    if (pct !== prevPct.current) {
      setFlash(pct > prevPct.current ? "up" : "down");
      prevPct.current = pct;
      const t = setTimeout(() => setFlash(""), 700);
      return () => clearTimeout(t);
    }
  }, [pct]);

  const catKey = extractCat(market.rules);
  const subKey = parseSub(market.rules);
  const subLabel = subDef(catKey, subKey)?.label;
  const outLbl = extractOutcomes(market.rules);
  const catSymbol = CAT_SYMBOLS[catKey] || "◈";
  const question = stripCatPrefix(market.question || market.rules || "(no question)");
  const maxLen = featured ? 140 : 96;
  const qTrunc = question.length > maxLen ? question.slice(0, maxLen) + "…" : question;

  return (
    <Link
      href={`/market/${market.marketId}`}
      className="group flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface-grad shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-line-2 hover:shadow-cardHover"
    >
      {/* icon-style header */}
      <div className="relative flex items-start gap-3 px-4 pt-4">
        <div className="h-[54px] w-[54px] shrink-0 overflow-hidden rounded-card border border-line-2 bg-surface-2">
          <BannerImg
            rules={market.rules}
            className="h-full w-full object-cover"
            fallback={
              <div className="flex h-full w-full items-center justify-center text-[22px] text-ink-2">
                <CatIcon name={catKey || "other"} className="h-5 w-5 text-ink" />
              </div>
            }
          />
        </div>

        <div className="min-w-0 flex-1 pr-2">
          <div className="mb-1 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[1.5px] text-ink-3">
            <span><CatIcon name={catKey || "other"} className="h-5 w-5 text-ink" /></span> {catKey}
            {isNOutcome && <span className="rounded bg-up/20 px-1.5 py-0.5 text-[9px] font-bold text-up">N-OUTCOME</span>}
          </div>
          <div
            className={`font-sans font-semibold leading-[1.35] text-ink transition-colors group-hover:text-white ${
              featured ? "line-clamp-3 text-[16px]" : "line-clamp-2 text-[16px]"
            }`}
          >
            {qTrunc}
          </div>
        </div>

        <div className="absolute right-4 top-4">
          <StatusPill status={market.status} />
        </div>
      </div>

      <div className="flex flex-1 flex-col px-4 pb-3 pt-3">
        {isNOutcome ? (
          // N-outcome: show all options with prices
          <div className="space-y-2">
            {market.options.slice(0, 2).map((opt, idx) => {
              const price = Math.round(nPricesArr[idx] * 100);
              return (
                <div key={idx} className="flex items-center justify-between rounded-card border border-up/25 bg-up-dim px-3 py-2 transition-colors group-hover:border-up/50">
                  <span className="max-w-[55%] truncate font-mono text-[14px] font-bold text-up">{opt}</span>
                  <span className="font-display text-[16px] font-bold text-up tabular-nums">{price}¢</span>
                </div>
              );
            })}
          </div>
        ) : (
          // Binary market: show YES/NO as before
          <>
            <div className="mb-2 flex items-baseline justify-between">
              <span
                className={`inline-block font-display font-extrabold tracking-[-0.5px] text-up tabular-nums ${
                  flash === "up" ? "tick-up" : flash === "down" ? "tick-down" : ""
                } ${featured ? "text-[30px]" : "text-[24px]"}`}
              >
                {pct}
                <span className="text-[14px] opacity-60">%</span>
              </span>
              <span className="font-mono text-[13px] uppercase tracking-[1px] text-ink-3">chance</span>
            </div>
            <div className="mb-3 h-[4px] overflow-hidden rounded-pill bg-line">
              <div className="h-full rounded-pill bg-up transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between rounded-card border border-up/25 bg-up-dim px-3 py-2 transition-colors group-hover:border-up/50">
                <span className="max-w-[55%] truncate font-mono text-[14px] font-bold text-up">{outLbl.yes}</span>
                <span className="font-display text-[16px] font-bold text-up tabular-nums">{pct}¢</span>
              </div>
              <div className="flex items-center justify-between rounded-card border border-down/25 bg-down-dim px-3 py-2 transition-colors group-hover:border-down/50">
                <span className="max-w-[55%] truncate font-mono text-[14px] font-bold text-down">{outLbl.no}</span>
                <span className="font-display text-[16px] font-bold text-down tabular-nums">{noPct}¢</span>
              </div>
            </div>
          </>
        )}

        <div className="mt-auto flex items-center justify-between border-t border-line pt-2 font-mono text-[13px] text-ink-3">
          <span>
            Vol <b className="text-[14px] text-cyanx">{vol}</b>
            <span className="ml-3">Liq <b className="text-[14px] text-ink-2">{liq}</b></span>
          </span>
          <span className="tabular-nums">
            {market.expiry ? "Ends " + fmtCountdown(Number(market.expiry), chain?.height ?? 0) : "—"}
          </span>
          <button
            className={`p-0.5 text-[16px] transition-colors ${bookmarked ? "text-amberx" : "text-ink-3 hover:text-amberx"}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleBookmark(market.marketId);
            }}
            title="Bookmark"
          >
            {bookmarked ? "★" : "☆"}
          </button>
        </div>
      </div>
    </Link>
  );
}
