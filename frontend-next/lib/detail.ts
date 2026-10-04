// Market detail data fetching — uses available plugin endpoints
import { b64ToHex } from "@/lib/format";
import { getPluginRPC, queryHeight } from "@/lib/rpc";
import { STATUS } from "@/lib/markets";

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
  options: string[];
  q: bigint[];
  openTime: number;
  txCount: number;
}

export interface Holder {
  address: string;
  sharesYes: bigint;
  sharesNo: bigint;
  shares: bigint[]; // N-outcome per-option shares ([] for legacy)
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
  cost?: bigint;
  proposedOutcome?: boolean;
  b0?: bigint;
  outcomeIndex?: number; // N-outcome markets only
  proposedIndex?: number;
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
  const raw = await pluginFetch<{ id: string; market: { q_yes: string; q_no: string; expiry_time: string; status: number; question: string; rules: string; creator: string; b_eff: string; options?: string[]; q?: (string | number)[]; open_time?: string | number; tx_count?: string | number } }>(`/v1/query/markets?id=${encodeURIComponent(mid)}`);
  const mk = raw.market;
  const expiry = BigInt(mk.expiry_time || 0);
  let status = mk.status ?? 0;
  if (status === 0 && expiry) {
    try {
      const { height } = await queryHeight();
      if (height > Number(expiry)) status = STATUS.AWAITING;
    } catch { /* keep raw status */ }
  }
  return {
    marketId: raw.id,
    question: mk.question || "(no question)",
    rules: mk.rules || "",
    creator: b64ToHex(mk.creator || ""),
    b0: BigInt(mk.b_eff || 0),
    expiry,
    status,
    qYes: BigInt(mk.q_yes || 0),
    qNo: BigInt(mk.q_no || 0),
    options: Array.isArray(mk.options) ? mk.options : [],
    q: (mk.q || []).map((v) => BigInt(v || 0)),
    openTime: Number(mk.open_time || 0),
    txCount: Number(mk.tx_count || 0),
  };
}

export async function fetchHolders(mid: string): Promise<Holder[]> {
  const raw = await pluginFetch<{ address: string; sharesYes: number; sharesNo: number; shares?: number[]; costPaid: number; claimed: boolean }[]>(`/v1/query/positions?market=${encodeURIComponent(mid)}`);
  return raw.map((h) => ({
    address: h.address,
    sharesYes: BigInt(h.sharesYes || 0),
    sharesNo: BigInt(h.sharesNo || 0),
    shares: (h.shares || []).map((v) => BigInt(v || 0)),
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
  try {
    const url = getPluginRPC() + `/v1/query/market-txs?market=${encodeURIComponent(mid)}&limit=50`;
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const txs = await resp.json();

    return txs.map((tx: any) => ({
      txHash: tx.txHash || "",
      sender: tx.sender || "",
      height: tx.height || 0,
      messageType: tx.messageType || "unknown",
      outcome: tx.transaction?.msg?.outcome === true || tx.transaction?.msg?.outcome === "true",
      shares: BigInt(tx.transaction?.msg?.shares || 0),
      proposedOutcome: tx.transaction?.msg?.proposedOutcome === true || tx.transaction?.msg?.proposedOutcome === "true",
      b0: BigInt(0),
      outcomeIndex: Number(tx.transaction?.msg?.outcomeIndex ?? 0),
      proposedIndex: Number(tx.transaction?.msg?.proposedIndex ?? 0),
      cost: BigInt(tx.cost || 0),
    }));
  } catch {
    return [];
  }
}

export async function fetchPosition(
  mid: string,
  addr: string
): Promise<{ yes: bigint; no: bigint; shares: bigint[] }> {
  const raw = await pluginFetch<{
    position?: {
      shares_yes?: number | string;
      sharesYes?: number | string;
      shares_no?: number | string;
      sharesNo?: number | string;
      shares?: (number | string)[];
    } | null;
  }>(`/v1/query/position?market=${encodeURIComponent(mid)}&address=${encodeURIComponent(addr)}`);
  const p = raw.position;
  if (!p) return { yes: 0n, no: 0n, shares: [] };
  return {
    yes: BigInt(p.shares_yes ?? p.sharesYes ?? 0),
    no: BigInt(p.shares_no ?? p.sharesNo ?? 0),
    shares: (p.shares || []).map((v) => BigInt(v || 0)),
  };
}
