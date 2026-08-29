"use client";
import Link from "next/link";
import { useWallet } from "@/store/wallet";
import { useHeight } from "@/hooks/useHeight";
import { useMyResolver } from "@/lib/resolvers";

const PH11_CANARY = "PRAXIS-NEXT-PH11";

const POOLS = [
  { key: "claim_resolver", icon: "◈", name: "Resolver", share: "20%", desc: "Fees from markets you validated", color: "text-up", border: "border-up/30" },
  { key: "claim_builder", icon: "◎", name: "Builder", share: "20%", desc: "Protocol development", color: "text-bluex", border: "border-bluex/30" },
  { key: "claim_community", icon: "◉", name: "Community", share: "20%", desc: "Community contributions", color: "text-amberx", border: "border-amberx/30" },
  { key: "claim_investor", icon: "◆", name: "Investor", share: "20%", desc: "Early investment returns", color: "text-pinkx", border: "border-pinkx/30" },
  { key: "claim_protocol", icon: "◐", name: "Protocol", share: "20%", desc: "Governance & treasury", color: "text-cyanx", border: "border-cyanx/30" },
];

function tierOf(rrs: number) {
  if (rrs >= 100) return { label: "Gold", cls: "border-amberx/40 bg-amberx/10 text-amberx", weight: 3 };
  if (rrs >= 50) return { label: "Silver", cls: "border-line-2 bg-surface-2 text-ink-2", weight: 2 };
  return { label: "Bronze", cls: "border-[#cd7f32]/40 bg-[#cd7f32]/10 text-[#cd7f32]", weight: 1 };
}

function EpochHistory({ current }: { current: number }) {
  const rows = [];
  for (let i = Math.max(0, current - 4); i <= current; i++) {
    const isCurrent = i === current;
    rows.push(
      <tr key={i} className="border-t border-line">
        <td className="py-1 pr-2 font-mono text-[9px] text-ink-2">#{i}</td>
        <td className="py-1 pr-2 font-mono text-[9px] text-ink-3">{isCurrent ? "In progress" : "—"}</td>
        <td className={`py-1 text-right font-mono text-[9px] ${isCurrent ? "text-up" : "text-ink-3"}`}>
          {isCurrent ? "Current" : "Claimable"}
        </td>
      </tr>
    );
  }
  return (
    <table className="w-full">
      <tbody>{rows}</tbody>
    </table>
  );
}

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
          {/* header chips */}
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

          {/* pool cards */}
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {POOLS.map((p) => (
              <div key={p.key} className={`rounded-card border ${p.border} bg-surface p-3`}>
                <div className="mb-2 flex items-center gap-2">
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
                </div>

                <div className="mb-2 rounded-card border border-line bg-bg-2 px-2 py-1">
                  <EpochHistory current={currentEpoch} />
                </div>

                <Link
                  href={`/action/${p.key}`}
                  className="block rounded-card bg-up py-2 text-center font-sans text-[11px] font-bold text-black transition-all hover:brightness-110"
                >
                  ⚡ Claim {p.name}
                </Link>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-card border border-line bg-bg-2 p-3 font-mono text-[9px] text-ink-3">
            <div className="mb-1 text-ink-2">How rewards work:</div>
            <ul className="space-y-0.5">
              <li>• 1% creator fee + 1% resolver fee on every trade</li>
              <li>• Fees split 20% × 5 pools (resolver / builder / community / investor / protocol)</li>
              <li>• Epoch = 1,000 blocks ≈ 83 min at 5s/block</li>
              <li>• Resolver share weighted by RRS tier (Bronze 1× / Silver 2× / Gold 3×)</li>
              <li>• Claim for completed epochs (current − 1 or earlier)</li>
            </ul>
          </div>
        </>
      )}

      <span className="hidden" aria-hidden="true">{PH11_CANARY}</span>
    </main>
  );
}
