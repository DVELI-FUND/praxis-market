"use client";

import { useState, useEffect, useMemo } from "react";
import ActionForm from "./ActionForm";
import { ACTIONS } from "@/lib/actions";
import { useWallet } from "@/store/wallet";
import { useHeight } from "@/hooks/useHeight";
import { useMyResolver, tierOf } from "@/lib/resolvers";
import { getPluginRPC } from "@/lib/rpc";

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

interface RewardContext {
  pool_type: string;
  epoch: number;
  current_epoch: number;
  epoch_pool_amount: string;
  computed_payout: string;
  eligible: boolean;
  eligible_reason: string;
  last_claimed_epoch: number;
  last_claimed_block?: number;
  rrs_score?: number;
  tier_weight?: number;
  successful_resolutions?: number;
  total_weighted_resolutions?: string;
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <div className="mb-2 font-mono text-[8px] uppercase tracking-[2px] text-ink-3">{label}</div>
      <div className={`font-display text-[18px] font-extrabold tabular-nums ${accent}`}>{value}</div>
      <div className="mt-1 font-mono text-[8px] text-ink-3">{sub}</div>
    </div>
  );
}

function fmtPRX(uprx: bigint): string {
  const prx = Number(uprx) / 1_000_000;
  return prx.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function RewardPoolPage({ pool }: { pool: PoolKey }) {
  const meta = POOL_META[pool];
  const { praxisAddress } = useWallet();
  const { data: chain } = useHeight();
  const myResolver = useMyResolver();
  const currentEpoch = chain?.height ? Math.floor(chain.height / 1000) : 0;

  const [epochs, setEpochs] = useState<RewardContext[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!praxisAddress || currentEpoch === 0) {
      setEpochs([]);
      return;
    }

    setLoading(true);
    const fetchEpochs = async () => {
      const startEpoch = Math.max(1, currentEpoch - 4);
      const results: RewardContext[] = [];

      for (let epoch = startEpoch; epoch <= currentEpoch; epoch++) {
        try {
          const url = `${getPluginRPC()}/v1/query/reward-context?pool=${pool}&address=${praxisAddress}&epoch=${epoch}`;
          const res = await fetch(url);
          if (!res.ok) continue;
          const data = await res.json();
          results.push(data);
        } catch {
          // skip failed epochs
        }
      }

      setEpochs(results);
      setLoading(false);
    };

    fetchEpochs();
  }, [praxisAddress, currentEpoch, pool]);

  const stats = useMemo(() => {
    const claimableNow = epochs
      .filter((e) => e.eligible && e.epoch < currentEpoch)
      .reduce((sum, e) => sum + BigInt(e.computed_payout || "0"), 0n);

    const totalEarned = epochs.reduce((sum, e) => sum + BigInt(e.computed_payout || "0"), 0n);

    const currentPool = epochs.find((e) => e.epoch === currentEpoch);
    const currentPoolAmount = currentPool ? BigInt(currentPool.epoch_pool_amount || "0") : 0n;

    return { claimableNow, totalEarned, currentPoolAmount };
  }, [epochs, currentEpoch]);

  const isAuthorized = useMemo(() => {
    if (pool === "resolver") {
      return myResolver !== null;
    }
    const unauthorized = epochs.some((e) => e.eligible_reason?.includes("not the authorized"));
    return !unauthorized && epochs.length > 0;
  }, [pool, myResolver, epochs]);

  return (
    <div className="animate-fadeUp">
      <div className="mb-5">
        <div className="mb-2 flex items-center gap-2.5 font-mono text-[9px] uppercase tracking-[3px] text-up">
          <span className="inline-block h-px w-5 bg-up" /> Rewards
        </div>
        <h1 className="font-display text-[22px] font-extrabold tracking-[-0.3px]">{meta.title}</h1>
        <p className="mt-1 text-[13px] text-ink-2">{meta.sub}</p>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <StatCard
          label="Claimable Now"
          value={loading ? "…" : fmtPRX(stats.claimableNow)}
          sub="PRX"
          accent="text-up"
        />
        <StatCard
          label="Total Earned"
          value={loading ? "…" : fmtPRX(stats.totalEarned)}
          sub="PRX all time"
          accent="text-ink"
        />
        <StatCard
          label="Current Epoch Pool"
          value={loading ? "…" : fmtPRX(stats.currentPoolAmount)}
          sub="PRX this epoch"
          accent="text-ink"
        />
      </div>

      {pool === "investor" && (
        <div className="mb-4 rounded-card border border-amberx/40 bg-amberx/5 p-3 font-mono text-[10px] text-amberx">
          Vesting window: 241,920 blocks (~28 days). Rewards vest linearly.
        </div>
      )}

      {pool === "resolver" && (
        <div className="mb-4 rounded-card border border-line bg-surface p-4">
          <div className="mb-3 border-b border-line pb-2 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">
            Your Resolver Status
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
                <span className="text-ink-3">Payout formula:</span>
                <br />
                <span className="text-ink">epoch_pool × (resolutions × weight) / Σ(weighted resolutions)</span>
              </div>
            </>
          ) : (
            <div className="text-center">
              <div className="mb-3 font-mono text-[11px] text-ink-3">
                {!praxisAddress ? "Connect your wallet to view resolver rewards" : "You are not a registered resolver"}
              </div>
              {!praxisAddress ? (
                <div className="font-mono text-[10px] text-ink-3">Load a key in Signer or connect MetaMask</div>
              ) : (
                <a
                  href="/action/register"
                  className="inline-block rounded border border-up bg-up/10 px-4 py-2 font-mono text-[11px] text-up transition-colors hover:bg-up/20"
                >
                  Register as Resolver (500k PRX)
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {pool !== "resolver" && !praxisAddress && (
        <div className="mb-4 rounded-card border border-line bg-surface p-4 text-center">
          <div className="font-mono text-[11px] text-ink-3">Connect your wallet to view {meta.title}</div>
        </div>
      )}

      {pool !== "resolver" && praxisAddress && !isAuthorized && epochs.length > 0 && (
        <div className="mb-4 rounded-card border border-down/40 bg-down/5 p-4 text-center">
          <div className="mb-2 font-mono text-[11px] text-down">
            {epochs[0]?.eligible_reason || "Not authorized for this reward pool"}
          </div>
          <div className="font-mono text-[9px] text-ink-3">
            This pool requires an authorized wallet address. Contact the protocol team for access.
          </div>
        </div>
      )}

      {praxisAddress && (pool === "resolver" || isAuthorized) && (
        <>
          <div className="mb-3 border-b border-line pb-2 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">
            Epoch History
          </div>
          {loading ? (
            <div className="py-10 text-center font-mono text-[10px] text-ink-3">Loading reward epochs…</div>
          ) : epochs.length === 0 ? (
            <div className="py-10 text-center font-mono text-[10px] text-ink-3">No reward data available</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-[10px]">
                <thead>
                  <tr className="border-b border-line text-ink-3">
                    <th className="pb-2 text-left font-normal">Epoch</th>
                    <th className="pb-2 text-right font-normal">Pool</th>
                    <th className="pb-2 text-right font-normal">Payout</th>
                    <th className="pb-2 text-right font-normal">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {epochs.map((epochData) => {
                    const isCurrent = epochData.epoch === currentEpoch;
                    const isClaimed = epochData.last_claimed_epoch >= epochData.epoch;
                    const isClaimable = epochData.eligible && !isClaimed && !isCurrent;
                    const isNoActivity = !epochData.eligible && epochData.eligible_reason?.includes("no successful resolutions");

                    let status = "";
                    let statusColor = "text-ink-3";

                    if (isCurrent) {
                      status = "In progress";
                      statusColor = "text-up";
                    } else if (isClaimed) {
                      status = "Claimed";
                      statusColor = "text-ink-2";
                    } else if (isClaimable) {
                      status = "Claimable";
                      statusColor = "text-up";
                    } else if (isNoActivity) {
                      status = "No activity";
                      statusColor = "text-ink-3";
                    } else {
                      status = epochData.eligible_reason || "—";
                      statusColor = "text-down";
                    }

                    return (
                      <tr key={epochData.epoch} className="border-b border-line/30">
                        <td className="py-1.5">{epochData.epoch}</td>
                        <td className="py-1.5 text-right">{fmtPRX(BigInt(epochData.epoch_pool_amount || "0"))}</td>
                        <td className="py-1.5 text-right">{fmtPRX(BigInt(epochData.computed_payout || "0"))}</td>
                        <td className={`py-1.5 text-right ${statusColor}`}>{status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {praxisAddress && (pool === "resolver" || isAuthorized) && stats.claimableNow > 0n && (
        <div className="mt-6">
          <ActionForm def={ACTIONS[meta.claimKey]} />
        </div>
      )}
    </div>
  );
}
