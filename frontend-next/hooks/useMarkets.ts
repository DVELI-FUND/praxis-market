"use client";
import { useQuery } from "@tanstack/react-query";
import { fetchMarkets } from "@/lib/markets";

export function useMarkets() {
  return useQuery({
    queryKey: ["markets"],
    queryFn: fetchMarkets,
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
    staleTime: 5000,
    retry: 1,
  });
}
