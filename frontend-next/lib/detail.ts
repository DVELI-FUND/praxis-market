// Market detail data fetching — uses available plugin endpoints
import { b64ToHex } from "@/lib/format";
import { getPluginRPC } from "@/lib/rpc";

export interface MarketDetail {
  marketId: string;
  question: string;
  rules: string;
  creator: string;
  b0: bigint;
  expiry: bigint;
  status: number;
  qYes: bigint;
  qNo: bigint;
}

export interface Holder {
  address: string;
  sharesYes: bigint;
  sharesNo: bigint;
  costPaid: bigint;
  claimed: boolean;
}

export interface ProposalRecord {
  resolverAddr: string;
  proposedOutcome: boolean;
  proposalBond: bigint;
  proposalBlock: number;
  status: number;
}

export interface DisputeRecord {
  disputerAddress: string;
  disputeBond: bigint;
  disputeBlock: number;
  voteStatus: number;
  panelSize: number;
  panelMembers: string[];
}

export interface OutcomeState {
  winningOutcome: boolean;
  resolvedAt: number;
}

export interface DisputeContext {
  market: string;
  status: number;
  expiryTime: number;
  openTime: number;
  question: string;
  proposal?: ProposalRecord;
  dispute?: DisputeRecord;
  outcome?: OutcomeState;
  yourPosition?: {
    sharesYes: bigint;
    sharesNo: bigint;
    costPaid: bigint;
    claimed: boolean;
  } | null;
  disputeWindow?: {
    open: boolean;
    proposalBlock?: number;
    deadlineBlock?: number;
    windowBlocks?: number;
    currentHeight?: number;
  };
  shouldDispute?: boolean;
  shouldDisputeReason?: string;
}

export interface MarketActivity {
  txHash: string;
  sender: string;
  height: number;
  messageType: string;
  outcome?: boolean;
  shares?: bigint;
  proposedOutcome?: boolean;
  b0?: bigint;
}

async function pluginFetch<T>(path: string): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10000);
  let resp: Response;
  try {
    resp = await fetch(getPluginRPC() + path, { signal: ctl.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("plugin RPC timed out after 10s");
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
  if (!resp.ok) throw new Error("plugin RPC returned " + resp.status);
  return resp.json() as Promise<T>;
}

export async function fetchMarket(mid: string): Promise<MarketDetail> {
  const raw = await pluginFetch<{ id: string; market: { q_yes: string; q_no: string; expiry_time: string; status: number; question: string; rules: string; creator: string; b_eff: string } }>(`/v1/query/markets?id=${encodeURIComponent(mid)}`);
  const mk = raw.market;
  return {
    marketId: raw.id,
    question: mk.question || "(no question)",
    rules: mk.rules || "",
    creator: b64ToHex(mk.creator || ""),
    b0: BigInt(mk.b_eff || 0),
    expiry: BigInt(mk.expiry_time || 0),
    status: mk.status ?? 0,
    qYes: BigInt(mk.q_yes || 0),
    qNo: BigInt(mk.q_no || 0),
  };
}

export async function fetchHolders(mid: string): Promise<Holder[]> {
  const raw = await pluginFetch<{ address: string; sharesYes: number; sharesNo: number; costPaid: number; claimed: boolean }[]>(`/v1/query/positions?market=${encodeURIComponent(mid)}`);
  return raw.map((h) => ({
    address: h.address,
    sharesYes: BigInt(h.sharesYes || 0),
    sharesNo: BigInt(h.sharesNo || 0),
    costPaid: BigInt(h.costPaid || 0),
    claimed: h.claimed,
  }));
}

export async function fetchDisputeContext(mid: string, addr?: string): Promise<DisputeContext> {
  const url = addr ? `/v1/query/dispute-context?market=${encodeURIComponent(mid)}&address=${encodeURIComponent(addr)}` : `/v1/query/dispute-context?market=${encodeURIComponent(mid)}`;
  const raw = await pluginFetch<DisputeContext>(url);
  return raw;
}

// Fetch activity by querying txs-by-sender for top holders, filtering by marketId
export async function fetchMarketActivity(mid: string, holders: Holder[]): Promise<MarketActivity[]> {
  const activities: MarketActivity[] = [];
  const topHolders = holders.slice(0, 5); // Only query top 5 to avoid excessive RPC calls

  for (const holder of topHolders) {
    try {
      const resp = await fetch(`/api/txs-by-sender?address=${encodeURIComponent(holder.address)}`);
      if (!resp.ok) continue;
      const data = await resp.json();
      const txs = data.results || [];
      for (const tx of txs) {
        const msg = tx.transaction?.msg || {};
        const rawMid = msg.marketId || msg.market_id || "";
        if (!rawMid) continue;
        
        // Decode base64 marketId if needed
        let txMid = rawMid;
        try {
          txMid = Array.from(atob(rawMid), (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
        } catch {}
        
        if (txMid === mid) {
          activities.push({
            txHash: tx.txHash || "",
            sender: tx.sender || "",
            height: tx.height || 0,
            messageType: tx.messageType || "unknown",
            outcome: msg.outcome === true || msg.outcome === "true" || msg.outcome === 1,
            shares: BigInt(msg.shares || msg.amount || 0),
            proposedOutcome: msg.proposedOutcome === true || msg.proposedOutcome === "true" || msg.proposedOutcome === 1,
            b0: BigInt(msg.b0 || 0),
          });
        }
      }
    } catch {
      continue;
    }
  }

  // Sort by height descending
  activities.sort((a, b) => b.height - a.height);
  return activities.slice(0, 20); // Return top 20
}

export async function fetchPosition(
  mid: string,
  addr: string
): Promise<{ yes: bigint; no: bigint }> {
  const raw = await pluginFetch<{
    position?: {
      shares_yes?: number | string;
      sharesYes?: number | string;
      shares_no?: number | string;
      sharesNo?: number | string;
    } | null;
  }>(`/v1/query/position?market=${encodeURIComponent(mid)}&address=${encodeURIComponent(addr)}`);
  const p = raw.position;
  if (!p) return { yes: 0n, no: 0n };
  return {
    yes: BigInt(p.shares_yes ?? p.sharesYes ?? 0),
    no: BigInt(p.shares_no ?? p.sharesNo ?? 0),
  };
}
