"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Market } from "@/lib/markets";
import { CAT_SYMBOLS, extractCat, extractImg, stripCatPrefix, yesPct } from "@/lib/markets";
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
  const pct = yesPct(market);
  const noPct = 100 - pct;
  const total = market.qYes + market.qNo;
  const vol = total > 0n ? fmtPRX(total) : "—";

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

  const [imgOk, setImgOk] = useState(true);
  const catKey = extractCat(market.rules);
  const catSymbol = CAT_SYMBOLS[catKey] || "◈";
  const imgUrl = extractImg(market.rules);
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
          {imgUrl && imgOk ? (
            <img
              src={imgUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
              onError={() => setImgOk(false)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[22px] text-ink-2">
              {catSymbol}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 pr-2">
          <div className="mb-1 flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[1.5px] text-ink-3">
            <span>{catSymbol}</span> {catKey}
          </div>
          <div
            className={`font-sans font-semibold leading-[1.35] text-ink transition-colors group-hover:text-white ${
              featured ? "line-clamp-3 text-[15px]" : "line-clamp-2 text-[13px]"
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
        <div className="mb-2 flex items-baseline justify-between">
          <span
            className={`inline-block font-display font-extrabold tracking-[-0.5px] text-up tabular-nums ${
              flash === "up" ? "tick-up" : flash === "down" ? "tick-down" : ""
            } ${featured ? "text-[30px]" : "text-[24px]"}`}
          >
            {pct}
            <span className="text-[12px] opacity-60">%</span>
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[1px] text-ink-3">chance</span>
        </div>
        <div className="mb-3 h-[4px] overflow-hidden rounded-pill bg-line">
          <div className="h-full rounded-pill bg-up transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="flex items-center justify-between rounded-card border border-up/25 bg-up-dim px-3 py-2 transition-colors group-hover:border-up/50">
            <span className="font-mono text-[10px] font-bold text-up">YES</span>
            <span className="font-display text-[14px] font-bold text-up tabular-nums">{pct}¢</span>
          </div>
          <div className="flex items-center justify-between rounded-card border border-down/25 bg-down-dim px-3 py-2 transition-colors group-hover:border-down/50">
            <span className="font-mono text-[10px] font-bold text-down">NO</span>
            <span className="font-display text-[14px] font-bold text-down tabular-nums">{noPct}¢</span>
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-line pt-2 font-mono text-[9px] text-ink-3">
          <span>
            Vol <b className="text-[10px] text-cyanx">{vol}</b>
          </span>
          <span className="tabular-nums">
            {market.expiry ? "Ends " + fmtCountdown(Number(market.expiry), chain?.height ?? 0) : "—"}
          </span>
          <button
            className={`p-0.5 text-[13px] transition-colors ${bookmarked ? "text-amberx" : "text-ink-3 hover:text-amberx"}`}
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
