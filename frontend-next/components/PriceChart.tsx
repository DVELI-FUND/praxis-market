"use client";
import { useMemo } from "react";
import { useMarketTxs } from "@/lib/txHistory";

interface Props {
  mid: string;
  initialYes: bigint;
  initialNo: bigint;
}

export default function PriceChart({ mid, initialYes, initialNo }: Props) {
  const { data: txs = [] } = useMarketTxs(mid);

  const points = useMemo(() => {
    // Build cumulative YES% at each trade height
    let yes = initialYes;
    let no = initialNo;
    const history: { height: number; pct: number }[] = [];
    const trades = [...txs]
      .filter((t) => t.messageType === "submit_prediction")
      .sort((a, b) => a.height - b.height);

    for (const tx of trades) {
      const shares = BigInt(tx.transaction.msg.shares || 0);
      if (tx.transaction.msg.outcome) yes += shares;
      else no += shares;
      const total = yes + no;
      if (total > 0n) {
        history.push({ height: tx.height, pct: Number((yes * 10000n) / total) / 100 });
      }
    }
    return history;
  }, [txs, initialYes, initialNo]);

  if (points.length < 2) return null;

  // SVG path
  const w = 400;
  const h = 120;
  const min = Math.min(...points.map((p) => p.pct));
  const max = Math.max(...points.map((p) => p.pct));
  const range = max - min || 1;
  const step = w / (points.length - 1);

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${h - ((p.pct - min) / range) * h * 0.8 - 10}`)
    .join(" ");

  const lastPct = points[points.length - 1].pct;
  const trend = lastPct >= points[0].pct ? "up" : "down";

  return (
    <div className="rounded-card border border-line bg-surface-grad p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-mono text-[9px] uppercase tracking-[2px] text-ink-3">YES % History</div>
        <div className={`font-display text-[14px] font-extrabold tabular-nums ${trend === "up" ? "text-up" : "text-down"}`}>
          {lastPct.toFixed(1)}%
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-[100px] w-full">
        <path d={path} fill="none" stroke={trend === "up" ? "rgb(var(--up))" : "rgb(var(--down))"} strokeWidth="2" strokeLinecap="round" />
        <path d={`${path} L${w},${h} L0,${h} Z`} fill={trend === "up" ? "rgb(var(--up) / 0.08)" : "rgb(var(--down) / 0.08)"} />
      </svg>
      <div className="mt-2 flex justify-between font-mono text-[8px] text-ink-3">
        <span>{points[0].height}</span>
        <span>{points.length} trades</span>
        <span>{points[points.length - 1].height}</span>
      </div>
    </div>
  );
}
