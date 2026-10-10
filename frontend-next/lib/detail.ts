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
  totalPositions: number;
  rawStatus: number;
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
  proposedIndex: number; // N-outcome markets
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
  winningIndex: number; // N-outcome markets
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
  const raw = await pluginFetch<{ id: string; market: { q_yes: string; q_no: string; expiry_time: string; status: number; question: string; rules: string; creator: string; b_eff: string; options?: string[]; q?: (string | number)[]; open_time?: string | number; tx_count?: string | number; total_positions?: string | number } }>(`/v1/query/markets?id=${encodeURIComponent(mid)}`);
  const mk = raw.market;
  const expiry = BigInt(mk.expiry_time || 0);
  let status = mk.status ?? 0;
  const rawStatus = status;
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
    totalPositions: Number(mk.total_positions || 0),
    rawStatus,
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

// The plugin answers dispute-context in snake_case (rpc.go); normalise to the camelCase
// DisputeContext shape the UI uses. The raw should_dispute* keys are kept for the planner.
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function fetchDisputeContext(mid: string, addr?: string): Promise<DisputeContext> {
  const url = addr ? `/v1/query/dispute-context?market=${encodeURIComponent(mid)}&address=${encodeURIComponent(addr)}` : `/v1/query/dispute-context?market=${encodeURIComponent(mid)}`;
  const r = await pluginFetch<any>(url);
  const big = (v: any) => BigInt(v ?? 0);
  const out: any = {
    ...r,
    market: r.market,
    status: Number(r.status ?? 0),
    expiryTime: Number(r.expiry_time ?? r.expiryTime ?? 0),
    openTime: Number(r.open_time ?? r.openTime ?? 0),
    question: r.question || "",
    shouldDispute: Boolean(r.should_dispute ?? r.shouldDispute),
    shouldDisputeReason: r.should_dispute_reason ?? r.shouldDisputeReason ?? "",
  };
  const p = r.proposal;
  if (p) {
    out.proposal = {
      resolverAddr: String(p.resolver_addr ?? p.resolverAddr ?? ""),
      proposedOutcome: Boolean(p.proposed_outcome ?? p.proposedOutcome),
      proposedIndex: Number(p.proposed_index ?? p.proposedIndex ?? 0),
      proposalBond: big(p.proposal_bond ?? p.proposalBond),
      proposalBlock: Number(p.proposal_block ?? p.proposalBlock ?? 0),
      status: Number(p.status ?? 0),
    };
  }
  const d = r.dispute;
  if (d) {
    out.dispute = {
      disputerAddress: String(d.disputer_address ?? d.disputerAddress ?? ""),
      disputeBond: big(d.dispute_bond ?? d.disputeBond),
      disputeBlock: Number(d.dispute_block ?? d.disputeBlock ?? 0),
      voteStatus: Number(d.vote_status ?? d.voteStatus ?? 0),
      panelSize: Number(d.panel_size ?? d.panelSize ?? 0),
      panelMembers: (d.panel_members ?? d.panelMembers ?? []) as string[],
    };
  }
  const o = r.outcome;
  if (o) {
    out.outcome = {
      winningOutcome: Boolean(o.winning_outcome ?? o.winningOutcome), // proto3 JSON omits false
      winningIndex: Number(o.winning_index ?? o.winningIndex ?? 0),
      resolvedAt: Number(o.resolved_at ?? o.resolvedAt ?? 0),
    };
  }
  const yp = r.your_position;
  if (yp) {
    out.yourPosition = {
      sharesYes: big(yp.shares_yes),
      sharesNo: big(yp.shares_no),
      costPaid: big(yp.cost_paid),
      claimed: Boolean(yp.claimed),
    };
  }
  const w = r.dispute_window;
  if (w) {
    out.disputeWindow = {
      open: Boolean(w.open),
      proposalBlock: w.proposal_block !== undefined ? Number(w.proposal_block) : undefined,
      deadlineBlock: w.deadline_block !== undefined ? Number(w.deadline_block) : undefined,
      windowBlocks: w.window_blocks !== undefined ? Number(w.window_blocks) : undefined,
      currentHeight: w.current_height !== undefined ? Number(w.current_height) : undefined,
    };
  }
  return out as DisputeContext;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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

export interface FullPosition {
  yes: bigint;
  no: bigint;
  shares: bigint[];
  costPaid: bigint;
  claimed: boolean;
}

/** Single-address position straight from /v1/query/position (not limited to the top-10 holders list). */
export async function fetchPositionFull(mid: string, addr: string): Promise<FullPosition | null> {
  if (!mid || !addr) return null;
  const raw = await pluginFetch<{ position?: Record<string, number | string | boolean | (number | string)[]> | null }>(
    `/v1/query/position?market=${encodeURIComponent(mid)}&address=${encodeURIComponent(addr)}`
  );
  const p = raw.position;
  if (!p) return null;
  const n = (v: unknown) => BigInt((v as number | string) || 0);
  const shares = Array.isArray(p.shares) ? (p.shares as (number | string)[]).map((v) => BigInt(v || 0)) : [];
  const yes = n(p.shares_yes ?? p.sharesYes);
  const no = n(p.shares_no ?? p.sharesNo);
  if (yes === 0n && no === 0n && !shares.some((v) => v > 0n)) return null;
  return { yes, no, shares, costPaid: n(p.cost_paid ?? p.costPaid), claimed: Boolean(p.claimed) };
}
