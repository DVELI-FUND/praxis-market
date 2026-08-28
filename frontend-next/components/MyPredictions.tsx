"use client";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/store/wallet";
import { useMarkets } from "@/hooks/useMarkets";
import { rpc } from "@/lib/rpc";
import { b64ToHex, fmtPRX } from "@/lib/format";

const PH7_CANARY = "PRAXIS-NEXT-PH7";

interface TxRow {
  sender?: string;
  recipient?: string;
  messageType?: string;
  height?: number;
  txHash?: string;
  transaction?: { type?: string; msg?: Record<string, unknown> };
}

async function fetchTxs(address: string): Promise<TxRow[]> {
  const d = await rpc<{ results?: TxRow[] }>("/v1/query/txs-by-sender", {
    address,
    perPage: 50,
  });
  return d.results || [];
}

const ICONS: Record<string, string> = {
  submit_prediction: "⚡",
  send: "→",
  register_resolver: "◈",
  unstake_resolver: "↓",
  claim_winnings: "◎",
  propose_outcome: "⚖",
  file_dispute: "⚠",
  create_market: "◎",
  forfeit_position: "↩",
  claim_unbonded_stake: "◎",
};

function amt(v: unknown): string {
  try {
    return fmtPRX(BigInt(String(v ?? 0)));
  } catch {
    return "0";
  }
}

export default function MyPredictions() {
  const praxisAddress = useWallet((s) => s.praxisAddress);
  const { data: markets = [] } = useMarkets();
  const { data: txs = [] } = useQuery({
    queryKey: ["txs-by-sender", praxisAddress],
    queryFn: () => fetchTxs(praxisAddress as string),
    enabled: !!praxisAddress,
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const detail = (tx: TxRow): string => {
    const msg = (tx.transaction?.msg || {}) as Record<string, unknown>;
    switch (tx.messageType) {
      case "submit_prediction": {
        const mid = b64ToHex(String(msg.marketId || msg.market_id || ""));
        const m = markets.find((x) => x.marketId === mid);
        const side = msg.outcome === true ? "YES" : "NO";
        const q = m
          ? m.question.slice(0, 32) + (m.question.length > 32 ? "…" : "")
          : mid.slice(0, 12) + "…";
        return `${side} · ${amt(msg.shares ?? msg.amount)} PRX · ${q}`;
      }
      case "send":
        return `${amt(msg.amount)} PRX → ${String(msg.toAddress || "").slice(0, 10)}…`;
      case "register_resolver":
        return `Staked ${amt(msg.stakeAmount)} PRX`;
      case "unstake_resolver":
        return `Unstaked ${amt(msg.amount)} PRX`;
      case "propose_outcome":
        return `Proposed ${msg.proposedOutcome === true ? "YES" : "NO"}`;
      case "claim_winnings":
        return `Claimed on ${String(msg.marketId || "").slice(0, 12)}…`;
      default:
        return tx.messageType || "";
    }
  };

  return (
    <section
      className="mb-3.5 animate-fadeUp rounded-card border border-line bg-surface p-4"
      style={{ animationDelay: "150ms" }}
    >
      <div className="mb-4 border-b border-line pb-2.5 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">
        // my_predictions
      </div>
      {!praxisAddress ? (
        <div className="font-mono text-[10px] text-ink-3">Load wallet to see predictions</div>
      ) : txs.length === 0 ? (
        <div className="font-mono text-[10px] text-ink-3">No transactions yet</div>
      ) : (
        <div className="space-y-1.5">
          {txs.slice(0, 10).map((tx) => (
            <div key={tx.txHash} className="rounded-card border border-line bg-bg-2 px-2.5 py-2">
              <div className="flex items-center justify-between font-mono text-[9px]">
                <span className="uppercase tracking-[0.5px] text-ink-2">
                  {ICONS[tx.messageType || ""] || "▪"} {(tx.messageType || "unknown").replace(/_/g, " ")}
                </span>
                <span className="text-ink-3">#{tx.height}</span>
              </div>
              <div className="mt-0.5 truncate font-mono text-[10px] text-ink-2">{detail(tx)}</div>
            </div>
          ))}
        </div>
      )}
      <span className="hidden" aria-hidden="true">{PH7_CANARY}</span>
    </section>
  );
}
