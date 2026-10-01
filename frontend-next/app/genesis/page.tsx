"use client";
import { useEffect, useState } from "react";
import { useWallet } from "@/store/wallet";
import { fmtPRX } from "@/lib/format";
import { rpc } from "@/lib/rpc";
import ActionForm from "@/components/ActionForm";
import { ACTIONS } from "@/lib/actions";

interface GenesisAllocation {
  address: string;
  pool_type: string;
  remaining_balance?: string;
  claimable_amount?: string;
  eligible?: boolean;
  eligible_reason?: string;
  next_claim_height?: string;
}

const POOLS = [
  { key: "community", label: "Community Pool", color: "amberx", desc: "5M PRX — liquid, no vesting" },
  { key: "investor", label: "Investor Pool", color: "up", desc: "3M PRX — 24-month vesting" },
  { key: "foundation", label: "Foundation Pool", color: "ink", desc: "2M PRX — 36-month vesting" },
];

export default function GenesisPage() {
  const { praxisAddress } = useWallet();
  const [allocations, setAllocations] = useState<Record<string, GenesisAllocation>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!praxisAddress) {
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all(
      POOLS.map((pool) =>
        rpc(`/v1/query/genesis-allocation?pool=${pool.key}&address=${praxisAddress}`)
          .then((data: unknown) => ({ pool: pool.key, data: data as GenesisAllocation }))
          .catch(() => ({ pool: pool.key, data: null }))
      )
    ).then((results) => {
      const map: Record<string, GenesisAllocation> = {};
      results.forEach(({ pool, data }) => {
        if (data) map[pool] = data;
      });
      setAllocations(map);
      setLoading(false);
    });
  }, [praxisAddress]);

  if (!praxisAddress) {
    return (
      <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
        <div className="mb-6">
          <h1 className="font-display text-[22px] font-extrabold tracking-[-0.3px]">Genesis Allocations</h1>
          <p className="mt-1 text-[13px] text-ink-2">Connect wallet to view allocations</p>
        </div>
        <div className="rounded-card border border-line bg-surface p-6 text-center font-mono text-[11px] text-ink-3">
          Connect wallet to view your genesis allocations
        </div>
      </main>
    );
  }

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2.5 font-mono text-[9px] uppercase tracking-[3px] text-amberx">
          <span className="inline-block h-px w-5 bg-amberx" /> Genesis
        </div>
        <h1 className="font-display text-[22px] font-extrabold tracking-[-0.3px]">Genesis Allocations</h1>
        <p className="mt-1 text-[13px] text-ink-2">
          Claim your pre-allocated PRX from genesis — community pool is liquid, investor and foundation vest over time
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-card border border-line bg-surface p-5">
              <div className="mb-3 h-5 w-32 rounded bg-line/30 animate-pulseDot" />
              <div className="mb-2 h-3 w-48 rounded bg-line/30 animate-pulseDot" />
              <div className="h-8 w-24 rounded bg-line/30 animate-pulseDot" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {POOLS.map((pool) => {
            const alloc = allocations[pool.key];
            const remaining = alloc?.remaining_balance ? fmtPRX(BigInt(alloc.remaining_balance)) : "0";
            const claimable = alloc?.claimable_amount ? fmtPRX(BigInt(alloc.claimable_amount)) : null;
            const eligible = alloc?.eligible;

            return (
              <div key={pool.key} className="rounded-card border border-line bg-surface-grad p-5">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <div className={`mb-1 font-display text-[16px] font-bold text-${pool.color}`}>
                      {pool.label}
                    </div>
                    <div className="font-mono text-[10px] text-ink-3">{pool.desc}</div>
                  </div>
                  {eligible && (
                    <div className="rounded-pill bg-amberx/10 px-2 py-0.5 font-mono text-[9px] font-bold text-amberx">
                      ELIGIBLE
                    </div>
                  )}
                </div>

                <div className="mb-4 space-y-2">
                  <div className="flex items-center justify-between rounded-card border border-line bg-surface p-3">
                    <div className="font-mono text-[9px] uppercase tracking-wider text-ink-3">
                      Remaining Balance
                    </div>
                    <div className="font-display text-[16px] font-bold text-ink">{remaining} PRX</div>
                  </div>

                  {claimable && claimable !== "0" && (
                    <div className="flex items-center justify-between rounded-card border border-amberx/30 bg-amberx/5 p-3">
                      <div className="font-mono text-[9px] uppercase tracking-wider text-amberx">
                        Claimable Now
                      </div>
                      <div className="font-display text-[16px] font-bold text-amberx">{claimable} PRX</div>
                    </div>
                  )}

                  {alloc?.next_claim_height && (
                    <div className="flex items-center justify-between rounded-card border border-line bg-surface p-3">
                      <div className="font-mono text-[9px] uppercase tracking-wider text-ink-3">
                        Next Claim Height
                      </div>
                      <div className="font-mono text-[11px] font-bold text-ink">
                        #{alloc.next_claim_height}
                      </div>
                    </div>
                  )}
                </div>

                {!alloc && (
                  <div className="rounded-card border border-line bg-surface p-3 text-center">
                    <div className="font-mono text-[11px] text-ink-3">
                      No allocation found for this address
                    </div>
                  </div>
                )}

                {alloc && !eligible && alloc.eligible_reason && (
                  <div className="rounded-card border border-line bg-surface p-3">
                    <div className="font-mono text-[10px] text-ink-3">{alloc.eligible_reason}</div>
                  </div>
                )}

                {eligible && (
                  <div className="mt-4">
                    <ActionForm def={ACTIONS[`claim_genesis_${pool.key}`]} />
                  </div>
                )}
              </div>
            );
          })}

          <div className="rounded-card border border-line bg-surface p-4">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-ink-3">
              How Genesis Claims Work
            </div>
            <ul className="space-y-1.5 font-mono text-[11px] text-ink-2">
              <li>• <span className="font-bold text-amberx">Community:</span> 5M PRX liquid from genesis, claim anytime</li>
              <li>• <span className="font-bold text-up">Investor:</span> 3M PRX vesting over 24 months, claim unlocked portions</li>
              <li>• <span className="font-bold">Foundation:</span> 2M PRX vesting over 36 months, claim unlocked portions</li>
              <li>• Each claim transfers available balance to your wallet</li>
              <li>• Vesting schedules are enforced on-chain, no manual tracking needed</li>
            </ul>
          </div>
        </div>
      )}
    </main>
  );
}
