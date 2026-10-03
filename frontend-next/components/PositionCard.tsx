"use client";
import { useWallet } from "@/store/wallet";
import type { Holder, MarketDetail } from "@/lib/detail";
import { fmtPRX } from "@/lib/format";
import { yesPct } from "@/lib/markets";
import { nPositionValue, topShareIndex } from "@/lib/nOutcome";

export default function PositionCard({ market, holders }: { market: MarketDetail; holders: Holder[] }) {
  const { praxisAddress, status } = useWallet();
  const connected = status === "connected" || status === "drift";
  if (!connected || !praxisAddress) return null;

  const me = holders.find((h) => String(h.address) === praxisAddress);
  const isN = market.options.length > 0;
  const sy = BigInt(Math.round(Number(me?.sharesYes || 0)));
  const sn = BigInt(Math.round(Number(me?.sharesNo || 0)));
  const ns = me?.shares ?? [];
  const topIdx = isN ? topShareIndex(ns) : -1;
  if (isN ? topIdx < 0 : sy === 0n && sn === 0n) return null;

  const pct = yesPct(market);
  const value = isN
    ? nPositionValue(ns, market.q, market.b0)
    : (sy * BigInt(pct)) / 100n + (sn * BigInt(100 - pct)) / 100n;
  const cost = BigInt(Math.round(Number(me?.costPaid || 0)));
  const pnl = value - cost;
  const held = isN ? (market.options[topIdx] ?? `#${topIdx + 1}`) : sy >= sn ? "YES" : "NO";
  const shares = isN ? ns[topIdx] : sy >= sn ? sy : sn;

  return (
    <div className="mb-4 overflow-hidden rounded-card border border-line bg-surface-grad shadow-card">
      <div className="border-b border-line px-4 py-2.5 font-mono text-[11px] uppercase tracking-[2px] text-ink-3">Your Position</div>
      <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-5">
        <div><div className="font-mono text-[11px] uppercase text-ink-3">Held</div><div className={`font-display text-[16px] font-extrabold ${held === "NO" ? "text-down" : "text-up"}`}>{held}</div></div>
        <div><div className="font-mono text-[11px] uppercase text-ink-3">Shares</div><div className="font-mono text-[14px] text-ink tabular-nums">{fmtPRX(shares)}</div></div>
        <div><div className="font-mono text-[11px] uppercase text-ink-3">Value</div><div className="font-mono text-[14px] text-ink tabular-nums">{fmtPRX(value)}</div></div>
        <div><div className="font-mono text-[11px] uppercase text-ink-3">Avg Cost</div><div className="font-mono text-[14px] text-ink tabular-nums">{fmtPRX(cost)}</div></div>
        <div><div className="font-mono text-[11px] uppercase text-ink-3">PnL</div><div className={`font-mono text-[14px] tabular-nums ${pnl >= 0n ? "text-up" : "text-down"}`}>{pnl >= 0n ? "+" : ""}{fmtPRX(pnl)}</div></div>
      </div>
    </div>
  );
}
