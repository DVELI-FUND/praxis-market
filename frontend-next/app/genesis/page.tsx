"use client";
import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/store/wallet";
import { useHeight } from "@/hooks/useHeight";
import { fmtPRX, fmtCountdown } from "@/lib/format";
import { getPluginRPC } from "@/lib/rpc";
import ActionForm from "@/components/ActionForm";
import { ACTIONS } from "@/lib/actions";

interface Alloc {
  address?: string;
  pool_type?: string;
  remaining_balance?: string;
  claimable_amount?: string;
  claimed_amount?: string;
  total_allocation?: string;
  vested_amount?: string;
  eligible?: boolean;
  eligible_reason?: string;
  cliff_height?: string;
  fully_vested_height?: string;
  current_height?: string;
}
type PoolState = { status: "loading" } | { status: "ok"; alloc: Alloc } | { status: "locked" };

const POOLS = [
  { key: "community",  label: "Community Pool",  color: "text-amberx", desc: "5M PRX — liquid, no vesting", action: "claim_genesis_community" },
  { key: "investor",   label: "Investor Pool",   color: "text-up",     desc: "6.5M PRX — 24-month vesting with 91-day cliff",   action: "claim_genesis_investor" },
  { key: "foundation", label: "Foundation Pool", color: "text-ink",    desc: "6.5M PRX — 24-month vesting with 91-day cliff",   action: "claim_genesis_foundation" },
];

async function loadPool(pool: string, addr: string): Promise<PoolState> {
  try {
    const r = await fetch(`${getPluginRPC()}/v1/query/genesis-allocation?pool=${pool}&address=${addr}`, { cache: "no-store" });
    if (!r.ok) return { status: "locked" };
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return { status: "locked" };
    const j = (await r.json()) as Alloc;
    if (j && typeof j === "object" && ("pool_type" in j || "remaining_balance" in j || "total_allocation" in j)) {
      return { status: "ok", alloc: j };
    }
    return { status: "locked" };
  } catch {
    return { status: "locked" };
  }
}

export default function GenesisPage() {
  const { praxisAddress } = useWallet();
  const { data: chain } = useHeight();
  const [states, setStates] = useState<Record<string, PoolState>>({});

  const refresh = useCallback(() => {
    if (!praxisAddress) return;
    POOLS.forEach(async (p) => {
      const st = await loadPool(p.key, praxisAddress);
      setStates((s) => ({ ...s, [p.key]: st }));
    });
  }, [praxisAddress]);

  useEffect(() => {
    if (!praxisAddress) { setStates({}); return; }
    setStates({ community: { status: "loading" }, investor: { status: "loading" }, foundation: { status: "loading" } });
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [praxisAddress, refresh]);

  const currentHeight = chain?.height || 0;

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2.5 font-mono text-[9px] uppercase tracking-[3px] text-amberx">
          <span className="inline-block h-px w-5 bg-amberx" /> Genesis
        </div>
        <h1 className="font-display text-[22px] font-extrabold tracking-[-0.3px]">Genesis Allocations</h1>
        <p className="mt-1 text-[13px] text-ink-2">
          Live on-chain state, refreshed every 15s. Each pool is privacy-gated: its balance and claim form appear only when its own wallet is connected.
        </p>
      </div>

      {!praxisAddress ? (
        <div className="rounded-card border border-line bg-surface p-6 text-center font-mono text-[11px] text-ink-3">
          Connect a genesis wallet (Profile → Advanced — Manual Keystore) to view and claim its allocation
        </div>
      ) : (
        <div className="space-y-4">
          {POOLS.map((p) => {
            const st = states[p.key] || { status: "loading" as const };
            const def = (ACTIONS as Record<string, any>)[p.action];
            return (
              <div key={p.key} className="rounded-card border border-line bg-surface-grad p-5">
                <div className={`mb-1 font-display text-[16px] font-bold ${p.color}`}>{p.label}</div>
                <div className="mb-4 font-mono text-[10px] text-ink-3">{p.desc}</div>

                {st.status === "loading" && (
                  <div className="space-y-2">
                    <div className="h-10 rounded-card border border-line bg-line/20 animate-pulseDot" />
                    <div className="h-10 rounded-card border border-line bg-line/20 animate-pulseDot" />
                  </div>
                )}

                {st.status === "locked" && (
                  <div className="rounded-card border border-line bg-surface p-3 text-center font-mono text-[11px] text-ink-3">
                    Balance hidden on-chain — unlock this pool&apos;s keystore to view &amp; claim
                  </div>
                )}

                {st.status === "ok" && (() => {
                  const a = st.alloc;
                  
                  // Community pool (liquid)
                  if (p.key === "community") {
                    const remaining = a.remaining_balance ? BigInt(a.remaining_balance) : 0n;
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between rounded-card border border-line bg-surface p-3">
                          <span className="font-mono text-[9px] uppercase tracking-wider text-ink-3">Remaining balance</span>
                          <span className="font-display text-[16px] font-bold text-ink">{fmtPRX(remaining)} PRX</span>
                        </div>
                        {remaining === 0n ? (
                          <div className="rounded-card border border-up/30 bg-up/5 p-3 text-center font-mono text-[11px] text-up">
                            Pool fully claimed ✅
                          </div>
                        ) : a.eligible && def ? (
                          <div className="pt-2"><ActionForm def={def} /></div>
                        ) : (
                          <div className="rounded-card border border-line bg-surface p-3 text-center font-mono text-[11px] text-ink-3">
                            {a.eligible_reason || "Not claimable at this height"}
                          </div>
                        )}
                      </div>
                    );
                  }
                  
                  // Vesting pools (investor / foundation)
                  const total = a.total_allocation ? BigInt(a.total_allocation) : 0n;
                  const claimed = a.claimed_amount ? BigInt(a.claimed_amount) : 0n;
                  const vested = a.vested_amount ? BigInt(a.vested_amount) : 0n;
                  const claimable = a.claimable_amount ? BigInt(a.claimable_amount) : 0n;
                  const cliffHeight = a.cliff_height ? Number(a.cliff_height) : 0;
                  const fullyVestedHeight = a.fully_vested_height ? Number(a.fully_vested_height) : 0;
                  
                  const blocksToCliff = cliffHeight > currentHeight ? cliffHeight - currentHeight : 0;
                  const blocksToFullyVested = fullyVestedHeight > currentHeight ? fullyVestedHeight - currentHeight : 0;
                  
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between rounded-card border border-line bg-surface p-3">
                        <span className="font-mono text-[9px] uppercase tracking-wider text-ink-3">Total allocation</span>
                        <span className="font-display text-[16px] font-bold text-ink">{fmtPRX(total)} PRX</span>
                      </div>
                      
                      <div className="flex items-center justify-between rounded-card border border-line bg-surface p-3">
                        <span className="font-mono text-[9px] uppercase tracking-wider text-ink-3">Claimed so far</span>
                        <span className="font-display text-[14px] font-bold text-ink">{fmtPRX(claimed)} PRX</span>
                      </div>
                      
                      <div className="flex items-center justify-between rounded-card border border-line bg-surface p-3">
                        <span className="font-mono text-[9px] uppercase tracking-wider text-ink-3">Vested now</span>
                        <span className="font-display text-[14px] font-bold text-ink">{fmtPRX(vested)} PRX</span>
                      </div>
                      
                      {claimable > 0n && (
                        <div className="flex items-center justify-between rounded-card border border-amberx/30 bg-amberx/5 p-3">
                          <span className="font-mono text-[9px] uppercase tracking-wider text-amberx">Claimable now</span>
                          <span className="font-display text-[16px] font-bold text-amberx">{fmtPRX(claimable)} PRX</span>
                        </div>
                      )}
                      
                      {blocksToCliff > 0 && (
                        <div className="rounded-card border border-line bg-surface p-3">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="font-mono text-[9px] uppercase tracking-wider text-ink-3">Cliff reached in</span>
                            <span className="font-mono text-[11px] font-bold text-ink">{fmtCountdown(blocksToCliff, currentHeight)}</span>
                          </div>
                          <div className="font-mono text-[10px] text-ink-3">
                            Block #{cliffHeight} (current: #{currentHeight})
                          </div>
                        </div>
                      )}
                      
                      {blocksToFullyVested > 0 && blocksToCliff === 0 && (
                        <div className="rounded-card border border-line bg-surface p-3">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="font-mono text-[9px] uppercase tracking-wider text-ink-3">Fully vested in</span>
                            <span className="font-mono text-[11px] font-bold text-ink">{fmtCountdown(blocksToFullyVested, currentHeight)}</span>
                          </div>
                          <div className="font-mono text-[10px] text-ink-3">
                            Block #{fullyVestedHeight} (current: #{currentHeight})
                          </div>
                        </div>
                      )}
                      
                      {claimed === total && vested === total ? (
                        <div className="rounded-card border border-up/30 bg-up/5 p-3 text-center font-mono text-[11px] text-up">
                          Pool fully claimed ✅
                        </div>
                      ) : claimable > 0n && a.eligible && def ? (
                        <div className="pt-2"><ActionForm def={def} /></div>
                      ) : (
                        <div className="rounded-card border border-line bg-surface p-3 text-center font-mono text-[11px] text-ink-3">
                          {a.eligible_reason || "No claimable amount at this height"}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}

          <div className="rounded-card border border-line bg-surface p-4">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-ink-3">How genesis claims work</div>
            <ul className="space-y-1.5 font-mono text-[11px] text-ink-2">
              <li>• <span className="font-bold text-amberx">Community:</span> 5M PRX liquid from genesis, claim anytime</li>
              <li>• <span className="font-bold text-up">Investor:</span> 6.5M PRX vesting over 24 months with 91-day cliff</li>
              <li>• <span className="font-bold">Foundation:</span> 6.5M PRX vesting over 24 months with 91-day cliff</li>
              <li>• Vesting is enforced on-chain; cliff must pass before any claims</li>
              <li>• After cliff, claimable amount increases linearly until fully vested</li>
            </ul>
          </div>
        </div>
      )}
    </main>
  );
}
