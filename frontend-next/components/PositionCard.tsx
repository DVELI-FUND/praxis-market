"use client";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/store/wallet";
import { fetchPositionFull, type Holder, type MarketDetail } from "@/lib/detail";
import { fmtPRX } from "@/lib/format";
import { topShareIndex } from "@/lib/nOutcome";
import { positionValue } from "@/lib/positions";

// `holders` is accepted for backwards compatibility but no longer used: /v1/query/positions only
// returns the top 10 holders, so the wallet's own position is read from /v1/query/position instead.
export default function PositionCard({ market }: { market: MarketDetail; holders?: Holder[] }) {
  const { praxisAddress, status } = useWallet();
  const connected = status === "connected" || status === "drift";
  const { data: me } = useQuery({
    queryKey: ["position", market.marketId, praxisAddress],
    queryFn: () => fetchPositionFull(market.marketId, praxisAddress as string),
    enabled: connected && !!praxisAddress,
    staleTime: 10000,
    refetchInterval: 30000,
  });
  if (!connected || !praxisAddress || !me) return null;

  const isN = market.options.length > 0;
  const sy = me.yes;
  const sn = me.no;
  const ns = me.shares;
  const topIdx = isN ? topShareIndex(ns) : -1;
  if (isN ? topIdx < 0 : sy === 0n && sn === 0n) return null;

  const cost = me.costPaid;
  const value = me.claimed
    ? 0n
    : positionValue({ marketId: market.marketId, sharesYes: sy, sharesNo: sn, shares: ns, costPaid: cost, claimed: me.claimed }, market);
  const pnl = value - cost;
  const held = isN ? (market.options[topIdx] ?? `#${topIdx + 1}`) : sy >= sn ? "YES" : "NO";
  const shares = isN ? ns[topIdx] : sy >= sn ? sy : sn;

  return (
    <div className="mb-4 overflow-hidden rounded-card border border-line bg-surface-grad shadow-card">
      <div className="border-b border-line px-4 py-2.5 font-mono text-[11px] uppercase tracking-[2px] text-ink-3">
        Your Position{me.claimed ? " · claimed" : ""}
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-5">
        <div><div className="font-mono text-[11px] uppercase text-ink-3">Held</div><div className={`font-display text-[16px] font-extrabold ${held === "NO" ? "text-down" : "text-up"}`}>{held}</div></div>
        <div><div className="font-mono text-[11px] uppercase text-ink-3">Shares</div><div className="font-mono text-[14px] text-ink tabular-nums">{fmtPRX(shares)}</div></div>
        <div><div className="font-mono text-[11px] uppercase text-ink-3">Value</div><div className="font-mono text-[14px] text-ink tabular-nums">{me.claimed ? "—" : fmtPRX(value)}</div></div>
        <div><div className="font-mono text-[11px] uppercase text-ink-3">Cost</div><div className="font-mono text-[14px] text-ink tabular-nums">{fmtPRX(cost)}</div></div>
        <div><div className="font-mono text-[11px] uppercase text-ink-3">PnL</div><div className={`font-mono text-[14px] tabular-nums ${me.claimed ? "text-ink-3" : pnl >= 0n ? "text-up" : "text-down"}`}>{me.claimed ? "—" : `${pnl >= 0n ? "+" : ""}${fmtPRX(pnl)}`}</div></div>
      </div>
    </div>
  );
}
