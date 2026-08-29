"use client";
import Link from "next/link";
import { useWallet } from "@/store/wallet";
import { useHeight } from "@/hooks/useHeight";

const PH10_CANARY = "PRAXIS-NEXT-PH10";

const REWARDS = [
  {
    key: "claim_resolver",
    icon: "◈",
    name: "Resolver",
    share: "20%",
    desc: "Transaction fees from markets you validated",
    color: "text-up",
  },
  {
    key: "claim_builder",
    icon: "◎",
    name: "Builder",
    share: "20%",
    desc: "Protocol development contributions",
    color: "text-bluex",
  },
  {
    key: "claim_community",
    icon: "◉",
    name: "Community",
    share: "20%",
    desc: "Community engagement and support",
    color: "text-amberx",
  },
  {
    key: "claim_investor",
    icon: "◆",
    name: "Investor",
    share: "20%",
    desc: "Early protocol investment returns",
    color: "text-pinkx",
  },
  {
    key: "claim_protocol",
    icon: "◐",
    name: "Protocol",
    share: "20%",
    desc: "Governance and treasury management",
    color: "text-cyanx",
  },
];

export default function RewardsPage() {
  const { praxisAddress } = useWallet();
  const { data: chain } = useHeight();
  const currentEpoch = chain?.height ? Math.floor(chain.height / 1000) : 0;

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2.5 font-mono text-[9px] uppercase tracking-[3px] text-up">
          <span className="inline-block h-px w-5 bg-up" /> Earn
        </div>
        <h1 className="font-display text-[22px] font-extrabold tracking-[-0.3px]">Claim Rewards</h1>
        <p className="mt-1 text-[13px] text-ink-2">
          5 reward pools (20% each) — claim per epoch (1,000 blocks ≈ 83 min)
        </p>
      </div>

      {!praxisAddress ? (
        <div className="rounded-card border border-line bg-surface p-6 text-center">
          <div className="font-mono text-[11px] text-ink-3">Connect wallet to claim rewards</div>
        </div>
      ) : (
        <>
          <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
            <div className="flex items-center gap-1.5 whitespace-nowrap rounded-card border border-line bg-surface px-2.5 py-1.5 font-mono text-[9px] text-ink-2">
              Current Epoch <b className="font-display text-[13px] font-bold text-up tabular-nums">#{currentEpoch}</b>
            </div>
            <div className="flex items-center gap-1.5 whitespace-nowrap rounded-card border border-line bg-surface px-2.5 py-1.5 font-mono text-[9px] text-ink-2">
              Block <b className="font-display text-[13px] font-bold text-ink tabular-nums">#{chain?.height ?? 0}</b>
            </div>
          </div>

          <div className="space-y-2">
            {REWARDS.map((r) => (
              <Link
                key={r.key}
                href={`/action/${r.key}`}
                className="flex items-center gap-3 rounded-card border border-line bg-surface px-3 py-3 transition-colors hover:border-up hover:bg-bg-2"
              >
                <div className={`flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full border border-line bg-bg-2 text-[18px] ${r.color}`}>
                  {r.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[13px] font-bold text-ink">{r.name}</span>
                    <span className="rounded border border-line bg-bg-2 px-1.5 py-0.5 font-mono text-[8px] text-ink-3">
                      {r.share}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-[9px] text-ink-3">{r.desc}</div>
                </div>
                <span className="font-mono text-[11px] text-up">→</span>
              </Link>
            ))}
          </div>

          <div className="mt-4 rounded-card border border-line bg-bg-2 p-3 font-mono text-[9px] text-ink-3">
            <div className="mb-1 text-ink-2">How rewards work:</div>
            <ul className="space-y-0.5">
              <li>• 1% creator fee + 1% resolver fee on every trade</li>
              <li>• Fees split 20% × 5 pools (resolver/builder/community/investor/protocol)</li>
              <li>• Epoch = 1,000 blocks ≈ 83 minutes at 5s/block</li>
              <li>• Claim for completed epochs (current - 1 or earlier)</li>
            </ul>
          </div>
        </>
      )}

      <span className="hidden" aria-hidden="true">{PH10_CANARY}</span>
    </main>
  );
}
