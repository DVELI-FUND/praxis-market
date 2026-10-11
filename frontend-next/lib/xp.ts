// XP / quests data. Served by the standalone xpd indexer (read-only), exposed
// next to the node RPC at <XP_URL>/xp/*.
export const XP_URL = process.env.NEXT_PUBLIC_XP_URL || "https://rpc.praxismarket.store";

export interface XpRow {
  rank: number;
  address: string;
  betXP: number;
  lpXP: number;
  total: number;
}

export interface XpRules {
  xpPerBetUnit: number;
  maxBetXPPerMarket: number;
  xpPerLPBlock: number;
  startHeight: number;
  endHeight: number; // 0 = open ended
}

export interface XpBoard {
  indexedHeight: number;
  minBetCostPRX: number; // base units (1 PRX = 1e6)
  minLPValueCNPY: number; // base units (1 CNPY = 1e6)
  rules?: XpRules;
  rows: XpRow[];
}

export interface XpMe {
  indexedHeight: number;
  row: XpRow | null;
}

async function getJson<T>(path: string): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(XP_URL + path, { signal: ctl.signal });
    if (!r.ok) throw new Error(`XP service HTTP ${r.status}`);
    return (await r.json()) as T;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw new Error("XP service timed out");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export const fetchXpBoard = (limit = 100) => getJson<XpBoard>(`/xp/leaderboard?limit=${limit}`);
export const fetchXpMe = (address: string) => getJson<XpMe>(`/xp/address/${address.toLowerCase()}`);
