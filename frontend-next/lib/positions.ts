import { useQuery } from "@tanstack/react-query";
import { getPluginRPC } from "@/lib/rpc";
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
  const r = await fetch(getPluginRPC() + "/v1/query/markets");
  if (!r.ok) return [];
  const raw = (await r.json()) as Record<string, unknown>[];
  const mids = raw.map((m) => String(m.id || "")).filter(Boolean);

  const out: Position[] = [];
  for (let i = 0; i < mids.length; i += 5) {
    const batch = mids.slice(i, i + 5);
    const res = await Promise.all(
      batch.map(async (mid) => {
        try {
          const rr = await fetch(
            `${getPluginRPC()}/v1/query/position?market=${encodeURIComponent(mid)}&address=${encodeURIComponent(address)}`
          );
          if (!rr.ok) return null;
          const d = (await rr.json()) as { position?: Record<string, unknown> | null };
          const p = d.position;
          if (!p) return null;
          const sy = BigInt((p.shares_yes ?? p.sharesYes ?? 0) as string | number || 0);
          const sn = BigInt((p.shares_no ?? p.sharesNo ?? 0) as string | number || 0);
          if (sy === 0n && sn === 0n) return null;
          return {
            marketId: mid,
            sharesYes: sy,
            sharesNo: sn,
            costPaid: BigInt((p.cost_paid ?? p.costPaid ?? 0) as string | number || 0),
            claimed: Boolean(p.claimed),
          } as Position;
        } catch {
          return null;
        }
      })
    );
    for (const p of res) if (p) out.push(p);
  }
  return out;
}

export function usePositions() {
  const addr = useWallet((s) => s.praxisAddress);
  return useQuery({
    queryKey: ["positions", addr],
    queryFn: () => (addr ? fetchPositions(addr) : []),
    staleTime: 30000,
    enabled: !!addr,
  });
}
