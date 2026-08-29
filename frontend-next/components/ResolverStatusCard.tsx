"use client";
import Link from "next/link";
import { useMyResolver, MIN_RESOLVER_STAKE, UNBONDING_BLOCKS, PARTIAL_RRS_HIT } from "@/lib/resolvers";
import { useHeight } from "@/hooks/useHeight";
import { fmtPRX } from "@/lib/format";

const PH9_CANARY = "PRAXIS-NEXT-PH9";

export default function ResolverStatusCard() {
  const rec = useMyResolver();
  const { data: chain } = useHeight();
  if (!rec) return null;

  const h = chain?.height ?? 0;
  const released = rec.unbonding > 0n && h >= rec.releaseHeight;

  return (
    <div className="mb-3 rounded-card border border-line bg-bg-2 p-3 font-mono text-[10px]">
      <div className="mb-2 text-[9px] uppercase tracking-[2px] text-ink-3">// resolver_status</div>
      <div className="space-y-1 text-ink-2">
        <div className="flex justify-between">
          <span className="text-ink-3">Staked</span>
          <span className="text-up tabular-nums">{fmtPRX(rec.stake)} PRX</span>
        </div>
        {rec.unbonding > 0n && (
          <div className="flex justify-between">
            <span className="text-ink-3">Unbonding</span>
            <span className={`tabular-nums ${released ? "text-up" : "text-amberx"}`}>
              {fmtPRX(rec.unbonding)} PRX{" "}
              {released ? "— released, claim now" : `— releases #${rec.releaseHeight}`}
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-ink-3">RRS / status</span>
          <span>
            {rec.rrsScore} · {rec.active ? "active" : "inactive"}
          </span>
        </div>
      </div>

      {released && (
        <Link
          href="/action/claimunbonded"
          className="mt-2 block rounded-card bg-up py-2 text-center font-sans text-[11px] font-bold text-black transition-all hover:brightness-110"
        >
          ◎ Claim {fmtPRX(rec.unbonding)} PRX now
        </Link>
      )}

      <div className="mt-2 border-t border-line pt-2 text-[9px] leading-relaxed text-ink-3">
        min stake {fmtPRX(MIN_RESOLVER_STAKE)} PRX · partial unstake must leave ≥ min · partial =
        RRS −{PARTIAL_RRS_HIT} · full exit resets RRS · unbonding{" "}
        {UNBONDING_BLOCKS.toLocaleString()} blocks · one pending unbonding at a time
      </div>
      <span className="hidden" aria-hidden="true">{PH9_CANARY}</span>
    </div>
  );
}
