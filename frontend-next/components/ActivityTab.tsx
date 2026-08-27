"use client";
import { useState, useEffect } from "react";
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
};

interface Props {
  mid: string;
  holders: Holder[];
}

export default function ActivityTab({ mid, holders }: Props) {
  const [activities, setActivities] = useState<MarketActivity[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!holders.length) return;
    setLoading(true);
    fetchMarketActivity(mid, holders)
      .then(setActivities)
      .catch(() => setActivities([]))
      .finally(() => setLoading(false));
  }, [mid, holders]);

  if (loading) {
    return (
      <div className="py-5 text-center font-mono text-[11px] text-ink-3">
        <span className="animate-pulseDot">▪ ▪ ▪</span>&nbsp;&nbsp;loading activity
      </div>
    );
  }

  if (!activities.length) {
    return <div className="py-5 text-center font-mono text-[11px] text-ink-3">No activity found</div>;
  }

  return (
    <div>
      {activities.map((tx, i) => {
        const icon = TYPE_ICON[tx.messageType] || "▪";
        const color = TYPE_COLOR[tx.messageType] || "text-ink-3";
        const shortSender = tx.sender ? tx.sender.slice(0, 8) + "…" + tx.sender.slice(-6) : "";

        let detail = "";
        if (tx.messageType === "submit_prediction") {
          const side = tx.outcome ? "text-up" : "text-down";
          const label = tx.outcome ? "YES" : "NO";
          const amt = fmtPRX(tx.shares || 0n);
          detail = `<span class="${side} font-bold">${label}</span> &nbsp;${amt} PRX`;
        } else if (tx.messageType === "propose_outcome") {
          const side = tx.proposedOutcome ? "text-up" : "text-down";
          const label = tx.proposedOutcome ? "YES" : "NO";
          detail = `Proposed <span class="${side}">${label}</span>`;
        } else if (tx.messageType === "create_market") {
          const b0 = fmtPRX(tx.b0 || 0n);
          detail = `Market created · B0 ${b0} PRX`;
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
            <div className={`mt-0.5 min-w-[18px] text-[15px] ${color}`}>{icon}</div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center justify-between">
                <span className={`font-mono text-[10px] uppercase tracking-[0.5px] ${color}`}>
                  {tx.messageType.replace(/_/g, " ")}
                </span>
                <span className="font-mono text-[9px] text-ink-3">blk #{tx.height}</span>
              </div>
              {shortSender && <div className="mb-0.5 font-mono text-[9px] text-ink-3">{shortSender}</div>}
              {detail && (
                <div className="font-mono text-[11px] text-ink-2" dangerouslySetInnerHTML={{ __html: detail }} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
