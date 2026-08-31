"use client";
import { useMemo, useState } from "react";
import { useMarketTxs } from "@/lib/txHistory";
import { useHeight } from "@/hooks/useHeight";

interface Props { mid: string; initialYes: bigint; initialNo: bigint; }

const RANGES = { "1D": 17280, "1W": 120960, "1M": 518400, ALL: 0 } as const;
type RangeKey = keyof typeof RANGES;

export default function PriceChart({ mid, initialYes, initialNo }: Props) {
  const { data: txs = [] } = useMarketTxs(mid);
  const { data: chain } = useHeight();
  const [range, setRange] = useState<RangeKey>("1W");

  const total0 = initialYes + initialNo;
  const currentPct = total0 > 0n ? Number((initialYes * 10000n) / total0) / 100 : 50;
  const height = chain?.height ?? 0;

  const allPoints = useMemo(() => {
    let yes = initialYes, no = initialNo;
    const hist: { height: number; pct: number }[] = [];
    const trades = [...txs].filter((t) => t.messageType === "submit_prediction").sort((a, b) => a.height - b.height);
    for (const tx of trades) {
      const sh = BigInt(tx.transaction.msg.shares || 0);
      if (tx.transaction.msg.outcome) yes += sh; else no += sh;
      const tot = yes + no;
      if (tot > 0n) hist.push({ height: tx.height, pct: Number((yes * 10000n) / tot) / 100 });
    }
    return hist;
  }, [txs, initialYes, initialNo]);

  const minH = range === "ALL" ? 0 : Math.max(0, height - RANGES[range]);
  let points = allPoints.filter((p) => p.height >= minH);
  if (points.length < 2) {
    const start = minH || Math.max(0, height - 17280);
    points = [ { height: start, pct: currentPct }, { height: height || start + 1, pct: currentPct } ];
  }

  const w = 400, h = 150, padR = 36, padB = 20, padT = 8;
  const x = (i: number) => (i / (points.length - 1)) * (w - padR);
  const y = (v: number) => padT + (1 - v / 100) * (h - padT - padB);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.pct).toFixed(1)}`).join(" ");
  const last = points[points.length - 1].pct;
  const up = last >= points[0].pct;
  const color = up ? "rgb(var(--up))" : "rgb(var(--down))";
  const blockToTime = (bh: number) => new Date(Date.now() - (height - bh) * 5000);
  const fmtD = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div className="rounded-card border border-line bg-surface-grad p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1">
          {(Object.keys(RANGES) as RangeKey[]).map((r) => (
            <button key={r} onClick={() => setRange(r)} className={`rounded-pill px-2.5 py-1 font-mono text-[9px] transition-colors ${range === r ? "bg-up font-bold text-black" : "text-ink-3 hover:text-ink-2"}`}>
              {r}
            </button>
          ))}
        </div>
        <div className={`font-display text-[15px] font-extrabold tabular-nums ${up ? "text-up" : "text-down"}`}>{last.toFixed(1)}%</div>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={0} x2={w - padR} y1={y(g)} y2={y(g)} stroke="rgb(var(--line))" strokeWidth="0.6" strokeDasharray="3 3" />
            <text x={w - padR + 4} y={y(g) + 3} fontSize="8" fill="rgb(var(--ink-3))">{g}%</text>
          </g>
        ))}
        <path d={`${path} L${x(points.length - 1)},${y(0)} L0,${y(0)} Z`} fill={up ? "rgb(var(--up) / 0.07)" : "rgb(var(--down) / 0.07)"} />
        <path d={path} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        <circle cx={x(points.length - 1)} cy={y(last)} r="3" fill={color} />
        <text x={0} y={h - 4} fontSize="8" fill="rgb(var(--ink-3))">{fmtD(blockToTime(points[0].height))}</text>
        <text x={w - padR} y={h - 4} fontSize="8" fill="rgb(var(--ink-3))" textAnchor="end">{fmtD(blockToTime(points[points.length - 1].height))}</text>
      </svg>
      <div className="mt-1 text-right font-mono text-[8px] text-ink-3">{points.length} data point{points.length !== 1 ? "s" : ""}</div>
    </div>
  );
}
