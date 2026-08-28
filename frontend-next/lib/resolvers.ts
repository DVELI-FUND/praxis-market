import { getPluginRPC } from "@/lib/rpc";
import { b64ToHex } from "@/lib/format";

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
