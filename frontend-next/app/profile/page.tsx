"use client";
import { useMemo } from "react";
import { useWallet } from "@/store/wallet";
import { useQuery } from "@tanstack/react-query";
import { b64ToHex, fmtPRX } from "@/lib/format";
import { useMarkets } from "@/hooks/useMarkets";
import { queryAccount } from "@/lib/rpc";
import { stripCatPrefix, yesPct, CAT_SYMBOLS, extractCat } from "@/lib/markets";

interface Position {
  marketId: string;
  sharesYes: bigint;
  sharesNo: bigint;
}

async function fetchPositions(addr: string): Promise<Position[]> {
  try {
    const url = `https://prax.val-a.grad.dev.app.canopynetwork.org/plugin/v1/query/positions?address=${encodeURIComponent(addr)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const raw = await res.json();
    if (!raw.positions) return [];
    return raw.positions.map((p: Record<string, unknown>) => ({
      marketId: b64ToHex(String(p.marketId || p.market_id || "")),
      sharesYes: BigInt((p.sharesYes || p.shares_yes || 0) as number | string),
      sharesNo: BigInt((p.sharesNo || p.shares_no || 0) as number | string),
    }));
  } catch {
    return [];
  }
}

async function fetchBalance(addr: string): Promise<bigint> {
  try {
    const r = await queryAccount(addr);
    return BigInt(r?.amount || 0);
  } catch {
    return 0n;
  }
}

export default function ProfilePage() {
  const { praxisAddress } = useWallet();
  const { data: markets = [] } = useMarkets();

  const { data: positions = [] } = useQuery({
    queryKey: ["positions", praxisAddress],
    queryFn: () => fetchPositions(praxisAddress as string),
    enabled: !!praxisAddress,
    staleTime: 30000,
  });

  const { data: balance = 0n } = useQuery({
    queryKey: ["balance", praxisAddress],
    queryFn: () => fetchBalance(praxisAddress as string),
    enabled: !!praxisAddress,
    staleTime: 15000,
    refetchInterval: 15000,
  });

  const enriched = useMemo(() => {
    return positions.map((pos) => {
      const market = markets.find((m) => m.marketId === pos.marketId);
      if (!market) return { ...pos, market: null, value: 0n, pnl: 0n, cat: "other" };
      const pct = yesPct(market);
      const yesValue = (pos.sharesYes * BigInt(pct)) / 100n;
      const noValue = (pos.sharesNo * BigInt(100 - pct)) / 100n;
      const value = yesValue + noValue;
      const pnl = value - (pos.sharesYes + pos.sharesNo); // simplified
      return { ...pos, market, value, pnl, cat: extractCat(market.rules) };
    });
  }, [positions, markets]);

  const positionsValue = useMemo(() => enriched.reduce((sum, p) => sum + p.value, 0n), [enriched]);
  const netWorth = balance + positionsValue;

  const byCategory = useMemo(() => {
    const acc: Record<string, bigint> = {};
    for (const p of enriched) {
      acc[p.cat] = (acc[p.cat] || 0n) + p.value;
    }
    return Object.entries(acc).sort((a, b) => Number(b[1] - a[1]));
  }, [enriched]);

  if (!praxisAddress) {
    return (
      <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
        <div className="rounded-card border border-line bg-surface p-8 text-center">
          <div className="font-mono text-[11px] text-ink-3">Connect wallet to view profile</div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[1100px] px-4 py-8 pb-24 md:px-8">
      <div className="mb-6">
        <h1 className="font-display text-[28px] font-extrabold tracking-[-0.5px] text-ink">Profile</h1>
        <p className="mt-1 font-mono text-[10px] text-ink-3">{praxisAddress.slice(0, 10)}…{praxisAddress.slice(-6)}</p>
      </div>

      {/* net worth + category breakdown */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-card border border-line bg-surface-grad p-6 shadow-card">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">Net Worth</div>
          <div className="font-display text-[36px] font-extrabold text-up tabular-nums">
            {fmtPRX(netWorth)} <span className="text-[16px] text-ink-3">PRX</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-4 font-mono text-[10px] text-ink-2">
            <span>Balance <b className="text-cyanx tabular-nums">{fmtPRX(balance)}</b></span>
            <span>Positions <b className="text-up tabular-nums">{fmtPRX(positionsValue)}</b></span>
            <span>{enriched.length} active position{enriched.length !== 1 ? "s" : ""}</span>
          </div>
        </div>

        <div className="rounded-card border border-line bg-surface-grad p-6 shadow-card">
          <div className="mb-3 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">By Category</div>
          {byCategory.length === 0 ? (
            <div className="py-8 text-center font-mono text-[10px] text-ink-3">No positions</div>
          ) : (
            <div className="space-y-2">
              {byCategory.slice(0, 4).map(([cat, val]) => {
                const pct = netWorth > 0n ? Number((val * 100n) / netWorth) : 0;
                return (
                  <div key={cat} className="flex items-center gap-3">
                    <span className="w-[60px] font-mono text-[10px] text-ink-2">{cat}</span>
                    <div className="flex-1">
                      <div className="h-[6px] overflow-hidden rounded-pill bg-line">
                        <div className="h-full bg-grad-up" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <span className="w-[80px] text-right font-mono text-[10px] text-ink tabular-nums">{fmtPRX(val)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* positions table */}
      <div className="overflow-hidden rounded-card border border-line bg-surface-grad shadow-card">
        <div className="border-b border-line px-4 py-3">
          <div className="font-display text-[14px] font-bold text-ink">Positions</div>
        </div>
        {enriched.length === 0 ? (
          <div className="px-4 py-10 text-center font-mono text-[10px] text-ink-3">
            No positions yet — trade a market to get started
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 border-b border-line px-4 py-2.5 font-mono text-[8px] uppercase tracking-[1.5px] text-ink-3">
              <span>Market</span>
              <span className="w-[80px] text-right">YES</span>
              <span className="w-[80px] text-right">NO</span>
              <span className="w-[90px] text-right">Value</span>
              <span className="w-[80px] text-right">PnL</span>
            </div>
            {enriched.map((pos) => {
              if (!pos.market) return null;
              const pnlColor = pos.pnl >= 0n ? "text-up" : "text-down";
              const pnlSign = pos.pnl >= 0n ? "+" : "";
              return (
                <a
                  key={pos.marketId}
                  href={`/market/${pos.marketId}`}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 border-b border-line/50 px-4 py-3 transition-colors hover:bg-surface-2 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="line-clamp-1 font-sans text-[12px] font-semibold text-ink">
                      {stripCatPrefix(pos.market.question || pos.market.rules || "")}
                    </div>
                    <div className="mt-0.5 font-mono text-[9px] text-ink-3">{pos.market.status}</div>
                  </div>
                  <span className="w-[80px] text-right font-mono text-[10px] text-up tabular-nums">{fmtPRX(pos.sharesYes)}</span>
                  <span className="w-[80px] text-right font-mono text-[10px] text-down tabular-nums">{fmtPRX(pos.sharesNo)}</span>
                  <span className="w-[90px] text-right font-mono text-[10px] text-ink tabular-nums">{fmtPRX(pos.value)}</span>
                  <span className={`w-[80px] text-right font-mono text-[10px] ${pnlColor} tabular-nums`}>
                    {pnlSign}{fmtPRX(pos.pnl)}
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
