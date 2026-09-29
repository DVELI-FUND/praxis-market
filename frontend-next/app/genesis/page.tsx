"use client";
import { useEffect, useState } from "react";
import { useWallet } from "@/store/wallet";
import { useHeight } from "@/hooks/useHeight";
import { useRoles } from "@/lib/roles";
import { isGenesisAddress, getGenesisPool, GENESIS_ADDRESSES } from "@/lib/genesis";
import { fmtPRX } from "@/lib/format";
import { rpc } from "@/lib/rpc";
import { useRouter } from "next/navigation";

interface GenesisResponse {
  address: string;
  pool_type: string;
  // Community fields
  remaining_balance?: string;
  eligible?: boolean;
  eligible_reason?: string;
  // Investor/Foundation fields
  total_allocation?: string;
  claimed_amount?: string;
  vested_amount?: string;
  claimable_amount?: string;
  start_height?: number;
  current_height?: number;
  cliff_height?: number;
  fully_vested_height?: number;
  cliff_blocks?: number;
  vest_duration_blocks?: number;
  // Liquidity
  account_balance?: string;
  note?: string;
}

export default function GenesisPage() {
  const { praxisAddress } = useWallet();
  const { data: chain } = useHeight();
  const roles = useRoles();
  const router = useRouter();
  const [alloc, setAlloc] = useState<GenesisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myPool = getGenesisPool(praxisAddress);
  const canAccess = roles.isAdmin || isGenesisAddress(praxisAddress);

  useEffect(() => {
    if (!canAccess || !praxisAddress || !myPool) return;
    setLoading(true);
    setError(null);
    rpc(`/v1/query/genesis-allocation?pool=${myPool}&address=${praxisAddress}`)
      .then((data: unknown) => {
        setAlloc(data as GenesisResponse);
        setLoading(false);
      })
      .catch((err: any) => {
        setError(err.message || "Failed to load allocation");
        setLoading(false);
      });
  }, [canAccess, praxisAddress, myPool]);

  if (!canAccess) {
    return (
      <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
        <div className="rounded-card border border-line bg-surface p-10 text-center">
          <div className="mb-3 text-ink-3">🔒</div>
          <div className="mb-1 font-display text-[16px] font-bold text-ink">Restricted Access</div>
          <div className="font-mono text-[11px] text-ink-3">Genesis allocation claims are restricted to authorized wallets.</div>
        </div>
      </main>
    );
  }

  if (!praxisAddress) {
    return (
      <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
        <div className="rounded-card border border-line bg-surface p-6 text-center font-mono text-[11px] text-ink-3">
          Connect wallet to claim genesis allocation
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
        <div className="rounded-card border border-line bg-surface p-6 text-center font-mono text-[11px] text-ink-3">
          Loading allocation...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
        <div className="rounded-card border border-line bg-surface p-6 text-center">
          <div className="mb-1 font-display text-[14px] font-bold text-down">Error</div>
          <div className="font-mono text-[11px] text-ink-3">{error}</div>
        </div>
      </main>
    );
  }

  if (!myPool || !alloc) {
    return (
      <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
        <div className="rounded-card border border-line bg-surface p-10 text-center">
          <div className="mb-3 text-ink-3">◎</div>
          <div className="mb-1 font-display text-[16px] font-bold text-ink">No Allocation</div>
          <div className="font-mono text-[11px] text-ink-3">This wallet is not an authorized genesis beneficiary.</div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2.5 font-mono text-[9px] uppercase tracking-[3px] text-up">
          <span className="inline-block h-px w-5 bg-up" /> Genesis
        </div>
        <h1 className="font-display text-[22px] font-extrabold tracking-[-0.3px]">Claim Allocation</h1>
        <p className="mt-1 text-[13px] text-ink-2">25M PRX minted at chain genesis — authorized wallets only</p>
      </div>

      {myPool === "liquidity" ? (
        <LiquidityCard alloc={alloc} />
      ) : myPool === "community" ? (
        <CommunityCard alloc={alloc} router={router} />
      ) : (
        <VestingCard alloc={alloc} pool={myPool} router={router} />
      )}
    </main>
  );
}

function LiquidityCard({ alloc }: { alloc: GenesisResponse }) {
  const balance = alloc.account_balance ? fmtPRX(BigInt(alloc.account_balance)) : "0";
  return (
    <div className="rounded-card border border-line bg-surface-grad p-5">
      <div className="mb-3 font-display text-[15px] font-bold text-up">Liquidity Seed Wallet</div>
      <div className="mb-4 font-mono text-[10px] text-ink-3">Liquid — spend directly via market creation, no claim needed</div>
      <div className="mb-4 rounded-card border border-line bg-surface p-4">
        <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-ink-3">Balance</div>
        <div className="font-display text-[20px] font-bold text-ink">{balance} PRX</div>
      </div>
      <div className="font-mono text-[11px] text-ink-2">{alloc.note}</div>
    </div>
  );
}

function CommunityCard({ alloc, router }: { alloc: GenesisResponse; router: any }) {
  const remaining = alloc.remaining_balance ? fmtPRX(BigInt(alloc.remaining_balance)) : "0";
  const eligible = alloc.eligible;

  return (
    <div className="rounded-card border border-amberx/30 bg-surface-grad p-5">
      <div className="mb-3 font-display text-[15px] font-bold text-amberx">Community Allocation</div>
      <div className="mb-4 font-mono text-[10px] text-ink-3">Liquid — claim full remaining balance, no vesting</div>
      <div className="mb-4 rounded-card border border-line bg-surface p-4">
        <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-ink-3">Remaining</div>
        <div className="font-display text-[20px] font-bold text-ink">{remaining} PRX</div>
      </div>
      {eligible ? (
        <button
          onClick={() => router.push("/action/claim_genesis_community")}
          className="w-full rounded-card bg-up py-3 font-display text-[13px] font-bold text-bg transition-all hover:bg-up/90"
        >
          Claim Community Allocation
        </button>
      ) : (
        <div className="rounded-card border border-line bg-surface p-3 text-center">
          <div className="font-mono text-[11px] text-ink-3">{alloc.eligible_reason || "Not eligible"}</div>
        </div>
      )}
    </div>
  );
}

function VestingCard({ alloc, pool, router }: { alloc: GenesisResponse; pool: string; router: any }) {
  const total = alloc.total_allocation ? BigInt(alloc.total_allocation) : 0n;
  const claimed = alloc.claimed_amount ? BigInt(alloc.claimed_amount) : 0n;
  const vested = alloc.vested_amount ? BigInt(alloc.vested_amount) : 0n;
  const claimable = alloc.claimable_amount ? BigInt(alloc.claimable_amount) : 0n;
  const eligible = alloc.eligible;

  const currentHeight = alloc.current_height || 0;
  const cliffHeight = alloc.cliff_height || 0;
  const fullyVestedHeight = alloc.fully_vested_height || 0;
  const cliffBlocks = alloc.cliff_blocks || 0;
  const vestDurationBlocks = alloc.vest_duration_blocks || 1;

  const blocksUntilCliff = Math.max(0, cliffHeight - currentHeight);
  const vestingProgress = cliffHeight <= currentHeight && currentHeight <= fullyVestedHeight
    ? ((currentHeight - cliffHeight) / vestDurationBlocks) * 100
    : 0;

  const poolLabel = pool === "investor" ? "Investor" : "Foundation";
  const color = pool === "investor" ? "text-pinkx" : "text-cyanx";
  const borderColor = pool === "investor" ? "border-pinkx/30" : "border-cyanx/30";

  return (
    <div className={`rounded-card border ${borderColor} bg-surface-grad p-5`}>
      <div className={`mb-3 font-display text-[15px] font-bold ${color}`}>{poolLabel} Allocation</div>
      <div className="mb-4 font-mono text-[10px] text-ink-3">6-month cliff + 18-month linear vesting</div>

      <div className="mb-4 space-y-3">
        <div className="rounded-card border border-line bg-surface p-4">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-ink-3">Total Allocation</div>
          <div className="font-display text-[18px] font-bold text-ink">{fmtPRX(total)} PRX</div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-card border border-line bg-surface p-3">
            <div className="mb-1 font-mono text-[8px] uppercase tracking-wider text-ink-3">Vested</div>
            <div className="font-display text-[14px] font-bold text-ink">{fmtPRX(vested)}</div>
          </div>
          <div className="rounded-card border border-line bg-surface p-3">
            <div className="mb-1 font-mono text-[8px] uppercase tracking-wider text-ink-3">Claimed</div>
            <div className="font-display text-[14px] font-bold text-ink">{fmtPRX(claimed)}</div>
          </div>
        </div>

        <div className="rounded-card border border-line bg-surface p-4">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-ink-3">Claimable Now</div>
          <div className={`font-display text-[20px] font-bold ${claimable > 0n ? "text-up" : "text-ink-3"}`}>
            {fmtPRX(claimable)} PRX
          </div>
        </div>
      </div>

      {blocksUntilCliff > 0 && (
        <div className="mb-4 rounded-card border border-line bg-surface p-3">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-ink-3">Blocks Until Cliff</div>
          <div className="font-mono text-[13px] font-bold text-ink">{blocksUntilCliff.toLocaleString()}</div>
        </div>
      )}

      {vestingProgress > 0 && (
        <div className="mb-4">
          <div className="mb-2 font-mono text-[9px] uppercase tracking-wider text-ink-3">Vesting Progress</div>
          <div className="h-2 overflow-hidden rounded-pill bg-surface">
            <div
              className="h-full bg-up transition-all"
              style={{ width: `${Math.min(100, vestingProgress)}%` }}
            />
          </div>
          <div className="mt-1 text-right font-mono text-[10px] text-ink-3">{vestingProgress.toFixed(1)}%</div>
        </div>
      )}

      {eligible ? (
        <button
          onClick={() => router.push(`/action/claim_genesis_${pool}`)}
          className="w-full rounded-card bg-up py-3 font-display text-[13px] font-bold text-bg transition-all hover:bg-up/90"
        >
          Claim {poolLabel} Allocation
        </button>
      ) : (
        <div className="rounded-card border border-line bg-surface p-3 text-center">
          <div className="font-mono text-[11px] text-ink-3">{alloc.eligible_reason || "Not eligible"}</div>
        </div>
      )}
    </div>
  );
}
