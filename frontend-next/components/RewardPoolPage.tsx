"use client";
import ActionForm from "./ActionForm";
import { ACTIONS } from "@/lib/actions";
import { useWallet } from "@/store/wallet";
import { useHeight } from "@/hooks/useHeight";
import { useMyResolver, tierOf } from "@/lib/resolvers";

export type PoolKey = "resolver" | "builder" | "community" | "investor" | "protocol";

export const POOL_META: Record<PoolKey, { title: string; sub: string; claimKey: string }> = {
  resolver: {
    title: "Resolver Rewards",
    sub: "Epoch-weighted rewards based on your RRS tier and resolution activity",
    claimKey: "claim_resolver",
  },
  builder: {
    title: "Builder Rewards",
    sub: "Protocol development rewards for builders",
    claimKey: "claim_builder",
  },
  community: {
    title: "Community Rewards",
    sub: "Participation rewards for active predictors",
    claimKey: "claim_community",
  },
  investor: {
    title: "Investor Rewards",
    sub: "Liquidity provision rewards — 241,920 block vesting window",
    claimKey: "claim_investor",
  },
  protocol: {
    title: "Protocol Rewards",
    sub: "Governance and staking rewards from protocol treasury",
    claimKey: "claim_protocol",
  },
};

function StatCard({ label, sub, accent }: { label: string; sub: string; accent: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <div className="mb-2 font-mono text-[8px] uppercase tracking-[2px] text-ink-3">{label}</div>
      <div className={`font-display text-[18px] font-extrabold tabular-nums ${accent}`}>—</div>
      <div className="mt-1 font-mono text-[8px] text-ink-3">{sub}</div>
    </div>
  );
}

export default function RewardPoolPage({ pool }: { pool: PoolKey }) {
  const meta = POOL_META[pool];
  const { praxisAddress } = useWallet();
  const { data: chain } = useHeight();
  const myResolver = useMyResolver();
  const epoch = chain?.height ? Math.floor(chain.height / 1000) : 0;

  return (
    <div className="animate-fadeUp">
      <div className="mb-5">
        <div className="mb-2 flex items-center gap-2.5 font-mono text-[9px] uppercase tracking-[3px] text-up">
          <span className="inline-block h-px w-5 bg-up" /> Rewards
        </div>
        <h1 className="font-display text-[22px] font-extrabold tracking-[-0.3px]">{meta.title}</h1>
        <p className="mt-1 text-[13px] text-ink-2">{meta.sub}</p>
      </div>

      {/* stat cards — amounts pending reward-stats endpoint (engineer TODO) */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <StatCard label="Claimable Now" sub="PRX" accent="text-up" />
        <StatCard label="Total Earned" sub="PRX all time" accent="text-ink" />
        <StatCard label="Current Epoch Pool" sub="PRX this epoch" accent="text-ink" />
      </div>

      {pool === "investor" && (
        <div className="mb-4 rounded-card border border-amberx/40 bg-amberx/5 p-3 font-mono text-[10px] text-amberx">
          Vesting window: 241,920 blocks (~28 days). Rewards vest linearly.
        </div>
      )}

      {pool === "resolver" && (
        <>
          <div className="mb-4 rounded-card border border-line bg-surface p-4">
            <div className="mb-3 border-b border-line pb-2 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">
              // resolver_status
            </div>
            {myResolver ? (
              <>
                <span className={`inline-block rounded border px-2 py-1 font-mono text-[10px] ${tierOf(myResolver.rrsScore).cls}`}>
                  {tierOf(myResolver.rrsScore).label} — RRS {myResolver.rrsScore}
                </span>
                <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[10px]">
                  <div className="rounded-card border border-line bg-bg-2 px-2 py-1.5">
                    Resolutions <b className="text-ink">{myResolver.resolutions}</b>
                  </div>
                  <div className="rounded-card border border-line bg-bg-2 px-2 py-1.5">
                    RRS Score <b className="text-ink">{myResolver.rrsScore}</b>
                  </div>
                  <div className="rounded-card border border-line bg-bg-2 px-2 py-1.5">
                    Weight <b className="text-ink">{tierOf(myResolver.rrsScore).weight}×</b>
                  </div>
                </div>
                <div className="mt-3 rounded-card border border-line bg-bg-2 p-2.5 font-mono text-[9px] leading-relaxed">
                  <span className="text-up">Share formula:</span>{" "}
                  <span className="text-ink-3">epoch_pool × (resolutions × weight) / Σ(weighted resolutions)</span>
                  <br />
                  <span className="text-ink-3">
                    Weight = <b className="text-up">1×</b> Bronze / <b className="text-up">3×</b> Silver (RRS 50–199) /{" "}
                    <b className="text-up">7×</b> Gold (RRS 200+)
                  </span>
                </div>
              </>
            ) : (
              <div className="font-mono text-[10px] text-ink-3">Connect signer to load resolver status</div>
            )}
          </div>

          <div className="mb-4 rounded-card border border-line bg-surface p-4">
            <div className="mb-3 border-b border-line pb-2 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">
              // epoch_history
            </div>
            <table className="w-full">
              <thead>
                <tr className="font-mono text-[8px] uppercase tracking-[1px] text-ink-3">
                  <th className="pb-1 text-left">Epoch</th>
                  <th className="pb-1 text-left">Pool (PRX)</th>
                  <th className="pb-1 text-left">Your Share</th>
                  <th className="pb-1 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {!praxisAddress ? (
                  <tr>
                    <td colSpan={4} className="py-3 text-center font-mono text-[9px] text-ink-3">
                      Connect signer to load history
                    </td>
                  </tr>
                ) : (
                  Array.from({ length: 5 }, (_, k) => epoch - 4 + k).map((i) =>
                    i < 0 ? null : (
                      <tr key={i} className="border-t border-line font-mono text-[9px]">
                        <td className="py-1.5 text-ink-2">#{i}</td>
                        <td className="py-1.5 text-ink-3">—</td>
                        <td className="py-1.5 text-ink-3">—</td>
                        <td className={`py-1.5 text-right ${i === epoch ? "text-up" : "text-ink-3"}`}>
                          {i === epoch ? "In progress" : "Claimable"}
                        </td>
                      </tr>
                    )
                  )
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="mx-auto max-w-[560px]">
        <ActionForm def={ACTIONS[meta.claimKey]} />
      </div>
    </div>
  );
}
