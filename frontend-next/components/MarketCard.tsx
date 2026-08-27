"use client";
import type { Market } from "@/lib/markets";
import { CAT_SYMBOLS, extractCat, extractImg, stripCatPrefix, yesPct } from "@/lib/markets";
import { fmtPRX } from "@/lib/format";
import StatusPill from "./StatusPill";

interface Props {
  market: Market;
  featured?: boolean;
  bookmarked: boolean;
  onToggleBookmark: (mid: string) => void;
}

export default function MarketCard({ market, featured = false, bookmarked, onToggleBookmark }: Props) {
  const pct = yesPct(market);
  const noPct = 100 - pct;
  const total = market.qYes + market.qNo;
  const vol = total > 0n ? fmtPRX(total) : "—";
  const yesMulti = market.qYes > 0n ? (Number(market.qYes + market.qNo) / Number(market.qYes)).toFixed(2) : "—";
  const noMulti = market.qNo > 0n ? (Number(market.qYes + market.qNo) / Number(market.qNo)).toFixed(2) : "—";

  const catKey = extractCat(market.rules);
  const catSymbol = CAT_SYMBOLS[catKey] || "◈";
  const catName = catKey.charAt(0).toUpperCase() + catKey.slice(1);
  const imgUrl = extractImg(market.rules);

  const question = stripCatPrefix(market.question || market.rules || "(no question)");
  const maxLen = featured ? 120 : 80;
  const qTrunc = question.length > maxLen ? question.slice(0, maxLen) + "…" : question;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface transition-all hover:-translate-y-0.5 hover:border-up/35 hover:shadow-[0_6px_28px_rgba(0,0,0,0.6),0_0_0_1px_rgba(0,232,122,0.1)]">
      <div className="flex-1 px-3 pb-2 pt-2.5">
        <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[1.5px] text-ink-3">
          {imgUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={imgUrl}
              alt=""
              loading="lazy"
              className="h-[22px] w-[22px] shrink-0 rounded-[5px] border border-line object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] border border-line bg-bg-2 font-mono text-[12px] text-line-2">
              ◈
            </span>
          )}
          <span>
            {catSymbol} {catName}
          </span>
          <span className="ml-auto">
            <StatusPill status={market.status} />
          </span>
        </div>

        <div
          className={`mb-2.5 font-sans font-semibold leading-[1.35] text-ink ${
            featured ? "line-clamp-3 text-[14px]" : "line-clamp-2 text-[12px]"
          }`}
        >
          {qTrunc}
        </div>

        <div className="mb-2 overflow-hidden rounded-[4px] border border-line">
          <div className="flex items-stretch">
            <div className="flex flex-1 flex-col items-center gap-0.5 border-r border-line bg-up-dim px-2 py-1.5">
              <div
                className={`font-mono font-bold leading-none tracking-[-0.5px] text-up tabular-nums ${
                  featured ? "text-[18px]" : "text-[14px]"
                }`}
              >
                {pct}
                <span className="text-[9px] opacity-60">¢</span>
              </div>
              <div className="mt-0.5 font-mono text-[8px] font-semibold uppercase tracking-[1.5px] text-ink-3">
                YES <span className="font-normal text-[9px]">{yesMulti}x</span>
              </div>
            </div>
            <div className="flex flex-1 flex-col items-center gap-0.5 bg-down-dim px-2 py-1.5">
              <div
                className={`font-mono font-bold leading-none tracking-[-0.5px] text-down tabular-nums ${
                  featured ? "text-[18px]" : "text-[14px]"
                }`}
              >
                {noPct}
                <span className="text-[9px] opacity-60">¢</span>
              </div>
              <div className="mt-0.5 font-mono text-[8px] font-semibold uppercase tracking-[1.5px] text-ink-3">
                NO <span className="font-normal text-[9px]">{noMulti}x</span>
              </div>
            </div>
          </div>
        </div>

        <div className="h-[2px] overflow-hidden rounded-[1px] bg-line">
          <div className="h-full bg-up duration-300" style={{ width: `${pct}%`, transitionProperty: "width" }} />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-line bg-bg-2 px-3 py-1.5">
        <div className="font-mono text-[9px] text-ink-3">
          VOL&nbsp;<b className="text-[10px] text-cyanx">{vol}</b>
        </div>
        <div className="font-mono text-[9px] text-ink-3">
          {market.expiry ? "#" + market.expiry.toString() : "—"}
        </div>
        <button
          className={`p-0.5 text-[13px] transition-colors ${bookmarked ? "text-amberx" : "text-ink-3 hover:text-amberx"}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleBookmark(market.marketId);
          }}
          title="Bookmark"
        >
          {bookmarked ? "★" : "☆"}
        </button>
      </div>
    </div>
  );
}
