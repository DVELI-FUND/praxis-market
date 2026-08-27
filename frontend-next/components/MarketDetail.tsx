"use client";
import Link from "next/link";
import { useMarketDetail } from "@/hooks/useMarketDetail";
import { extractCat, extractImg, stripCatPrefix, yesPct, STATUS } from "@/lib/markets";
import { fmtPRX } from "@/lib/format";
import StatusPill from "./StatusPill";
import DetailTabs from "./DetailTabs";

interface Props {
  mid: string;
}

export default function MarketDetail({ mid }: Props) {
  const { market, holders, disputeContext, isLoading, isError } = useMarketDetail(mid);

  if (isLoading) {
    return (
      <div className="py-10 text-center font-mono text-[11px] text-ink-3">
        <span className="animate-pulseDot">▪ ▪ ▪</span>&nbsp;&nbsp;loading market
      </div>
    );
  }

  if (isError || !market) {
    return <div className="rounded-card border border-down/40 bg-down-dim p-4 font-mono text-[11px] text-down">⚠ Market not found</div>;
  }

  const pct = yesPct(market);
  const noPct = 100 - pct;
  const total = market.qYes + market.qNo;
  const vol = total > 0n ? fmtPRX(total) : "—";
  const catKey = extractCat(market.rules);
  const imgUrl = extractImg(market.rules);
  const question = stripCatPrefix(market.question || market.rules || "(no question)");

  return (
    <div className="animate-fadeUp">
      {/* Back button */}
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 font-mono text-[10px] text-ink-2 hover:text-up"
      >
        ← Back to Markets
      </Link>

      {/* Hero */}
      <div className="relative mb-4 overflow-hidden rounded-card border border-line bg-surface">
        {imgUrl && (
          <img
            src={imgUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-20"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}
        <div className="relative p-5">
          <div className="mb-2 flex items-center gap-2">
            <StatusPill status={market.status} />
            <span className="font-mono text-[9px] uppercase tracking-[1px] text-ink-3">{catKey}</span>
          </div>
          <h1 className="mb-3 font-display text-[18px] font-extrabold leading-tight tracking-[-0.2px] md:text-[22px]">
            {question}
          </h1>
          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-ink-2">
            <span>
              VOL <b className="text-up tabular-nums">{vol}</b>
            </span>
            <span className="text-ink-3">·</span>
            <span className="tabular-nums">#{market.expiry.toString()}</span>
          </div>
        </div>
      </div>

      {/* Probability block */}
      <div className="mb-4 overflow-hidden rounded-card border border-line bg-surface">
        <div className="flex items-stretch">
          <div className="flex flex-1 flex-col items-center gap-1 border-r border-line bg-up-dim px-4 py-5">
            <div className="font-display text-[36px] font-extrabold leading-none tracking-[-0.5px] text-up tabular-nums">
              {pct}
              <span className="text-[14px] opacity-60">¢</span>
            </div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink-3">YES</div>
            <div className="font-mono text-[11px] text-ink-2 tabular-nums">{fmtPRX(market.qYes)}</div>
          </div>
          <div className="flex flex-1 flex-col items-center gap-1 bg-down-dim px-4 py-5">
            <div className="font-display text-[36px] font-extrabold leading-none tracking-[-0.5px] text-down tabular-nums">
              {noPct}
              <span className="text-[14px] opacity-60">¢</span>
            </div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-ink-3">NO</div>
            <div className="font-mono text-[11px] text-ink-2 tabular-nums">{fmtPRX(market.qNo)}</div>
          </div>
        </div>
        <div className="h-[3px] overflow-hidden bg-line">
          <div className="h-full bg-up duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Status banner */}
      {market.status === STATUS.CANCELLED && (
        <div className="mb-4 rounded-card border border-down/40 bg-down-dim p-4 font-mono text-[11px] text-down">
          ✕ This market has been cancelled. All bettors can reclaim their stakes.
        </div>
      )}
      {market.status === STATUS.EXPIRED && (
        <div className="mb-4 rounded-card border border-amberx/40 bg-amberx/5 p-4 font-mono text-[11px] text-amberx">
          ⏱ This market has expired and is awaiting resolution.
        </div>
      )}
      {market.status === STATUS.FINALIZED && (
        <div className="mb-4 rounded-card border border-bluex/40 bg-bluex/5 p-4 font-mono text-[11px] text-bluex">
          ✓ This market has been finalized.
        </div>
      )}
      {market.status === STATUS.VOIDED && (
        <div className="mb-4 rounded-card border border-ink-3/40 bg-ink-3/5 p-4 font-mono text-[11px] text-ink-2">
          ✕ This market has been voided.
        </div>
      )}

      {/* Tabs */}
      {holders && <DetailTabs mid={mid} market={market} holders={holders} disputeContext={disputeContext} />}
    </div>
  );
}
