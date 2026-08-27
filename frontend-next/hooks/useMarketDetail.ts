"use client";
import { useQuery } from "@tanstack/react-query";
import { fetchMarket, fetchHolders, fetchDisputeContext, type MarketDetail, type Holder, type DisputeContext } from "@/lib/detail";

export function useMarketDetail(mid: string) {
  const marketQuery = useQuery({
    queryKey: ["market-detail", mid],
    queryFn: () => fetchMarket(mid),
    enabled: !!mid,
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const holdersQuery = useQuery({
    queryKey: ["market-holders", mid],
    queryFn: () => fetchHolders(mid),
    enabled: !!mid,
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const disputeContextQuery = useQuery({
    queryKey: ["market-dispute-context", mid],
    queryFn: () => fetchDisputeContext(mid),
    enabled: !!mid,
    staleTime: 15000,
    refetchInterval: 30000,
  });

  return {
    market: marketQuery.data as MarketDetail | undefined,
    holders: holdersQuery.data as Holder[] | undefined,
    disputeContext: disputeContextQuery.data as DisputeContext | undefined,
    isLoading: marketQuery.isLoading,
    isError: marketQuery.isError,
    error: marketQuery.error,
  };
}
