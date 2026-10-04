import { b64ToHex } from "@/lib/format";

// Markets hidden from the Praxis frontend (lists, search, ticker, detail page, share cards).
// FRONTEND-ONLY: the chain and plugin RPC still hold these markets.
// Add 40-char hex market ids, one per line, above the IDS_END marker.
const HIDDEN: string[] = [
  "6da413d908ca5d41bc90c25bec85cc33a1942538",
  "8fee15ad02f94760476d8330283423efdfc01bce",
  "46296c71dc08ca5a3e255464334cd42b2aabeb20",
  "2e8b441c69827295f8b542c83a9dbeb9294f63bc",  // Levante vs Athletic Club
  "d3ff3bfc79e5838efc954cff92b06e911361f78d",  // Levante vs Athletic Club
  "dff858062b200369bacd849c8fddd9401fa21249",  // Arsenal vs Leeds United
  "e4bd54853d5366e6302e437bb5dcecd46caf5fcf",  // Arsenal vs Leeds United
  "f74013d327dd2d0728cdf120b5719e589a3d7f38",  // Republican Presidential Nominee 2028
  // IDS_END
];

const HIDDEN_SET = new Set(
  [...HIDDEN, ...(process.env.NEXT_PUBLIC_HIDDEN_MARKETS || "").split(",")]
    .map((x) => x.trim().toLowerCase().replace(/^0x/, ""))
    .filter(Boolean)
);

export function isHiddenMarket(id: string | undefined | null): boolean {
  if (!id || HIDDEN_SET.size === 0) return false;
  return HIDDEN_SET.has(b64ToHex(String(id)).toLowerCase());
}
