"use client";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/store/wallet";
import { useMarkets } from "@/hooks/useMarkets";
import { getPluginRPC } from "@/lib/rpc";

async function fetchResolvers(): Promise<unknown[]> {
  const r = await fetch(getPluginRPC() + "/v1/query/resolvers");
  if (!r.ok) return [];
  return (await r.json()) as unknown[];
}

export function useRoles() {
  const praxisAddress = useWallet((st) => st.praxisAddress);
  const { data: markets = [] } = useMarkets();
  const { data: resolvers = [] } = useQuery({
    queryKey: ["resolvers"],
    queryFn: fetchResolvers,
    staleTime: 60000,
  });

  const addr = (praxisAddress || "").toLowerCase();
  const isAdminList = (process.env.NEXT_PUBLIC_AUTHORITY_ADDRESSES || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

  const isResolver =
    !!addr && resolvers.some((r) => JSON.stringify(r).toLowerCase().includes(addr));
  const isCreator = !!addr && markets.some((m) => (m.creator || "").toLowerCase() === addr);
  const isAdmin = !!addr && isAdminList.includes(addr);

  return { isResolver, isCreator, isAdmin, hasAnyRole: isResolver || isCreator || isAdmin };
}
