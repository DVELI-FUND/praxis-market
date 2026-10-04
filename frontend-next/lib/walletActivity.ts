import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/store/wallet";
import { getPluginRPC } from "@/lib/rpc";
import { b64ToHex } from "@/lib/format";

export interface ActivityItem {
  key: string;
  txHash: string;
  height: number;
  marketId: string;
  question: string;
  type: string;
  label: string;
  amount: bigint | null;
  est: boolean; // true = computed estimate, not on-chain recorded
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

const BOND = 5_000_000_000n; // 5,000 PRX creator bond (refundable on cancel)
const FEE = 10_000n;         // 0.01 PRX tx fee

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
    queryKey: ["wallet-activity-v2", praxisAddress],
    queryFn: async (): Promise<ActivityItem[]> => {
      const addr = (praxisAddress || "").toLowerCase();
      if (!addr) return [];
      // Direct RPC: includes CANCELLED markets (useMarkets filters them out)
      const rawMarkets = await fetchJSON(getPluginRPC() + "/v1/query/markets");
      const list: any[] = Array.isArray(rawMarkets) ? rawMarkets : [];
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
          const shares = BigInt(t.shares ?? t.Shares ?? 0);
          let amount: bigint | null = null;
          let est = false;
          let dir: "in" | "out" | "neutral" = "neutral";
          if (type.includes("create_market")) {
            // on-chain truth arrives post-gate; until then estimate bond+seed+fee
            const seed = BigInt(inner.b0 ?? inner.b_zero ?? inner.seed ?? 0);
            amount = cost > 0n ? -cost : -(BOND + seed + FEE);
            est = cost === 0n;
            dir = "out";
          } else if (type.includes("cancel_market")) {
            amount = cost > 0n ? cost : null; // pre-gate refunds were never logged
            dir = "in";
          } else if (type.includes("submit_prediction")) {
            amount = cost > 0n ? -cost : shares > 0n ? -shares : null;
            dir = "out";
          } else if (type.includes("claim_winnings") || type.includes("reclaim")) {
            amount = cost > 0n ? cost : null;
            dir = "in";
          }
          items.push({
            key: `${t.txHash || t.tx_hash || ""}-${type}-${t.height}`,
            txHash: t.txHash || t.tx_hash || "",
            height: Number(t.height || 0),
            marketId: mid,
            question: inner.question || inner.rules || "",
            type,
            label: LABELS[type] || type,
            amount,
            est,
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
