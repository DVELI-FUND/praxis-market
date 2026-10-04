import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/store/wallet";
import { useMarkets } from "@/hooks/useMarkets";
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
  shares: bigint;
  cost: bigint;
  amount: bigint | null; // signed uPRX delta when derivable from the log
  dir: "in" | "out" | "neutral";
}

const LABELS: Record<string, string> = {
  create_market: "Market created",
  submit_prediction: "Prediction",
  claim_winnings: "Claimed winnings",
  cancel_market: "Market cancelled",
  propose_outcome: "Outcome proposed",
  file_dispute: "Dispute filed",
  forfeit_position: "Position forfeited",
  reclaim_stake: "Stake reclaimed",
  claim_unbonded_stake: "Unbonded stake claimed",
};

const OUT = ["submit_prediction", "forfeit_position"];
const IN = ["claim_winnings", "reclaim_stake", "claim_unbonded_stake"];

async function fetchTxs(mid: string): Promise<any[]> {
  try {
    const res = await fetch(getPluginRPC() + `/v1/query/market-txs?market=${mid}&limit=200`);
    if (!res.ok) return [];
    const raw = await res.json();
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function normAddr(v: unknown): string {
  const s = String(v || "");
  if (!s) return "";
  try { return b64ToHex(s).toLowerCase(); } catch { return s.toLowerCase(); }
}

export function useWalletActivity() {
  const { praxisAddress } = useWallet();
  const { data: markets = [] } = useMarkets();

  const q = useQuery({
    queryKey: ["wallet-activity", praxisAddress, markets.length],
    queryFn: async (): Promise<ActivityItem[]> => {
      const addr = (praxisAddress || "").toLowerCase();
      if (!addr) return [];
      const list = markets.slice(0, 100);
      const per = await Promise.all(list.map((m) => fetchTxs(m.marketId)));
      const items: ActivityItem[] = [];
      per.forEach((txs, i) => {
        const m = list[i];
        for (const t of txs) {
          const actor = normAddr(t.sender || t.actor || t.address);
          if (actor !== addr) continue;
          const type: string = t.messageType || t.txType || t.type || "unknown";
          const shares = BigInt(t.shares ?? t.Shares ?? 0);
          const cost = BigInt(t.cost ?? t.Cost ?? 0);
          let amount: bigint | null = null;
          let dir: "in" | "out" | "neutral" = "neutral";
          if (OUT.some((k) => type.includes(k))) { dir = "out"; amount = cost > 0n ? -cost : shares > 0n ? -shares : null; }
          else if (IN.some((k) => type.includes(k))) { dir = "in"; amount = cost > 0n ? cost : shares > 0n ? shares : null; }
          items.push({
            key: `${t.txHash || t.tx_hash || ""}-${type}-${t.height}`,
            txHash: t.txHash || t.tx_hash || "",
            height: Number(t.height || 0),
            marketId: m.marketId,
            question: m.question || m.rules || "",
            type,
            label: LABELS[type] || type,
            shares,
            cost,
            amount,
            dir,
          });
        }
      });
      items.sort((a, b) => b.height - a.height);
      return items;
    },
    enabled: !!praxisAddress && markets.length > 0,
    staleTime: 30000,
    refetchInterval: 30000,
  });

  return { activity: q.data ?? [], isLoading: q.isLoading };
}
