"use client";
import { useMarketTxs } from "@/lib/txHistory";
import { fmtPRX } from "@/lib/format";

interface Props {
  mid: string;
}

export default function ActivityFeed({ mid }: Props) {
  const { data: txs = [] } = useMarketTxs(mid);
  const recent = [...txs].slice(0, 8);

  if (recent.length === 0) return null;

  return (
    <div className="rounded-card border border-line bg-surface-grad p-4 shadow-card">
      <div className="mb-3 border-b border-line pb-2 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">
        Recent Activity
      </div>
      <div className="space-y-2">
        {recent.map((tx, i) => {
          const isPredict = tx.messageType === "submit_prediction";
          const shares = BigInt(tx.transaction.msg.shares || tx.transaction.msg.amount || 0);
          const outcome = tx.transaction.msg.outcome;
          const addr = (tx.transaction.msg.bettorAddress || tx.sender || "").slice(0, 10);
          return (
            <div key={i} className="flex items-center justify-between font-mono text-[10px]">
              <span className="text-ink-3">{addr}…</span>
              <span className={isPredict ? (outcome ? "text-up" : "text-down") : "text-ink-2"}>
                {isPredict ? `bought ${outcome ? "YES" : "NO"}` : tx.messageType}
              </span>
              <span className="text-ink tabular-nums">{fmtPRX(shares)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
