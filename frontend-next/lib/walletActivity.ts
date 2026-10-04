import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/store/wallet";
import { useMarkets } from "@/hooks/useMarkets";
import { usePositions } from "@/lib/positions";
import { getPluginRPC } from "@/lib/rpc";

export interface ActivityItem {
  txHash: string;
  height: number;
  marketId: string;
  question: string;
  type: string;
  amount: bigint;
  timestamp: number;
}

async function fetchMarketTxs(mid: string) {
  try {
    const url = getPluginRPC() + `/v1/query/market-txs?market=${encodeURIComponent(mid)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const raw = await res.json();
    if (!Array.isArray(raw)) return [];
    return raw;
  } catch {
    return [];
  }
}

export function useWalletActivity() {
  const { praxisAddress } = useWallet();
  const { data: markets = [] } = useMarkets();
  const { data: positions = [] } = usePositions();

  const { data: activity = [], isLoading } = useQuery({
    queryKey: ["wallet-activity", praxisAddress],
    queryFn: async () => {
      if (!praxisAddress) return [];
      
      const positionMarketIds = new Set(positions.map(p => p.marketId));
      const createdMarkets = markets.filter(m => m.creator === praxisAddress);
      createdMarkets.forEach(m => positionMarketIds.add(m.marketId));
      
      const allTxs: ActivityItem[] = [];
      const marketIds = Array.from(positionMarketIds).slice(0, 50);
      
      const txResults = await Promise.all(
        marketIds.map(mid => fetchMarketTxs(mid))
      );
      
      txResults.forEach((txs, idx) => {
        const mid = marketIds[idx];
        const market = markets.find(m => m.marketId === mid);
        const question = market?.question || "Unknown Market";
        
        txs.forEach((tx: any) => {
          const sender = tx.sender || tx.transaction?.msg?.bettorAddress;
          if (sender && sender.toLowerCase() === praxisAddress.toLowerCase()) {
            const type = tx.messageType || tx.transaction?.type || "unknown";
            let amount = 0n;
            
            if (type.includes("create")) {
              amount = -BigInt(tx.transaction?.msg?.bond || 0) - BigInt(tx.transaction?.msg?.b0 || 0);
            } else if (type.includes("predict") || type.includes("submit")) {
              amount = -BigInt(tx.transaction?.msg?.cost || 0);
            } else if (type.includes("claim")) {
              amount = BigInt(tx.transaction?.msg?.payout || tx.transaction?.msg?.amount || 0);
            } else if (type.includes("cancel")) {
              amount = BigInt(tx.transaction?.msg?.refund || 0);
            }
            
            allTxs.push({
              txHash: tx.txHash || tx.tx_hash || "",
              height: tx.height || 0,
              marketId: mid,
              question,
              type: type.replace("Message", "").replace("message_", ""),
              amount,
              timestamp: Date.now() - (100000 - tx.height) * 5000,
            });
          }
        });
      });
      
      allTxs.sort((a, b) => b.height - a.height);
      return allTxs;
    },
    enabled: !!praxisAddress,
    staleTime: 30000,
  });

  return { activity, isLoading };
}
