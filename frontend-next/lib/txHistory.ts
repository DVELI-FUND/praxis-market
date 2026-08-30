import { useQuery } from "@tanstack/react-query";
import { getPluginRPC } from "@/lib/rpc";

export interface MarketTx {
  sender: string;
  messageType: string;
  height: number;
  txHash: string;
  transaction: {
    type: string;
    msg: {
      marketId?: string;
      bettorAddress?: string;
      outcome?: boolean;
      shares?: string | number;
      amount?: string | number;
    };
  };
}

async function fetchMarketTxs(mid: string): Promise<MarketTx[]> {
  try {
    const url = getPluginRPC() + `/v1/query/market-txs?market=${encodeURIComponent(mid)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const raw = await res.json();
    if (!Array.isArray(raw)) return [];
    return raw as MarketTx[];
  } catch {
    return [];
  }
}

export function useMarketTxs(mid: string) {
  return useQuery({
    queryKey: ["market-txs", mid],
    queryFn: () => fetchMarketTxs(mid),
    enabled: !!mid,
    staleTime: 15000,
    refetchInterval: 10000,
  });
}
