import { b64ToHex } from "@/lib/format";
import { getPluginRPC, queryHeight } from "@/lib/rpc";
import { isHiddenMarket } from "@/lib/hiddenMarkets";
import { nPrices, nCost } from "@/lib/nOutcome";

export const CLOSED_WINDOW = 20000; // blocks — from Frontend/markets.js

export const STATUS = {
  LIVE: 0,
  CANCELLED: 1,
  RESOLVED: 2,
  EXPIRED: 3,
  PROPOSED: 4,
  DISPUTED: 5,
  FINALIZED: 6,
  VOIDED: 7,
  AWAITING: 8,
} as const;

export interface Market {
  marketId: string;
  question: string;
  rules: string;
  creator: string;
  b0: bigint;
  expiry: bigint;
  status: number;
  qYes: bigint;
  qNo: bigint;
  options: string[]; // N-outcome labels; [] = legacy binary market
  q: bigint[]; // shares outstanding per option (N-outcome only)
  openTime: number;
  txCount: number;
}

interface RawMarketEntry {
  id?: string;
  market?: {
    q_yes?: string | number;
    q_no?: string | number;
    options?: string[];
    q?: (string | number)[];
    expiry_time?: string | number;
    status?: number | null;
    question?: string;
    rules?: string;
    creator?: string;
    b_eff?: string | number;
    open_time?: string | number;
    tx_count?: string | number;
  };
}

// Ported from Frontend/markets.js loadMarkets (same endpoints, same mapping).
export async function fetchMarkets(): Promise<Market[]> {
  const heightResp = await queryHeight();
  const currentHeight = heightResp.height || 1;

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10000);
  let resp: Response;
  try {
    resp = await fetch(getPluginRPC() + "/v1/query/markets", { signal: ctl.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("plugin RPC timed out after 10s");
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
  if (!resp.ok) throw new Error("plugin RPC returned " + resp.status);
  const raw = (await resp.json()) as RawMarketEntry[];

  return (raw || []).filter((entry) => !isHiddenMarket(entry.id)).map((entry) => {
    const id = entry.id || "";
    const mk = entry.market || {};
    const qYes = BigInt(mk.q_yes || 0);
    const qNo = BigInt(mk.q_no || 0);
    const options = Array.isArray(mk.options) ? mk.options : [];
    const q = (mk.q || []).map((v) => BigInt(v || 0));
    const expiry = BigInt(mk.expiry_time || 0);
    let status = mk.status !== undefined && mk.status !== null ? Number(mk.status) : 0;
    if (status === 0 && expiry && currentHeight > Number(expiry)) status = STATUS.AWAITING;
    return {
      marketId: id,
      question: mk.question || "(no question)",
      rules: mk.rules || "",
      creator: b64ToHex(mk.creator || ""),
      b0: BigInt(mk.b_eff || 0),
      expiry,
      status,
      qYes,
      qNo,
      options,
      q,
      openTime: Number(mk.open_time || 0),
      txCount: Number(mk.tx_count || 0),
    };
  });
}

// ── rules-tag grammar — ported verbatim from Frontend/ui-shell.js ──
export function extractCat(rules: string): string {
  if (!rules) return "other";
  const m = rules.match(/\[CAT:(\w+)\]/);
  return m ? m[1] : "other";
}
export function stripCatPrefix(rules: string): string {
  if (!rules) return "";
  return rules.replace(/^\[CAT:\w+\]\s*/, "").replace(/\[SUB:[^\]]+\]\s*/g, "");
}
export function parseSub(rules: string): string | null {
  if (!rules) return null;
  const m = rules.match(/\[SUB:([a-zA-Z0-9-]+)\]/);
  return m ? m[1].toLowerCase() : null;
}
export function parseCat(rules: string): string | null {
  if (!rules) return null;
  const m = rules.match(/\[CAT:(\w+)\]/);
  return m ? m[1].toLowerCase() : null;
}
export function extractImg(rules: string): string {
  if (!rules) return "";
  const m = rules.match(/\[IMG:([^\]]+)\]/);
  return m ? m[1].trim() : "";
}
export function extractOutcomes(rules: string): { yes: string; no: string } {
  if (!rules) return { yes: "YES", no: "NO" };
  const m = rules.match(/\[OUT:([^\|\]]+)\|([^\]]+)\]/);
  if (!m) return { yes: "YES", no: "NO" };
  return { yes: m[1].trim(), no: m[2].trim() };
}

export const CAT_SYMBOLS: Record<string, string> = {};
export const CAT_EMOJI: Record<string, string> = {
  crypto: "🪙", sports: "⚽", politics: "🗳", finance: "📈", esports: "🎮", other: "◈",
};

export type TabKey = "live" | "proposed" | "closed";
export type SortKey = "vol" | "expiry" | "yes" | "newest" | "closing" | "trending" | "competitive" | "totalVol";

// Tab filters — matches the live legacy inline override in index.html.
export function filterByTab(markets: Market[], tab: TabKey): Market[] {
  if (tab === "live") return markets.filter((m) => m.status === STATUS.LIVE);
  if (tab === "proposed") {
    return markets.filter((m) => m.status === STATUS.PROPOSED || m.status === STATUS.DISPUTED);
  }
  return markets.filter(
    (m) =>
      m.status === STATUS.FINALIZED ||
      m.status === STATUS.CANCELLED ||
      m.status === STATUS.VOIDED ||
      m.status === STATUS.EXPIRED ||
      m.status === STATUS.RESOLVED ||
      m.status === STATUS.AWAITING
  );
}

// Sorts — ported from the legacy inline override. NOTE: legacy "new" used
// createdAt/blockHeight which the mapped markets never carried, so it was a
// stable no-op there; kept identical here on purpose.
export function sortMarkets(markets: Market[], sort: SortKey): Market[] {
  const arr = [...markets];
  if (sort === "vol") {
    arr.sort((a, b) => Number(marketVol(b) - marketVol(a)));
  } else if (sort === "expiry" || sort === "closing") {
    arr.sort((a, b) => Number(a.expiry - b.expiry));
  } else if (sort === "yes") {
    arr.sort((a, b) => yesPct(b) - yesPct(a));
  } else if (sort === "newest") {
    arr.sort((a, b) => b.openTime - a.openTime);
  } else if (sort === "trending") {
    arr.sort((a, b) => b.txCount - a.txCount);
  } else if (sort === "competitive") {
    arr.sort((a, b) => Math.abs(50 - yesPct(a)) - Math.abs(50 - yesPct(b)));
  } else if (sort === "totalVol") {
    arr.sort((a, b) => Number(marketLiquidity(b) - marketLiquidity(a)));
  }
  return arr;
}

/** Leading option for N-outcome markets (label + % chance); binary markets return YES. */
export function leadOption(m: { options?: string[]; q?: bigint[]; b0: bigint; rules?: string }): { label: string; pct: number } {
  if (m.options && m.options.length > 0 && m.q && m.q.length === m.options.length) {
    const p = nPrices(m.q, m.b0);
    let best = 0;
    for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
    return { label: m.options[best], pct: Math.round(p[best] * 100) };
  }
  return { label: "", pct: -1 };
}

export function isNMarket(m: { options?: string[] }): boolean {
  return !!m.options && m.options.length > 0;
}

export function totalShares(m: { qYes: bigint; qNo: bigint; q?: bigint[] }): bigint {
  return m.q && m.q.length ? m.q.reduce((s, v) => s + v, 0n) : m.qYes + m.qNo;
}

// Binary LMSR YES price (0..1) = sigmoid((qYes - qNo) / b). Mirrors lmsr.go lmsrCost:
// C = b*ln(e^(qYes/b) + e^(qNo/b)); price_yes = dC/dqYes. NOT qYes/(qYes+qNo).
export function binYesPrice(qYes: bigint, qNo: bigint, b: bigint): number {
  if (b <= 0n) {
    const t = qYes + qNo;
    return t > 0n ? Number(qYes) / Number(t) : 0.5;
  }
  return 1 / (1 + Math.exp(-(Number(qYes) - Number(qNo)) / Number(b)));
}

// Legacy binary: YES percentage from the LMSR price. N-outcome: percentage of option 0 (sort helper only; UIs show every option).
export function yesPct(m: { qYes: bigint; qNo: bigint; options?: string[]; q?: bigint[]; b0?: bigint }): number {
  if (m.options && m.options.length > 0 && m.q && m.b0) return Math.round(nPrices(m.q, m.b0)[0] * 100);
  if (m.b0 && m.b0 > 0n) return Math.round(binYesPrice(m.qYes, m.qNo, m.b0) * 100);
  const total = m.qYes + m.qNo;
  return total > 0n ? Number((m.qYes * 100n) / total) : 50;
}


export function isCancelled(m: Market): boolean {
  return m.status === STATUS.CANCELLED || m.status === STATUS.VOIDED;
}

export { nPrices } from "@/lib/nOutcome";




// ── Volume / liquidity — derived from on-chain state, in uPRX ──
// Chain facts (handler_submit_prediction / handler_create_market):
//   pool += tradeCost on every trade; position.CostPaid += tradeCost (fees are separate pools).
//   binary:    b_eff = lmsrSeed, q starts at (b/2, b/2), pool starts at lmsrSeed
//   N-outcome: b = seed/ln(N), q starts at 0, pool starts at seed ≈ b*ln(N)
// Net traded volume (buys, ex-fees) = C(q) - C(q0).   Pool liquidity = seed + volume.
// Raw share counts are NOT PRX and must never be shown as volume/liquidity.
function lse2(a: number, b: number): number {
  return a >= b ? a + Math.log1p(Math.exp(b - a)) : b + Math.log1p(Math.exp(a - b));
}
function marketCostParts(m: any): { cost: number; cost0: number; seed: number } {
  const b = Number(m?.b0 ?? 0);
  if (!(b > 0)) return { cost: 0, cost0: 0, seed: 0 };
  if (m && Array.isArray(m.options) && m.options.length > 0) {
    const q: bigint[] = Array.isArray(m.q) ? m.q : [];
    const cost = nCost(q.length ? q : m.options.map(() => 0n), BigInt(Math.round(b)));
    const cost0 = b * Math.log(m.options.length);
    return { cost, cost0, seed: cost0 };
  }
  const qy = Number(m?.qYes ?? 0), qn = Number(m?.qNo ?? 0);
  const cost = b * lse2(qy / b, qn / b);
  const cost0 = b * lse2(0.5, 0.5);
  return { cost, cost0, seed: b };
}

/** Binary quote (uPRX): C(after) - C(before), mirrors lmsr.go ComputeTradeCost. Quote only; chain is the source of truth. */
export function binTradeCost(qYes: bigint, qNo: bigint, b: bigint, yes: boolean, shares: bigint): number {
  const bb = Number(b);
  if (!(bb > 0)) return 0;
  const f = (y: number, n: number) => bb * lse2(y / bb, n / bb);
  const y = Number(qYes), n = Number(qNo), s = Number(shares);
  return f(yes ? y + s : y, yes ? n : n + s) - f(y, n);
}

/** Net PRX traded so far (uPRX), excluding fees. 0 for a market nobody has traded. */
export function marketVol(m: any): bigint {
  const { cost, cost0 } = marketCostParts(m);
  const v = Math.round(cost - cost0);
  return v > 0 ? BigInt(v) : 0n;
}

/** PRX actually held in the market pool (uPRX) = creator seed + net traded volume. */
export function marketLiquidity(m: any): bigint {
  const { cost, cost0, seed } = marketCostParts(m);
  const v = Math.round(seed + (cost - cost0));
  return v > 0 ? BigInt(v) : 0n;
}
