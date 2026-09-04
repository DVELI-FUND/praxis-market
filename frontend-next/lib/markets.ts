import { b64ToHex } from "@/lib/format";
import { getPluginRPC, queryHeight } from "@/lib/rpc";

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
  openTime: number;
  txCount: number;
}

interface RawMarketEntry {
  id?: string;
  market?: {
    q_yes?: string | number;
    q_no?: string | number;
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

  return (raw || []).map((entry) => {
    const id = entry.id || "";
    const mk = entry.market || {};
    const qYes = BigInt(mk.q_yes || 0);
    const qNo = BigInt(mk.q_no || 0);
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
      openTime: Number(mk.open_time || 0),
      txCount: Number(mk.tx_count || 0),
    };
  });
}

// ── rules-tag grammar — ported verbatim from Frontend/ui-shell.js ──
export function extractCat(rules: string): string {
  if (!rules) return "other";
  const m = rules.match(/^\[CAT:(\w+)\]/);
  return m ? m[1] : "other";
}
export function stripCatPrefix(rules: string): string {
  if (!rules) return "";
  return rules.replace(/^\[CAT:\w+\]\s*/, "");
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

export const CAT_SYMBOLS: Record<string, string> = {
  crypto: "◈", sports: "◉", politics: "◆", finance: "▲", esports: "▣", other: "◈",
};
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
    arr.sort((a, b) => Number(b.qYes + b.qNo - (a.qYes + a.qNo)));
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
    arr.sort((a, b) => Number(b.b0 - a.b0));
  }
  return arr;
}

export function yesPct(m: { qYes: bigint; qNo: bigint }): number {
  const total = m.qYes + m.qNo;
  return total > 0n ? Number((m.qYes * 100n) / total) : 50;
}
