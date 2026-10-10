"use client";
import type { MarketDetail, DisputeContext } from "@/lib/detail";
import { extractOutcomes } from "@/lib/markets";
import { fmtPRX } from "@/lib/format";

interface Props {
  market: MarketDetail;
  disputeContext?: DisputeContext;
}

export default function InfoTab({ market, disputeContext }: Props) {
  const hasProposal = !!disputeContext?.proposal;
  const hasDispute = !!disputeContext?.dispute;
  const hasOutcome = !!disputeContext?.outcome;
  const isN = market.options.length > 0;
  const lbl = extractOutcomes(market.rules || "");
  const label = (yes: boolean, idx: number) => (isN ? market.options[idx] ?? `#${idx + 1}` : yes ? lbl.yes : lbl.no);

  return (
    <div className="space-y-3 p-4">
      <div>
        <div className="mb-1 font-mono text-[11px] uppercase tracking-[2px] text-ink-3">Market ID</div>
        <div className="font-mono text-[13px] text-ink">{market.marketId}</div>
      </div>
      <div>
        <div className="mb-1 font-mono text-[11px] uppercase tracking-[2px] text-ink-3">Creator</div>
        <div className="font-mono text-[13px] text-up">{market.creator}</div>
      </div>
      <div>
        <div className="mb-1 font-mono text-[11px] uppercase tracking-[2px] text-ink-3">Expiry Block</div>
        <div className="font-mono text-[13px] text-ink tabular-nums">#{market.expiry.toString()}</div>
      </div>
      {disputeContext?.proposal && (
        <div>
          <div className="mb-1 font-mono text-[11px] uppercase tracking-[2px] text-ink-3">Resolver</div>
          <div className="font-mono text-[13px] text-up">{disputeContext.proposal.resolverAddr}</div>
        </div>
      )}
      {disputeContext?.proposal && (
        <div>
          <div className="mb-1 font-mono text-[11px] uppercase tracking-[2px] text-ink-3">Proposed Outcome</div>
          <div className={`font-mono text-[13px] font-bold ${isN || disputeContext.proposal.proposedOutcome ? "text-up" : "text-down"}`}>
            {label(disputeContext.proposal.proposedOutcome, disputeContext.proposal.proposedIndex)}
          </div>
        </div>
      )}
      {disputeContext?.proposal && (
        <div>
          <div className="mb-1 font-mono text-[11px] uppercase tracking-[2px] text-ink-3">Proposal Bond</div>
          <div className="font-mono text-[13px] text-ink tabular-nums">{fmtPRX(disputeContext.proposal.proposalBond)} PRX · block #{disputeContext.proposal.proposalBlock.toLocaleString()}</div>
        </div>
      )}
      {hasDispute && disputeContext?.dispute && (
        <div className="rounded-card border border-down/30 bg-down-dim/40 p-3">
          <div className="mb-1 font-mono text-[11px] uppercase tracking-[2px] text-down">Dispute</div>
          <div className="space-y-1 font-mono text-[12px] text-ink-2">
            <div>Disputer <span className="text-ink">{disputeContext.dispute.disputerAddress}</span></div>
            <div>Bond <span className="text-ink tabular-nums">{fmtPRX(disputeContext.dispute.disputeBond)} PRX</span> · filed at block #{disputeContext.dispute.disputeBlock.toLocaleString()}</div>
            <div>Panel of {disputeContext.dispute.panelSize || disputeContext.dispute.panelMembers.length} resolvers</div>
            {disputeContext.dispute.panelMembers.map((a) => (
              <div key={a} className="truncate text-[11px] text-ink-3">{a}</div>
            ))}
          </div>
        </div>
      )}
      {hasOutcome && disputeContext?.outcome && (
        <div>
          <div className="mb-1 font-mono text-[11px] uppercase tracking-[2px] text-ink-3">Final Outcome</div>
          <div className="font-mono text-[13px] font-bold text-up">{label(disputeContext.outcome.winningOutcome, disputeContext.outcome.winningIndex)}</div>
        </div>
      )}
      {disputeContext?.disputeWindow?.open && (
        <div>
          <div className="mb-1 font-mono text-[11px] uppercase tracking-[2px] text-ink-3">Dispute Window</div>
          <div className="font-mono text-[13px] text-amberx">
            Open until block #{disputeContext.disputeWindow.deadlineBlock}
          </div>
        </div>
      )}
      {market.rules && (
        <div className="border-t border-line pt-3">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-[2px] text-ink-3">Resolution Criteria</div>
          <div className="rounded-card border border-line bg-bg-2 p-3 font-mono text-[13px] leading-[1.7] whitespace-pre-wrap text-ink-2">
            {market.rules.replace(/\[(?:CAT|IMG|OUT):[^\]]*\]\s*/g, "").trim()}
          </div>
        </div>
      )}
    </div>
  );
}
