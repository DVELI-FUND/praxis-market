"use client";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/store/wallet";
import { useMarkets } from "@/hooks/useMarkets";
import { getPluginRPC, queryAccount } from "@/lib/rpc";
import LogoMark from "@/components/LogoMark";
import WalletPill from "@/components/WalletPill";
import { b64ToHex, fmtPRX } from "@/lib/format";
import { yesPct, stripCatPrefix } from "@/lib/markets";

interface Position {
  marketId: string;
  bettorAddress: string;
  sharesYes: bigint;
  sharesNo: bigint;
}

async function fetchPositions(addr: string): Promise<Position[]> {
  try {
    const url = getPluginRPC() + `/v1/query/positions?address=${encodeURIComponent(addr)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const raw = (await res.json()) as { positions?: Record<string, unknown>[] };
    if (!raw.positions) return [];
    return raw.positions.map((p: Record<string, unknown>) => ({
      marketId: b64ToHex(String(p.marketId || p.market_id || "")),
      bettorAddress: b64ToHex(String(p.bettorAddress || p.bettor_address || "")),
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

export default function PortfolioPage() {
  const { praxisAddress } = useWallet();
  const { data: markets = [] } = useMarkets();

  const { data: positions = [] } = useQuery({
    queryKey: ["positions", praxisAddress],
    queryFn: () => fetchPositions(praxisAddress as string),
    enabled: !!praxisAddress,
    staleTime: 30000,
    refetchInterval: 15000,
  });

  const { data: balance = 0n } = useQuery({
    queryKey: ["balance", praxisAddress],
    queryFn: () => fetchBalance(praxisAddress as string),
    enabled: !!praxisAddress,
    staleTime: 15000,
    refetchInterval: 15000,
  });

  if (!praxisAddress) {
    return (
      <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
        <div className="flex flex-col items-center gap-4 rounded-card border border-line bg-surface-grad p-10 text-center shadow-card">
          <span className="text-ink"><LogoMark className="h-10 w-10" /></span>
          <div>
            <div className="font-display text-[16px] font-extrabold text-ink">Your portfolio awaits</div>
            <div className="mt-1 font-mono text-[10px] text-ink-3">Connect your wallet to view balance, assets and positions</div>
          </div>
          <WalletPill />
        </div>
      </main>
    );
  }

  const enriched = positions.map((pos) => {
    const market = markets.find((m) => m.marketId === pos.marketId);
    if (!market) return { ...pos, market: null, value: 0n };
    const pct = yesPct(market);
    const yesValue = (pos.sharesYes * BigInt(pct)) / 100n;
    const noValue = (pos.sharesNo * BigInt(100 - pct)) / 100n;
    return { ...pos, market, value: yesValue + noValue };
  });

  const positionsValue = enriched.reduce((s, p) => s + p.value, 0n);
  const netWorth = balance + positionsValue;

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2.5 font-mono text-[9px] uppercase tracking-[3px] text-up">
          <span className="inline-block h-px w-5 bg-up" /> Portfolio
        </div>
        <h1 className="font-display text-[22px] font-extrabold tracking-[-0.3px]">My Positions</h1>
        <p className="mt-1 text-[13px] text-ink-2">
          {enriched.length} active position{enriched.length !== 1 ? "s" : ""} · current value based on live prices
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-card border border-line bg-surface-grad p-4 shadow-card">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">Spot Balance</div>
          <div className="font-display text-[22px] font-extrabold text-cyanx tabular-nums">
            {fmtPRX(balance)} <span className="text-[12px] text-ink-3">PRX</span>
          </div>
        </div>
        <div className="rounded-card border border-line bg-surface-grad p-4 shadow-card">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">Positions Value</div>
          <div className="font-display text-[22px] font-extrabold text-up tabular-nums">
            {fmtPRX(positionsValue)} <span className="text-[12px] text-ink-3">PRX</span>
          </div>
        </div>
        <div className="rounded-card border border-line bg-surface-grad p-4 shadow-card">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">Net Worth</div>
          <div className="font-display text-[22px] font-extrabold text-ink tabular-nums">
            {fmtPRX(netWorth)} <span className="text-[12px] text-ink-3">PRX</span>
          </div>
        </div>
      </div>

      {enriched.length === 0 ? (
        <div className="rounded-card border border-line bg-surface p-6 text-center">
          <div className="mb-2 font-mono text-[26px] text-ink-3">◈</div>
          <div className="font-mono text-[11px] text-ink-3">No positions yet — trade a market to get started</div>
        </div>
      ) : (
        <div className="space-y-2">
          {enriched.map((pos) => {
            if (!pos.market) {
              return (
                <div key={pos.marketId} className="rounded-card border border-line bg-surface p-3 font-mono text-[10px] text-ink-3">
                  {pos.marketId.slice(0, 16)}… (market not found)
                </div>
              );
            }
            const pct = yesPct(pos.market);
            const question = stripCatPrefix(pos.market.question || pos.market.rules || "");
            return (
              <a
                key={pos.marketId}
                href={`/market/${pos.marketId}`}
                className="block rounded-card border border-line bg-surface-grad p-3 shadow-card transition-colors hover:border-line-2"
              >
                <div className="mb-2 line-clamp-2 font-sans text-[12px] font-semibold text-ink">
                  {question.length > 80 ? question.slice(0, 80) + "…" : question}
                </div>
                <div className="flex items-center justify-between font-mono text-[10px]">
                  <div className="flex gap-3">
                    <span className="text-ink-3">
                      YES <b className="text-up">{fmtPRX(pos.sharesYes)}</b>
                    </span>
                    <span className="text-ink-3">
                      NO <b className="text-down">{fmtPRX(pos.sharesNo)}</b>
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-ink-3">Value</div>
                    <div className="text-[12px] text-up tabular-nums">{fmtPRX(pos.value)} PRX</div>
                  </div>
                </div>
                <div className="mt-1 flex items-center justify-between font-mono text-[8px] text-ink-3">
                  <span>{pos.market.status}</span>
                  <span className="tabular-nums">YES {pct}%</span>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </main>
  );
}
