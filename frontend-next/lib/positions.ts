import { useQuery } from "@tanstack/react-query";
import { getPluginRPC } from "@/lib/rpc";
import { useWallet } from "@/store/wallet";
import { STATUS, binYesPrice, marketLiquidity } from "@/lib/markets";
import { nPositionValue } from "@/lib/nOutcome";

export interface Position {
  marketId: string;
  sharesYes: bigint;
  sharesNo: bigint;
  shares: bigint[]; // N-outcome per-option shares ([] for legacy binary)
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
          const ns = Array.isArray(p.shares) ? (p.shares as (string | number)[]).map((v) => BigInt(v || 0)) : [];
          if (sy === 0n && sn === 0n && !ns.some((v) => v > 0n)) return null;
          return {
            marketId: mid,
            sharesYes: sy,
            sharesNo: sn,
            shares: ns,
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

interface ValuedMarket {
  status: number;
  options: string[];
  q: bigint[];
  qYes: bigint;
  qNo: bigint;
  b0: bigint;
}

/**
 * Current value of a position in uPRX, matching what the chain would pay.
 *  - claimed            -> 0 (already paid out)
 *  - cancelled / voided -> costPaid (claim handler refunds CostPaid)
 *  - N-outcome          -> shares * LMSR price (1 uPRX per winning share)
 *  - binary             -> expected pro-rata pool payout (ComputePayout(pool, mine, totalSide));
 *                          NOT 1 uPRX per share
 * Resolved-but-unclaimed positions are still marked at live prices (winning index is not in the list endpoint).
 */
export function positionValue(pos: Position, m: ValuedMarket): bigint {
  if (pos.claimed) return 0n;
  if (m.status === STATUS.CANCELLED || m.status === STATUS.VOIDED) return pos.costPaid;
  if (m.options.length > 0) return nPositionValue(pos.shares, m.q, m.b0);
  const pYes = binYesPrice(m.qYes, m.qNo, m.b0);
  const pool = Number(marketLiquidity(m));
  const yes = m.qYes > 0n ? (Number(pos.sharesYes) / Number(m.qYes)) * pool * pYes : 0;
  const no = m.qNo > 0n ? (Number(pos.sharesNo) / Number(m.qNo)) * pool * (1 - pYes) : 0;
  return BigInt(Math.max(0, Math.round(yes + no)));
}
