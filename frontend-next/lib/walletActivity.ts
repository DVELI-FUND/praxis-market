import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/store/wallet";
import { getPluginRPC } from "@/lib/rpc";
import { b64ToHex } from "@/lib/format";
import { isHiddenMarket } from "@/lib/hiddenMarkets";

export interface ActivityItem {
  key: string;
  txHash: string;
  height: number;
  marketId: string;
  question: string;
  type: string;
  label: string;
  shares: bigint;
  amount: bigint | null; // ONLY on-chain recorded PRX. null = never recorded → show "—"
  dir: "in" | "out" | "neutral";
}

const LABELS: Record<string, string> = {
  create_market: "Market created",
  submit_prediction: "Prediction",
  claim_winnings: "Claimed winnings",
  cancel_market: "Market cancelled",
  propose_outcome: "Outcome proposed",
  finalize_market: "Market finalized",
  file_dispute: "Dispute filed",
  forfeit_position: "Position forfeited",
};

async function fetchJSON(url: string): Promise<any> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function normAddr(v: unknown): string {
  const s = String(v || "");
  if (!s) return "";
  try { return b64ToHex(s).toLowerCase(); } catch { return s.toLowerCase(); }
}

export function useWalletActivity() {
  const { praxisAddress } = useWallet();

  const q = useQuery({
    queryKey: ["wallet-activity-v3", praxisAddress],
    queryFn: async (): Promise<ActivityItem[]> => {
      const addr = (praxisAddress || "").toLowerCase();
      if (!addr) return [];
      const rawMarkets = await fetchJSON(getPluginRPC() + "/v1/query/markets");
      const list: any[] = (Array.isArray(rawMarkets) ? rawMarkets : []).filter((m: any) => !isHiddenMarket(m.id || m.marketId));
      const per = await Promise.all(
        list.slice(0, 150).map((m) => fetchJSON(getPluginRPC() + `/v1/query/market-txs?market=${m.id || m.marketId}&limit=200`))
      );
      const items: ActivityItem[] = [];
      per.forEach((txs, i) => {
        const mk = list[i];
        const mid = mk.id || mk.marketId;
        const inner = mk.market || mk;
        if (!Array.isArray(txs)) return;
        for (const t of txs) {
          const actor = normAddr(t.sender || t.actor || t.address);
          if (actor !== addr) continue;
          const type: string = t.messageType || t.txType || t.type || "unknown";
          const cost = BigInt(t.cost ?? t.Cost ?? 0);
          const shares = BigInt(t.shares ?? t.Shares ?? t.transaction?.msg?.shares ?? 0); // plugin logs shares inside transaction.msg
          // TRUTH ONLY: amount comes from the on-chain log's cost field.
          // Entries written before the amount-logging upgrade have cost=0 → null → "—".
          let amount: bigint | null = null;
          let dir: "in" | "out" | "neutral" = "neutral";
          if (type.includes("create_market")) { dir = "out"; amount = cost > 0n ? -cost : null; }
          else if (type.includes("cancel_market")) { dir = "in"; amount = cost > 0n ? cost : null; }
          else if (type.includes("submit_prediction")) { dir = "out"; amount = cost > 0n ? -cost : null; }
          else if (type.includes("claim_winnings") || type.includes("reclaim")) { dir = "in"; amount = cost > 0n ? cost : null; }
          if (amount === null) dir = "neutral"; // never imply money moved when nothing was recorded
          items.push({
            key: `${mid}-${t.txHash || t.tx_hash || ""}-${type}-${t.height}-${items.length}`,
            txHash: t.txHash || t.tx_hash || "",
            height: Number(t.height || 0),
            marketId: mid,
            question: inner.question || inner.rules || "",
            type,
            label: LABELS[type] || type,
            shares,
            amount,
            dir,
          });
        }
      });
      items.sort((a, b) => b.height - a.height);
      return items;
    },
    enabled: !!praxisAddress,
    staleTime: 30000,
    refetchInterval: 30000,
  });

  return { activity: q.data ?? [], isLoading: q.isLoading };
}
