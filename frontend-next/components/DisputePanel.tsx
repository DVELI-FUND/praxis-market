"use client";
import type { MarketDetail } from "@/lib/detail";

interface DisputeContext {
  status?: number; // 0: Open, 1: Disputed, 2: Tallying, 3: Finalized
  panelSize?: number;
  votesCommitted?: number;
  votesRevealed?: number;
  disputeBlock?: number;
  commitDeadline?: number;
  revealDeadline?: number;
}

interface Props {
  market: MarketDetail;
  dispute?: DisputeContext;
  currentHeight?: number;
}

export default function DisputePanel({ market, dispute, currentHeight = 0 }: Props) {
  // Only show if market is actually disputed (Status 5 in constants.go)
  if ((market.status !== 4 && market.status !== 5) || !dispute) return null;

  const phase = dispute.status || 0;
  const totalVotes = dispute.votesRevealed || 0;
  const quorum = Math.floor((dispute.panelSize || 3) / 2) + 1;

  return (
    <div className="mb-4 overflow-hidden rounded-card border border-amberx/40 bg-amberx/5 shadow-card">
      {/* Header Banner */}
      <div className="flex items-center gap-3 border-b border-amberx/20 bg-amberx/10 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amberx/20 text-amberx">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div>
          <h3 className="font-display text-[14px] font-bold text-amberx">Market Under Dispute</h3>
          <p className="font-mono text-[11px] text-ink-2">Resolution is being challenged by a bonded disputer.</p>
        </div>
      </div>

      {/* Timeline & Phases */}
      <div className="px-4 py-4">
        <div className="mb-3 font-mono text-[11px] uppercase tracking-wider text-ink-3">Dispute Timeline</div>
        <div className="relative flex items-center justify-between">
          {/* Connecting Line */}
          <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-line" />
          <div className="absolute left-0 top-1/2 h-0.5 -translate-y-1/2 bg-amberx transition-all duration-500" 
               style={{ width: `${(phase / 3) * 100}%` }} />
          
          {/* Phase Dots */}
          {[
            { label: "Disputed", active: phase >= 1 },
            { label: "Voting", active: phase >= 2 },
            { label: "Tally", active: phase >= 3 },
          ].map((p, i) => (
            <div key={i} className="relative z-10 flex flex-col items-center gap-1.5 bg-surface px-2">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full border-2 font-mono text-[10px] font-bold transition-colors ${
                p.active ? "border-amberx bg-amberx text-black" : "border-line bg-surface text-ink-3"
              }`}>
                {i + 1}
              </div>
              <span className={`font-mono text-[10px] ${p.active ? "text-amberx" : "text-ink-3"}`}>{p.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Panel Stats */}
      <div className="grid grid-cols-3 gap-2 border-t border-line px-4 py-3">
        <div className="text-center">
          <div className="font-display text-[16px] font-bold text-ink">{dispute.panelSize || 0}</div>
          <div className="font-mono text-[10px] uppercase text-ink-3">Panel Size</div>
        </div>
        <div className="text-center">
          <div className="font-display text-[16px] font-bold text-up">{totalVotes}</div>
          <div className="font-mono text-[10px] uppercase text-ink-3">Votes Revealed</div>
        </div>
        <div className="text-center">
          <div className="font-display text-[16px] font-bold text-amberx">{quorum}</div>
          <div className="font-mono text-[10px] uppercase text-ink-3">Quorum Needed</div>
        </div>
      </div>

      {/* Resolver Restriction Notice */}
      <div className="border-t border-line bg-surface-grad p-3 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-amberx/30 bg-amberx/5 px-3 py-1">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amberx" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-amberx">Resolver Voting Access Only</span>
        </div>
        <p className="mt-2 font-mono text-[11px] text-ink-3">Only registered resolvers on the selected panel may cast votes.</p>
      </div>

      {/* Action Area for Panel Members */}
      {phase === 2 && (
        <div className="border-t border-line bg-surface-grad p-4 text-center">
          <p className="mb-3 font-mono text-[12px] text-ink-2">
            {currentHeight < (dispute.commitDeadline || 0) 
              ? "Commit Phase Active: Submit your hashed vote." 
              : "Reveal Phase Active: Reveal your vote to the chain."}
          </p>
          <button className="w-full rounded-card border-2 border-amberx bg-amberx px-4 py-3 font-mono text-[13px] font-bold text-black transition-all hover:bg-amberx/90">
            Open Resolver Voting Interface
          </button>
        </div>
      )}
    </div>
  );
}
