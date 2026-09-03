"use client";
import KeystorePanel from "@/components/KeystorePanel";
import { useMemo, useState } from "react";
import { useWallet } from "@/store/wallet";
import { usePositions } from "@/lib/positions";
import { useQuery } from "@tanstack/react-query";
import { queryAccount } from "@/lib/rpc";
import { b64ToHex, fmtPRX } from "@/lib/format";
import { useMarkets } from "@/hooks/useMarkets";
import { stripCatPrefix, yesPct, extractCat, STATUS } from "@/lib/markets";
import { ACTIONS } from "@/lib/actions";
import ActionForm from "@/components/ActionForm";
import LogoMark from "@/components/LogoMark";
import BannerImg from "@/components/BannerImg";
import WalletPill from "@/components/WalletPill";

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
    const raw = (await res.json()) as { positions?: Record<string, unknown>[] };
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

export default function ProfilePage() {
  const { praxisAddress } = useWallet();
  const { data: markets = [] } = useMarkets();
  const [panel, setPanel] = useState<"" | "send" | "receive">("");
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"positions" | "stats">("positions");

  const { data: balance = 0n } = useQuery({
    queryKey: ["balance", praxisAddress],
    queryFn: async () => {
      const r = await queryAccount(praxisAddress as string);
      return BigInt(r?.amount || 0);
    },
    enabled: !!praxisAddress,
    staleTime: 15000,
    refetchInterval: 15000,
  });

const { data: positions = [] } = usePositions();const enriched = useMemo(() => {
    return positions.map((pos) => {
      const market = markets.find((m) => m.marketId === pos.marketId);
      if (!market) return { ...pos, market: null, value: 0n, cat: "other" };
      const pct = yesPct(market);
      const value = (pos.sharesYes * BigInt(pct)) / 100n + (pos.sharesNo * BigInt(100 - pct)) / 100n;
      return { ...pos, market, value, cat: extractCat(market.rules) };
    });
  }, [positions, markets]);

  const positionsValue = enriched.reduce((s, p) => s + p.value, 0n);
  const netWorth = balance + positionsValue;

  const byCategory = useMemo(() => {
    const acc: Record<string, bigint> = {};
    for (const p of enriched) acc[p.cat] = (acc[p.cat] || 0n) + p.value;
    return Object.entries(acc).sort((a, b) => Number(b[1] - a[1]));
  }, [enriched]);

  const fmtNum = (big: bigint) => {
    const str = fmtPRX(big);
    if (!/^-?\d+(\.\d+)?$/.test(str)) return str;
    const n = Number(str);
    const fixed = Math.abs(n) >= 1 ? n.toFixed(2) : n.toFixed(4);
    return fixed.replace(/\.?0+$/, "");
  };

  const copyAddr = async () => {
    if (!praxisAddress) return;
    await navigator.clipboard.writeText(praxisAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[1100px] px-4 py-8 pb-24 md:px-8">
      {/* header: avatar + address */}
      <div className="mb-6 flex items-center gap-4">
        <div className="rounded-full bg-grad-brand p-[2px] shadow-glowUp">
          <div className="rounded-full bg-surface p-2.5 text-ink">
            <LogoMark className="h-8 w-8" />
          </div>
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-[24px] font-extrabold tracking-[-0.4px] text-ink">Profile</h1>
          <button onClick={copyAddr} className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-ink-3 transition-colors hover:text-up" title="Copy address">
            {praxisAddress.slice(0, 10)}…{praxisAddress.slice(-6)}
            <span className="text-[9px]">{copied ? "✓ copied" : "⎘"}</span>
          </button>
        </div>
      </div>

      {/* net worth + assets */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-card border border-line shadow-card">
          <div className="rounded-card bg-surface-grad p-6">
            <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">Net Worth</div>
            <div className="font-display text-[34px] font-extrabold text-up tabular-nums">
              {fmtPRX(netWorth)} <span className="text-[15px] text-ink-3">PRX</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-4 font-mono text-[10px] text-ink-2">
              <span>Available <b className="text-cyanx tabular-nums">{fmtPRX(balance)}</b></span>
              <span>In positions <b className="text-up tabular-nums">{fmtPRX(positionsValue)}</b></span>
            </div>
          </div>
        </div>

        {/* assets */}
        <div className="rounded-card border border-line bg-surface-grad p-5 shadow-card">
          <div className="mb-3 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">Assets</div>
          <div className="flex items-center gap-3 rounded-card border border-line bg-bg-2 p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card border border-line-2 bg-surface text-ink">
              <LogoMark className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-sans text-[13px] font-bold text-ink">PRX</div>
              <div className="font-mono text-[9px] text-ink-3">Praxis Token · available</div>
            </div>
            <div className="text-right">
              <div className="font-display text-[15px] font-extrabold text-ink tabular-nums">{fmtPRX(balance)}</div>
              <div className="font-mono text-[9px] text-ink-3">PRX</div>
            </div>
          </div>
        </div>
      </div>

      {/* send / receive */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <button
          onClick={() => setPanel(panel === "send" ? "" : "send")}
          className={`rounded-card border py-3 font-sans text-[13px] font-extrabold transition-all ${
            panel === "send" ? "border-up bg-up-dim text-up shadow-glowUp" : "border-line-2 bg-surface-grad text-ink hover:border-up hover:text-up"
          }`}
        >
          ↑ Send
        </button>
        <button
          onClick={() => setPanel(panel === "receive" ? "" : "receive")}
          className={`rounded-card border py-3 font-sans text-[13px] font-extrabold transition-all ${
            panel === "receive" ? "border-cyanx bg-cyanx/10 text-cyanx" : "border-line-2 bg-surface-grad text-ink hover:border-cyanx hover:text-cyanx"
          }`}
        >
          ↓ Receive
        </button>
      </div>

      {panel === "send" && (
        <div className="mb-6 rounded-card border border-line bg-surface-grad p-4 shadow-card">
          <ActionForm def={ACTIONS.send} />
        </div>
      )}

      {panel === "receive" && (
        <div className="mb-6 rounded-card border border-line bg-surface-grad p-5 shadow-card">
          <div className="mb-2 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">Your PRX address</div>
          <div className="mb-3 break-all rounded-card border border-line bg-bg p-3 font-mono text-[11px] text-cyanx">{praxisAddress}</div>
          <button onClick={copyAddr} className="w-full rounded-card bg-up py-2.5 font-sans text-[12px] font-extrabold text-black shadow-glowUp hover:brightness-110">
            {copied ? "✓ Copied" : "⎘ Copy address"}
          </button>
          <div className="mt-2 font-mono text-[8px] text-ink-3">Share this address to receive PRX</div>
        </div>
      )}

      {/* category breakdown */}
      <div className="mb-6 rounded-card border border-line bg-surface-grad p-5 shadow-card">
        <div className="mb-3 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">By Category</div>
        {byCategory.length === 0 ? (
          <div className="py-6 text-center font-mono text-[10px] text-ink-3">No positions</div>
        ) : (
          <div className="space-y-2">
            {byCategory.slice(0, 4).map(([cat, val]) => {
              const pct = netWorth > 0n ? Number((val * 100n) / netWorth) : 0;
              return (
                <div key={cat} className="flex items-center gap-3">
                  <span className="w-[60px] font-mono text-[10px] text-ink-2">{cat}</span>
                  <div className="flex-1">
                    <div className="h-[6px] overflow-hidden rounded-pill bg-line">
                      <div className="h-full bg-up" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <span className="w-[80px] text-right font-mono text-[10px] text-ink tabular-nums">{fmtPRX(val)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* tabs */}
      <div className="mb-6">
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setTab("positions")}
            className={`rounded-pill px-4 py-2 font-mono text-[11px] font-bold transition-colors ${
              tab === "positions" ? "bg-up text-black" : "bg-surface-grad text-ink-2 hover:text-ink"
            }`}
          >
            Positions ({enriched.length})
          </button>
          <button
            onClick={() => setTab("stats")}
            className={`rounded-pill px-4 py-2 font-mono text-[11px] font-bold transition-colors ${
              tab === "stats" ? "bg-up text-black" : "bg-surface-grad text-ink-2 hover:text-ink"
            }`}
          >
            Stats
          </button>
        </div>

        {tab === "positions" && (
          <div className="space-y-3">
            {enriched.length === 0 ? (
              <div className="rounded-card border border-line bg-surface-grad p-10 text-center shadow-card">
                <div className="font-mono text-[10px] text-ink-3">No positions yet — trade a market to get started</div>
              </div>
            ) : (
              enriched.map((pos) => {
                if (!pos.market) return null;
                const costPaid = BigInt(Math.round(Number(pos.costPaid || 0)));
                const pnl = pos.value - costPaid;
                const pnlPct = costPaid > 0n ? Number((pnl * 10000n) / costPaid) / 100 : 0;
                const held = pos.sharesYes >= pos.sharesNo ? "YES" : "NO";
                const shares = pos.sharesYes >= pos.sharesNo ? pos.sharesYes : pos.sharesNo;
                const status = pos.market.status === STATUS.LIVE ? "LIVE" : "ENDED";

                return (
                  <a
                    key={pos.marketId}
                    href={`/market/${pos.marketId}`}
                    className="block rounded-card border border-line bg-surface-grad p-4 shadow-card transition-all hover:border-line-2 hover:shadow-card-hover"
                  >
                    <div className="flex gap-3">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-card border border-line-2 bg-bg-2">
                        <BannerImg
                          rules={pos.market.rules}
                          className="h-full w-full object-cover"
                          fallback={<div className="flex h-full w-full items-center justify-center text-ink-3">📊</div>}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-start gap-2">
                          <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[8px] font-bold ${
                            status === "LIVE" ? "bg-up/20 text-up" : "bg-ink-3/20 text-ink-3"
                          }`}>
                            {status}
                          </span>
                          <span className="line-clamp-2 font-display text-[13px] font-semibold text-ink">
                            {stripCatPrefix(pos.market.question || pos.market.rules || "")}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 font-mono text-[10px] text-ink-3">
                          <span>
                            <b className={held === "YES" ? "text-up" : "text-down"}>{held}</b> {fmtPRX(shares)} shares
                          </span>
                          <span>Value <b className="text-ink tabular-nums">{fmtNum(pos.value)}</b></span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end justify-between">
                        <div className={`font-display text-[16px] font-extrabold tabular-nums ${pnl >= 0n ? "text-up" : "text-down"}`}>
                          {pnl >= 0n ? "+" : ""}{fmtNum(pnl)}
                        </div>
                        <div className={`font-mono text-[10px] tabular-nums ${pnl >= 0n ? "text-up" : "text-down"}`}>
                          {pnlPct > 0 ? "+" : ""}{pnlPct.toFixed(1) === "-0.0" ? pnlPct.toFixed(2) : pnlPct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </a>
                );
              })
            )}
          </div>
        )}

        {tab === "stats" && (
          <div className="space-y-3">
            {enriched.length === 0 ? (
              <div className="rounded-card border border-line bg-surface-grad p-10 text-center shadow-card">
                <div className="font-mono text-[10px] text-ink-3">No stats yet — trade a market to see performance</div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-card border border-line bg-surface-grad p-4 shadow-card">
                    <div className="font-mono text-[9px] uppercase tracking-[2px] text-ink-3">Positions</div>
                    <div className="mt-1 font-display text-[20px] font-extrabold text-ink tabular-nums">{enriched.length}</div>
                  </div>
                  <div className="rounded-card border border-line bg-surface-grad p-4 shadow-card">
                    <div className="font-mono text-[9px] uppercase tracking-[2px] text-ink-3">Total Value</div>
                    <div className="mt-1 font-display text-[20px] font-extrabold text-up tabular-nums">{fmtPRX(positionsValue)}</div>
                  </div>
                  <div className="rounded-card border border-line bg-surface-grad p-4 shadow-card">
                    <div className="font-mono text-[9px] uppercase tracking-[2px] text-ink-3">Best Performer</div>
                    <div className="mt-1 font-display text-[20px] font-extrabold text-up tabular-nums">
                      {(() => {
                        const best = enriched.reduce((acc, p) => {
                          const pnl = p.value - BigInt(Math.round(Number(p.costPaid || 0)));
                          return pnl > acc.pnl ? { pnl, name: p.market?.question || "?" } : acc;
                        }, { pnl: 0n, name: "?" });
                        return `${best.pnl > 0n ? "+" : ""}${fmtNum(best.pnl)}`;
                      })()}
                    </div>
                  </div>
                  <div className="rounded-card border border-line bg-surface-grad p-4 shadow-card">
                    <div className="font-mono text-[9px] uppercase tracking-[2px] text-ink-3">Worst Performer</div>
                    <div className="mt-1 font-display text-[20px] font-extrabold text-down tabular-nums">
                      {(() => {
                        const worst = enriched.reduce((acc, p) => {
                          const pnl = p.value - BigInt(Math.round(Number(p.costPaid || 0)));
                          return pnl < acc.pnl ? { pnl, name: p.market?.question || "?" } : acc;
                        }, { pnl: 0n, name: "?" });
                        return `${fmtNum(worst.pnl)}`;
                      })()}
                    </div>
                  </div>
                </div>
                <div className="rounded-card border border-line bg-surface-grad p-4 shadow-card">
                  <div className="mb-3 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">Avg Position Size</div>
                  <div className="font-display text-[24px] font-extrabold text-ink tabular-nums">
                    {fmtPRX(positionsValue / BigInt(enriched.length || 1))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    <KeystorePanel />
      </main>
  );
}
