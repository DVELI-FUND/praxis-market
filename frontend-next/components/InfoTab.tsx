"use client";
import type { MarketDetail, DisputeContext } from "@/lib/detail";

interface Props {
  market: MarketDetail;
  disputeContext?: DisputeContext;
}

export default function InfoTab({ market, disputeContext }: Props) {
  const hasProposal = !!disputeContext?.proposal;
  const hasDispute = !!disputeContext?.dispute;
  const hasOutcome = !!disputeContext?.outcome;

  return (
    <div className="space-y-3 p-4">
      <div>
        <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">Market ID</div>
        <div className="font-mono text-[11px] text-ink">{market.marketId}</div>
      </div>
      <div>
        <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">Creator</div>
        <div className="font-mono text-[11px] text-up">{market.creator}</div>
      </div>
      <div>
        <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">Expiry Block</div>
        <div className="font-mono text-[11px] text-ink tabular-nums">#{market.expiry.toString()}</div>
      </div>
      {disputeContext?.proposal && (
        <div>
          <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">Resolver</div>
          <div className="font-mono text-[11px] text-up">{disputeContext.proposal.resolverAddr}</div>
        </div>
      )}
      {disputeContext?.disputeWindow?.open && (
        <div>
          <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">Dispute Window</div>
          <div className="font-mono text-[11px] text-amberx">
            Open until block #{disputeContext.disputeWindow.deadlineBlock}
          </div>
        </div>
      )}
      {market.rules && (
        <div className="border-t border-line pt-3">
          <div className="mb-2 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">Resolution Criteria</div>
          <div className="rounded-card border border-line bg-bg-2 p-3 font-mono text-[11px] leading-[1.7] whitespace-pre-wrap text-ink-2">
            {market.rules}
          </div>
        </div>
      )}
    </div>
  );
}
