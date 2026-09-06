"use client";
import { useMemo } from "react";
import Link from "next/link";
import { useWallet } from "@/store/wallet";
import { useHeight } from "@/hooks/useHeight";
import { useRoles } from "@/lib/roles";
import { isGenesisAddress, getGenesisPool, GENESIS_ADDRESSES } from "@/lib/genesis";
import { fmtPRX, fmtCountdown } from "@/lib/format";
import { ACTIONS } from "@/lib/actions";
import { useRouter } from "next/navigation";

const POOLS = [
  { key: "community", name: "Community", amount: "5,000,000", desc: "Liquid allocation — claim any time", color: "text-amberx", border: "border-amberx/30" },
  { key: "investor", name: "Investor", amount: "6,500,000", desc: "6mo cliff + 18mo linear vesting", color: "text-pinkx", border: "border-pinkx/30" },
  { key: "foundation", name: "Foundation", amount: "6,500,000", desc: "6mo cliff + 18mo linear vesting", color: "text-cyanx", border: "border-cyanx/30" },
];

export default function GenesisPage() {
  const { praxisAddress } = useWallet();
  const { data: chain } = useHeight();
  const roles = useRoles();
  const router = useRouter();

  const myPool = getGenesisPool(praxisAddress);
  const canAccess = roles.isAdmin || isGenesisAddress(praxisAddress);

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

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2.5 font-mono text-[9px] uppercase tracking-[3px] text-up">
          <span className="inline-block h-px w-5 bg-up" /> Genesis
        </div>
        <h1 className="font-display text-[22px] font-extrabold tracking-[-0.3px]">Claim Allocation</h1>
        <p className="mt-1 text-[13px] text-ink-2">25M PRX minted at chain genesis — authorized wallets only</p>
      </div>

      {myPool ? (
        <MyPoolCard pool={myPool} address={praxisAddress} chain={chain} router={router} />
      ) : (
        <div className="rounded-card border border-line bg-surface p-10 text-center">
          <div className="mb-3 text-ink-3">◎</div>
          <div className="mb-1 font-display text-[16px] font-bold text-ink">No Allocation</div>
          <div className="font-mono text-[11px] text-ink-3">This wallet is not an authorized genesis beneficiary.</div>
        </div>
      )}

      <div className="mt-6">
        <h2 className="mb-3 font-display text-[14px] font-bold text-ink">All Allocations</h2>
        <div className="space-y-2">
          {POOLS.map((p) => (
            <div key={p.key} className={`rounded-card border ${p.border} bg-surface-grad p-4`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className={`mb-0.5 font-display text-[13px] font-bold ${p.color}`}>{p.name}</div>
                  <div className="mb-1 font-mono text-[10px] text-ink-3">{p.desc}</div>
                  <div className="font-mono text-[11px] text-ink-2">
                    {p.amount} PRX · <span className="text-ink-3">{GENESIS_ADDRESSES[p.key].slice(0, 8)}…</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

function MyPoolCard({ pool, address, chain, router }: { pool: string; address: string; chain: any; router: any }) {
  const poolMeta = POOLS.find((p) => p.key === pool);
  if (!poolMeta) return null;

  const actionKey = `claim_genesis_${pool}` as keyof typeof ACTIONS;
  const action = ACTIONS[actionKey];

  const handleClick = () => {
    router.push(`/action/${actionKey}`);
  };

  return (
    <div className={`rounded-card border ${poolMeta.border} bg-surface-grad p-5`}>
      <div className="mb-3 flex items-center gap-2">
        <span className={`font-display text-[15px] font-bold ${poolMeta.color}`}>Your {poolMeta.name} Allocation</span>
      </div>
      <div className="mb-4 font-mono text-[10px] text-ink-3">
        {pool === "community" ? "Liquid — claim full remaining balance" : "Vested — claim newly available tokens each block"}
      </div>
      <button
        onClick={handleClick}
        className="w-full rounded-card bg-up py-3 font-display text-[13px] font-bold text-bg transition-all hover:bg-up/90"
      >
        Claim {poolMeta.name} Allocation
      </button>
    </div>
  );
}
