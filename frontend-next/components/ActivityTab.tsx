"use client";
import { useState, useEffect, type ReactNode } from "react";
import { fetchMarketActivity, type Holder, type MarketActivity } from "@/lib/detail";
import { fmtPRX } from "@/lib/format";

const TYPE_ICON: Record<string, string> = {
  submit_prediction: "⚡",
  create_market: "◎",
  propose_outcome: "⚖",
  finalize_market: "✓",
  cancel_market: "✕",
  claim_winnings: "◈",
  forfeit_position: "↩",
  resolve_market: "⚑",
  file_dispute: "⚠",
};

const TYPE_COLOR: Record<string, string> = {
  submit_prediction: "text-up",
  create_market: "text-ink-2",
  propose_outcome: "text-amberx",
  finalize_market: "text-up",
  cancel_market: "text-down",
  claim_winnings: "text-up",
  forfeit_position: "text-down",
  resolve_market: "text-bluex",
  file_dispute: "text-down",
};

interface Props {
  mid: string;
  holders: Holder[];
  options?: string[];
}

export default function ActivityTab({ mid, holders, options = [] }: Props) {
  const [activities, setActivities] = useState<MarketActivity[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // The activity log is per-market (market-txs); it does not depend on there being holders.
    setLoading(true);
    fetchMarketActivity(mid, holders)
      .then(setActivities)
      .catch(() => setActivities([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mid, holders.length]);

  if (loading) {
    return (
      <div className="py-5 text-center font-mono text-[13px] text-ink-3">
        <span className="animate-pulseDot">▪ ▪ ▪</span>&nbsp;&nbsp;loading activity
      </div>
    );
  }

  if (!activities.length) {
    return <div className="py-5 text-center font-mono text-[13px] text-ink-3">No activity found</div>;
  }

  return (
    <div>
      {activities.map((tx, i) => {
        const icon = TYPE_ICON[tx.messageType] || "▪";
        const color = TYPE_COLOR[tx.messageType] || "text-ink-3";
        const shortSender = tx.sender ? tx.sender.slice(0, 8) + "…" + tx.sender.slice(-6) : "";

        let detail: ReactNode = "";
        if (tx.messageType === "submit_prediction") {
          const shares = tx.shares || 0n;
          const cost = tx.cost || 0n;
          const outcomeIdx = tx.outcomeIndex;
          // For N-outcome: show option name if available; for binary: YES/NO
          const label = options.length > 0 && outcomeIdx !== undefined
            ? (options[outcomeIdx] ?? `Option ${outcomeIdx + 1}`)
            : (tx.outcome ? "YES" : "NO");
          detail = `${label} · ${fmtPRX(shares)} shares`;
          if (cost > 0n) detail += ` · cost ${fmtPRX(cost)} PRX`;
        } else if (tx.messageType === "propose_outcome") {
          const isN = options.length > 0;
          const label = isN ? (options[tx.proposedIndex ?? 0] ?? `Option ${(tx.proposedIndex ?? 0) + 1}`) : tx.proposedOutcome ? "YES" : "NO";
          const side = isN || tx.proposedOutcome ? "text-up" : "text-down";
          detail = <>Proposed <span className={side}>{label}</span></>;
        } else if (tx.messageType === "file_dispute") {
          detail = "Proposal disputed";
        } else if (tx.messageType === "create_market") {
          detail = "Market created";
        } else if (tx.messageType === "finalize_market") {
          detail = "Market finalized";
        } else if (tx.messageType === "cancel_market") {
          detail = "Market cancelled";
        } else if (tx.messageType === "claim_winnings") {
          detail = "Claimed winnings";
        } else if (tx.messageType === "forfeit_position") {
          detail = "Position forfeited";
        }

        return (
          <div key={i} className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0">
            <div className={`mt-0.5 min-w-[18px] text-[16px] ${color}`}>{icon}</div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center justify-between">
                <span className={`font-mono text-[12px] uppercase tracking-[0.5px] ${color}`}>
                  {tx.messageType.replace(/_/g, " ")}
                </span>
                <span className="font-mono text-[11px] text-ink-3">blk #{tx.height}</span>
              </div>
              {shortSender && <div className="mb-0.5 font-mono text-[11px] text-ink-3">{shortSender}</div>}
              {detail && (
                <div className="font-mono text-[13px] text-ink-2">{detail}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
