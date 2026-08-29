"use client";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/store/wallet";
import { useMarkets } from "@/hooks/useMarkets";
import { getPluginRPC } from "@/lib/rpc";
import { b64ToHex } from "@/lib/format";

interface RawResolver {
  resolver_address?: string;
  address?: string;
}

async function fetchResolvers(): Promise<RawResolver[]> {
  const r = await fetch(getPluginRPC() + "/v1/query/resolvers");
  if (!r.ok) return [];
  return (await r.json()) as RawResolver[];
}

export function useRoles() {
  const praxisAddress = useWallet((st) => st.praxisAddress);
  const { data: markets = [] } = useMarkets();
  const { data: resolvers = [] } = useQuery({
    queryKey: ["resolvers-raw"],
    queryFn: fetchResolvers,
    staleTime: 60000,
  });

  const addr = (praxisAddress || "").toLowerCase();
  const isAdminList = (process.env.NEXT_PUBLIC_AUTHORITY_ADDRESSES || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

  // resolver_address arrives base64 (proto3 JSON []byte) — decode to hex first
  const isResolver =
    !!addr &&
    resolvers.some((r) => {
      const raw = r.resolver_address || r.address || "";
      return !!raw && b64ToHex(raw) === addr;
    });

  const isCreator =
    !!addr && markets.some((m) => (m.creator || "").toLowerCase() === addr);

  const isAdmin = !!addr && isAdminList.includes(addr);

  return { isResolver, isCreator, isAdmin, hasAnyRole: isResolver || isCreator || isAdmin };
}
