import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPluginRPC } from "@/lib/rpc";
import { b64ToHex } from "@/lib/format";
import { useWallet } from "@/store/wallet";

// Protocol constants — plugin/go/contract (constants_pris.go + handlers)
export const MIN_RESOLVER_STAKE = 500000000000n; // 500,000 PRX in uPRX
export const UNBONDING_BLOCKS = 120960; // ~7 days @5s/block
export const PARTIAL_RRS_HIT = 10; // RRS penalty on partial unstake
export const RRS_INITIAL = 10;

export interface Resolver {
  address: string;
  rrsScore: number;
  registeredAt: number;
  stake: bigint;
  unbonding: bigint;
  releaseHeight: number;
  resolutions: number;
  active: boolean;
}

export async function fetchResolvers(): Promise<Resolver[]> {
  const r = await fetch(getPluginRPC() + "/v1/query/resolvers");
  if (!r.ok) return [];
  const raw = (await r.json()) as Record<string, unknown>[];
  return raw
    .map((x) => ({
      address: b64ToHex(String(x.resolver_address || x.address || "")),
      rrsScore: Number(x.rrs_score || 0),
      registeredAt: Number(x.registered_at || 0),
      stake: BigInt((x.stake_amount as number | string) || 0),
      unbonding: BigInt((x.unbonding_amount as number | string) || 0),
      releaseHeight: Number(x.unbonding_release_height || 0),
      resolutions: Number(x.successful_resolutions || 0),
      active: Boolean(x.is_active),
    }))
    .sort((a, b) => Number(b.stake - a.stake));
}

export function useResolvers() {
  return useQuery({ queryKey: ["resolvers"], queryFn: fetchResolvers, staleTime: 60000 });
}

export function useMyResolver(): Resolver | null {
  const addr = useWallet((s) => s.praxisAddress);
  const { data: resolvers = [] } = useResolvers();
  const a = (addr || "").toLowerCase();
  return useMemo(() => resolvers.find((r) => r.address.toLowerCase() === a) || null, [resolvers, a]);
}
