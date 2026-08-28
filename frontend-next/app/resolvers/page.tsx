"use client";
import { useQuery } from "@tanstack/react-query";
import { fetchResolvers } from "@/lib/resolvers";
import { fmtPRX } from "@/lib/format";

const PH6_CANARY = "PRAXIS-NEXT-PH6";

function tier(rrs: number): { name: string; cls: string } {
  if (rrs >= 200) return { name: "Gold", cls: "border-amberx/40 bg-amberx/10 text-amberx" };
  if (rrs >= 50) return { name: "Silver", cls: "border-line-2 bg-surface-2 text-ink-2" };
  return { name: "Bronze", cls: "border-[#cd7f32]/40 bg-[#cd7f32]/10 text-[#cd7f32]" };
}

export default function ResolversPage() {
  const { data: resolvers = [], isLoading } = useQuery({
    queryKey: ["resolvers"],
    queryFn: fetchResolvers,
    staleTime: 60000,
  });

  const activeCount = resolvers.filter((r) => r.active).length;
  const totalStake = resolvers.reduce<bigint>((s, r) => s + (r.stake > 0n ? r.stake : r.unbonding), 0n);

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2.5 font-mono text-[9px] uppercase tracking-[3px] text-up">
          <span className="inline-block h-px w-5 bg-up" /> Network
        </div>
        <h1 className="font-display text-[22px] font-extrabold tracking-[-0.3px]">Browse Resolvers</h1>
        <p className="mt-1 text-[13px] text-ink-2">Active resolvers staking $PRX to guarantee market outcomes</p>
      </div>

      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        <div className="flex items-center gap-1.5 whitespace-nowrap rounded-card border border-line bg-surface px-2.5 py-1.5 font-mono text-[9px] text-ink-2">
          Resolvers <b className="font-display text-[13px] font-bold text-ink">{resolvers.length}</b>
        </div>
        <div className="flex items-center gap-1.5 whitespace-nowrap rounded-card border border-line bg-surface px-2.5 py-1.5 font-mono text-[9px] text-ink-2">
          Active <b className="font-display text-[13px] font-bold text-up">{activeCount}</b>
        </div>
        <div className="flex items-center gap-1.5 whitespace-nowrap rounded-card border border-line bg-surface px-2.5 py-1.5 font-mono text-[9px] text-ink-2">
          Staked <b className="font-display text-[13px] font-bold text-up tabular-nums">{fmtPRX(totalStake)}</b>
        </div>
      </div>

      {isLoading ? (
        <div className="py-10 text-center font-mono text-[11px] text-ink-3">
          <span className="animate-pulseDot">▪ ▪ ▪</span>&nbsp;&nbsp;loading resolvers
        </div>
      ) : (
        <div className="space-y-2">
          {resolvers.map((r, i) => {
            const t = tier(r.rrsScore);
            const shown = r.stake > 0n ? r.stake : r.unbonding;
            return (
              <div
                key={r.address}
                className="flex items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5"
              >
                <span className="w-6 font-mono text-[9px] text-ink-3">#{i + 1}</span>
                <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-line bg-bg-2 font-mono text-[11px] text-up">
                  {r.address.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-ink">
                      {r.address.slice(0, 10)}…{r.address.slice(-6)}
                    </span>
                    <span className={`rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[1px] ${t.cls}`}>
                      {t.name} · RRS {r.rrsScore}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-[9px] text-ink-3">
                    {r.resolutions} resolution{r.resolutions === 1 ? "" : "s"} · reg #{r.registeredAt}
                    {r.stake === 0n && r.unbonding > 0n && ` · unbonding until #${r.releaseHeight}`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-display text-[13px] font-bold text-up tabular-nums">{fmtPRX(shown)}</div>
                  <div className={`font-mono text-[8px] uppercase tracking-[1px] ${r.active ? "text-up" : "text-ink-3"}`}>
                    {r.active ? "● active" : "○ inactive"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <span className="hidden" aria-hidden="true">{PH6_CANARY}</span>
    </main>
  );
}
