"use client";
import { useQuery } from "@tanstack/react-query";
import { fetchXpBoard, fetchXpMe } from "@/lib/xp";

export function useXpBoard() {
  return useQuery({
    queryKey: ["xp-board"],
    queryFn: () => fetchXpBoard(100),
    refetchInterval: 30000,
    staleTime: 15000,
    retry: 1,
  });
}

export function useXpMe(address: string | null) {
  return useQuery({
    queryKey: ["xp-me", address],
    queryFn: () => fetchXpMe(address as string),
    enabled: !!address,
    refetchInterval: 30000,
    staleTime: 15000,
    retry: 1,
  });
}
