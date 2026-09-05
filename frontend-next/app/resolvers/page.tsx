"use client";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchResolvers } from "@/lib/resolvers";
import { fmtPRX } from "@/lib/format";
import { useHeight } from "@/hooks/useHeight";

function tier(rrs: number): { name: string; cls: string; ring: string } {
  if (rrs >= 200) return { name: "Gold", cls: "border-[#d4a017]/40 bg-[#d4a017]/10 text-[#d4a017]", ring: "border-[#d4a017]" };
  if (rrs >= 50) return { name: "Silver", cls: "border-[#a8b3c4]/40 bg-[#a8b3c4]/10 text-[#a8b3c4]", ring: "border-[#a8b3c4]" };
  return { name: "Bronze", cls: "border-[#b08968]/40 bg-[#b08968]/10 text-[#b08968]", ring: "border-line-2" };
}

function fmtAge(blocks: number): string {
  const secs = blocks * 10;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  const days = Math.floor(secs / 86400);
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  return months > 0 ? `${years}y ${months}mo` : `${years}y`;
}

const MEDAL = ["bg-[#d4a017] text-black", "bg-[#a8b3c4] text-black", "bg-[#b08968] text-black"];

export default function ResolversPage() {
  const { data: chain } = useHeight();
  const { data: resolvers = [], isLoading } = useQuery({
    queryKey: ["resolvers"],
    queryFn: fetchResolvers,
    staleTime: 60000,
  });

  const currentBlock = chain?.height ?? 0;

  const stats = useMemo(() => {
    const activeCount = resolvers.filter((r) => r.active).length;
    const totalStake = resolvers.reduce<bigint>((s, r) => s + (r.stake > 0n ? r.stake : r.unbonding), 0n);
    const totalResolutions = resolvers.reduce((s, r) => s + r.resolutions, 0);
    return { activeCount, totalStake, totalResolutions };
  }, [resolvers]);

  const enriched = useMemo(() => {
    return resolvers.map((r, i) => {
      const age = currentBlock > r.registeredAt ? currentBlock - r.registeredAt : 0;
      const shown = r.stake > 0n ? r.stake : r.unbonding;
      const stakePct = stats.totalStake > 0n ? Number((shown * 10000n) / stats.totalStake) / 100 : 0;
      return { ...r, age, shown, stakePct, rank: i };
    });
  }, [resolvers, currentBlock, stats.totalStake]);

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[1100px] px-4 py-6 pb-24 md:px-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2.5 font-mono text-[9px] uppercase tracking-[3px] text-up">
          <span className="inline-block h-px w-5 bg-up" /> Network
        </div>
        <h1 className="font-display text-[22px] font-extrabold tracking-[-0.3px]">Browse Resolvers</h1>
        <p className="mt-1 text-[13px] text-ink-2">Active resolvers staking $PRX to guarantee market outcomes</p>
      </div>

      {/* tier legend */}
      <div className="mb-4 flex flex-wrap items-center gap-4 font-mono text-[9px] text-ink-3">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#d4a017]" /> Gold · RRS 200+ · 7x rewards</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#a8b3c4]" /> Silver · RRS 50+ · 3x</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#b08968]" /> Bronze · 1x</span>
      </div>

      {/* stat widgets */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-card border border-line bg-surface-grad p-4 shadow-card">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">Resolvers</div>
          <div className="font-display text-[22px] font-extrabold text-ink tabular-nums">{resolvers.length}</div>
        </div>
        <div className="rounded-card border border-line bg-surface-grad p-4 shadow-card">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">Active</div>
          <div className="font-display text-[22px] font-extrabold text-up tabular-nums">{stats.activeCount}</div>
        </div>
        <div className="rounded-card border border-line bg-surface-grad p-4 shadow-card">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">Total Staked</div>
          <div className="font-display text-[22px] font-extrabold text-up tabular-nums">{fmtPRX(stats.totalStake)}</div>
        </div>
        <div className="rounded-card border border-line bg-surface-grad p-4 shadow-card">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">Resolutions</div>
          <div className="font-display text-[22px] font-extrabold text-cyanx tabular-nums">{stats.totalResolutions}</div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-10 text-center font-mono text-[11px] text-ink-3">
          <span className="animate-pulseDot">▪ ▪ ▪</span>&nbsp;&nbsp;loading resolvers
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-surface-grad shadow-card">
          {/* header row */}
          <div className="grid grid-cols-[40px_1fr_auto] items-center gap-3 border-b border-line bg-surface-2 px-4 py-2.5 font-mono text-[8px] uppercase tracking-[1.5px] text-ink-3 md:grid-cols-[40px_1fr_180px_140px_auto]">
            <span className="hidden md:block">Rank</span>
            <span>Resolver</span>
            <span className="hidden text-right md:block">Resolutions</span>
            <span className="hidden text-right md:block">Stake</span>
            <span className="text-right">Status</span>
          </div>

          {/* rows */}
          <div>
            {enriched.map((r) => {
              const t = tier(r.rrsScore);
              return (
                <div
                  key={r.address}
                  className="grid grid-cols-[40px_1fr_auto] items-center gap-3 border-b border-line/50 px-4 py-3 transition-colors last:border-b-0 hover:bg-surface-2 md:grid-cols-[40px_1fr_180px_140px_auto]"
                >
                  {/* rank medal */}
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold ${r.rank < 3 ? MEDAL[r.rank] : "bg-surface-3 text-ink-3"}`}>
                    {r.rank + 1}
                  </span>

                  {/* resolver info */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className={`flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full border-2 bg-bg-2 font-mono text-[11px] font-bold text-up ${t.ring}`}>
                        {r.address.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-mono text-[11px] text-ink">{r.address.slice(0, 10)}…{r.address.slice(-6)}</span>
                          {r.active && <span className="h-1.5 w-1.5 rounded-full bg-up animate-pulseDot" />}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-pill border px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[1px] ${t.cls}`}>
                            {t.name}
                          </span>
                          <span className="rounded-pill border border-line bg-bg-2 px-2 py-0.5 font-mono text-[8px] text-ink-3">
                            RRS {r.rrsScore}
                          </span>
                          <span className="rounded-pill border border-line bg-bg-2 px-2 py-0.5 font-mono text-[8px] text-ink-3">
                            {fmtAge(r.age)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* resolutions */}
                  <div className="hidden text-right md:block">
                    <div className="font-mono text-[11px] text-ink tabular-nums">{r.resolutions}</div>
                    <div className="font-mono text-[8px] text-ink-3">reg #{r.registeredAt}</div>
                  </div>

                  {/* stake + bar */}
                  <div className="hidden md:block">
                    <div className="mb-1 text-right font-mono text-[11px] font-bold text-up tabular-nums">{fmtPRX(r.shown)}</div>
                    <div className="h-1.5 overflow-hidden rounded-pill bg-line">
                      <div className="h-full bg-up" style={{ width: `${Math.min(100, r.stakePct * 4)}%` }} />
                    </div>
                    <div className="mt-0.5 text-right font-mono text-[8px] text-ink-3">{r.stakePct.toFixed(1)}%</div>
                  </div>

                  {/* status */}
                  <div className="text-right">
                    <span className={`rounded-pill border px-2 py-0.5 font-mono text-[9px] font-bold ${r.active ? "border-up/40 bg-up-dim text-up" : "border-line bg-surface-3 text-ink-3"}`}>
                      {r.active ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
