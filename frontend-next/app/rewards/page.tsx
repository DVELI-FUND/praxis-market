"use client";
import Link from "next/link";
import { useWallet } from "@/store/wallet";
import { useHeight } from "@/hooks/useHeight";
import { useMyResolver, tierOf } from "@/lib/resolvers";

const PH12_CANARY = "PRAXIS-NEXT-PH12";

const POOLS: { pool: string; icon: string; name: string; share: string; desc: string; color: string; border: string }[] = [
  { pool: "resolver", icon: "◈", name: "Resolver", share: "20%", desc: "Fees from markets you validated", color: "text-up", border: "border-up/30" },
  { pool: "builder", icon: "◎", name: "Builder", share: "20%", desc: "Protocol development", color: "text-bluex", border: "border-bluex/30" },
  { pool: "community", icon: "◉", name: "Community", share: "20%", desc: "Community contributions", color: "text-amberx", border: "border-amberx/30" },
  { pool: "investor", icon: "◆", name: "Investor", share: "20%", desc: "Early investment returns", color: "text-pinkx", border: "border-pinkx/30" },
  { pool: "protocol", icon: "◐", name: "Protocol", share: "20%", desc: "Governance & treasury", color: "text-cyanx", border: "border-cyanx/30" },
];

export default function RewardsPage() {
  const { praxisAddress } = useWallet();
  const { data: chain } = useHeight();
  const myResolver = useMyResolver();
  const currentEpoch = chain?.height ? Math.floor(chain.height / 1000) : 0;

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2.5 font-mono text-[9px] uppercase tracking-[3px] text-up">
          <span className="inline-block h-px w-5 bg-up" /> Earn
        </div>
        <h1 className="font-display text-[22px] font-extrabold tracking-[-0.3px]">Claim Rewards</h1>
        <p className="mt-1 text-[13px] text-ink-2">5 pools × 20% of fees — claim per completed epoch</p>
      </div>

      {!praxisAddress ? (
        <div className="rounded-card border border-line bg-surface p-6 text-center font-mono text-[11px] text-ink-3">
          Connect wallet to claim rewards
        </div>
      ) : (
        <>
          <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
            <div className="flex items-center gap-1.5 whitespace-nowrap rounded-card border border-line bg-surface px-2.5 py-1.5 font-mono text-[9px] text-ink-2">
              Epoch <b className="font-display text-[13px] font-bold text-up tabular-nums">#{currentEpoch}</b>
            </div>
            <div className="flex items-center gap-1.5 whitespace-nowrap rounded-card border border-line bg-surface px-2.5 py-1.5 font-mono text-[9px] text-ink-2">
              Block <b className="font-display text-[13px] font-bold text-ink tabular-nums">#{chain?.height ?? 0}</b>
            </div>
            {myResolver && (
              <div className={`flex items-center gap-1.5 whitespace-nowrap rounded-card border px-2.5 py-1.5 font-mono text-[9px] ${tierOf(myResolver.rrsScore).cls}`}>
                {tierOf(myResolver.rrsScore).label} · RRS {myResolver.rrsScore} · {tierOf(myResolver.rrsScore).weight}× weight
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {POOLS.map((p) => (
              <Link
                key={p.pool}
                href={`/rewards/${p.pool}`}
                className={`rounded-card border ${p.border} bg-surface p-3 transition-colors hover:bg-bg-2`}
              >
                <div className="flex items-center gap-2">
                  <div className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-line bg-bg-2 text-[15px] ${p.color}`}>
                    {p.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-[13px] font-bold text-ink">{p.name}</span>
                      <span className="rounded border border-line bg-bg-2 px-1.5 py-0.5 font-mono text-[8px] text-ink-3">{p.share}</span>
                    </div>
                    <div className="mt-0.5 font-mono text-[9px] text-ink-3">{p.desc}</div>
                  </div>
                  <span className="font-mono text-[11px] text-up">→</span>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-4 rounded-card border border-line bg-bg-2 p-3 font-mono text-[9px] text-ink-3">
            <div className="mb-1 text-ink-2">How rewards work:</div>
            <ul className="space-y-0.5">
              <li>• 1% creator fee + 1% resolver fee on every trade</li>
              <li>• Fees split 20% × 5 pools (resolver / builder / community / investor / protocol)</li>
              <li>• Epoch = 1,000 blocks ≈ 83 min at 5s/block</li>
              <li>• Resolver share = pool × (resolutions × weight) / Σ weighted — 1× / 3× / 7× tiers</li>
              <li>• Only past epochs are claimable (current epoch not yet snapshotted)</li>
            </ul>
          </div>
        </>
      )}

      <span className="hidden" aria-hidden="true">{PH12_CANARY}</span>
    </main>
  );
}
