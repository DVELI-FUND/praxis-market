"use client";
import type { Resolver } from "@/lib/resolvers";
import { MIN_RESOLVER_STAKE, UNBONDING_BLOCKS } from "@/lib/resolvers";
import { fmtPRX } from "@/lib/format";

interface Props {
  rec: Resolver;
  amount: number;
  onAmount: (n: number) => void;
  currentHeight: number;
}

export default function UnstakePlanner({ rec, amount, onAmount, currentHeight }: Props) {
  const stakePRX = Number(rec.stake / 1000000n);
  const amtU = BigInt(Math.floor(amount)) * 1000000n;
  const fullExit = amount === 0 || amtU >= rec.stake;
  const unstakeAmt = fullExit ? rec.stake : amtU;
  const remaining = rec.stake - unstakeAmt;
  const minOk = fullExit || remaining >= MIN_RESOLVER_STAKE;
  const releaseAt = currentHeight + UNBONDING_BLOCKS;

  const checks: { ok: boolean; label: string }[] = [
    {
      ok: rec.active,
      label: rec.active ? "Resolver active" : "Resolver inactive — register to stake again",
    },
    {
      ok: rec.unbonding === 0n,
      label:
        rec.unbonding === 0n
          ? "No pending unbonding"
          : "Pending unbonding must be claimed first (one at a time)",
    },
    {
      ok: minOk,
      label: minOk
        ? "Satisfies 500k minimum-remaining rule"
        : `Partial unstake must leave ≥ ${fmtPRX(MIN_RESOLVER_STAKE)} PRX staked`,
    },
  ];

  return (
    <div className="mb-3 rounded-card border border-line bg-bg-2 p-3 font-mono text-[10px]">
      <div className="mb-2 text-[9px] uppercase tracking-[2px] text-ink-3">// unstake_planner</div>

      <input
        type="range"
        min={0}
        max={Math.max(stakePRX, 1)}
        step={1}
        value={Math.min(amount, stakePRX)}
        onChange={(e) => onAmount(parseInt(e.target.value) || 0)}
        className="w-full accent-[#00e87a]"
      />
      <div className="mt-1.5 grid grid-cols-4 gap-1.5">
        {[25, 50, 75].map((p) => (
          <button
            key={p}
            onClick={() => onAmount(Math.floor((stakePRX * p) / 100))}
            className="rounded-card border border-line px-1 py-1 text-[9px] text-ink-2 transition-colors hover:border-up hover:text-up"
          >
            {p}%
          </button>
        ))}
        <button
          onClick={() => onAmount(0)}
          className="rounded-card border border-line px-1 py-1 text-[9px] text-ink-2 transition-colors hover:border-amberx hover:text-amberx"
        >
          Full exit
        </button>
      </div>

      <div className="mt-2 space-y-1 text-ink-2">
        <div className="flex justify-between">
          <span className="text-ink-3">Mode</span>
          <span className={fullExit ? "text-amberx" : "text-up"}>
            {amount === 0 ? "Full exit (0)" : fullExit ? "Full exit (≥ stake)" : "Partial"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-3">Unstake amount</span>
          <span className="tabular-nums">{fmtPRX(unstakeAmt)} PRX</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-3">Remaining stake</span>
          <span className={`tabular-nums ${minOk ? "text-ink-2" : "text-down"}`}>
            {fmtPRX(remaining > 0n ? remaining : 0n)} PRX
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-3">RRS impact</span>
          <span>{fullExit ? "reset to 10 · inactive" : "−10 (floor 0)"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-3">Tokens release at</span>
          <span className="tabular-nums">#{releaseAt.toLocaleString()} (~7 days)</span>
        </div>
      </div>

      <div className="mt-2 space-y-1 border-t border-line pt-2">
        {checks.map((c, i) => (
          <div key={i} className={`flex items-start gap-1.5 ${c.ok ? "text-ink-3" : "text-down"}`}>
            <span>{c.ok ? "✓" : "✗"}</span>
            <span>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
