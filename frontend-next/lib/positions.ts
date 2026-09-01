import { useQuery } from "@tanstack/react-query";
import { getPluginRPC } from "@/lib/rpc";
import { b64ToHex } from "@/lib/format";
import { useWallet } from "@/store/wallet";

export interface Position {
  marketId: string;
  sharesYes: bigint;
  sharesNo: bigint;
  costPaid: bigint;
  claimed: boolean;
}

export async function fetchPositions(address: string): Promise<Position[]> {
  if (!address) return [];
  
  // 1) Fetch all markets
  const r = await fetch(getPluginRPC() + "/v1/query/markets");
  if (!r.ok) return [];
  const raw = (await r.json()) as Record<string, unknown>[];
  const markets = raw.map((m) => ({
    id: String(m.id || m.market_id || ""),
  }));
  
  // 2) For each market, check if this address has a position
  const positions: Position[] = [];
  const concurrency = 5; // max 5 parallel requests
  
  for (let i = 0; i < markets.length; i += concurrency) {
    const batch = markets.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (m) => {
        try {
          const url = `${getPluginRPC()}/v1/query/position?market=${encodeURIComponent(m.id)}&address=${encodeURIComponent(address)}`;
          const r = await fetch(url);
          if (!r.ok) return null;
          const d = (await r.json()) as { position?: Record<string, unknown> };
          const p = d.position;
          if (!p) return null;
          const sy = BigInt((p.shares_yes ?? p.sharesYes ?? 0) as string | number);
          const sn = BigInt((p.shares_no ?? p.sharesNo ?? 0) as string | number);
          if (sy === 0n && sn === 0n) return null;
          return {
            marketId: m.id,
            sharesYes: sy,
            sharesNo: sn,
            costPaid: BigInt((p.cost_paid ?? p.costPaid ?? 0) as string | number),
            claimed: Boolean(p.claimed),
          };
        } catch {
          return null;
        }
      })
    );
    positions.push(...results.filter((p): p is Position => p !== null));
  }
  
  return positions;
}

export function usePositions() {
  const addr = useWallet((s) => s.praxisAddress);
  return useQuery({
    queryKey: ["positions", addr],
    queryFn: () => (addr ? fetchPositions(addr) : []),
    staleTime: 30000,
  });
}
