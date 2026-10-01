import { b64ToHex } from "@/lib/format";

// Markets hidden from the Praxis frontend (lists, search, ticker, detail page, share cards).
// FRONTEND-ONLY: the chain and plugin RPC still hold these markets.
// Add 40-char hex market ids, one per line, above the IDS_END marker.
const HIDDEN: string[] = [
  "6da413d908ca5d41bc90c25bec85cc33a1942538",
  "8fee15ad02f94760476d8330283423efdfc01bce",
  "46296c71dc08ca5a3e255464334cd42b2aabeb20",
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
