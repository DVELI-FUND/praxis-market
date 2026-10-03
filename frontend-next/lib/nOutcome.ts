// N-outcome (2-10 options) helpers. DISPLAY / QUOTE math only (float64) — the chain uses
// the integer fixed-point engine (lmsr_n.go) and is the source of truth for what is charged.
// Standard LMSR: C(q) = b*ln(sum exp(q_i/b)); price_i = softmax(q/b); a winning share pays 1 unit.

export const MIN_OUTCOMES = 2;
export const MAX_OUTCOMES = 10;
export const MAX_OPTION_LABEL_BYTES = 64;
export const MAX_QUESTION_BYTES_N = 280;
export const MAX_RULES_BYTES_N = 4096;
// B0 must be >= FINALIZATION_BOUNTY (50M) + MIN_SEED_N (25M) micro-units for N-outcome markets.
export const MIN_B0_N = 75_000_000n;

function logSumExp(q: bigint[], b: bigint): { m: bigint; s: number } {
  let m = 0n;
  for (const v of q) if (v > m) m = v;
  const bb = Number(b);
  let s = 0;
  for (const v of q) s += Math.exp(Number(v - m) / bb);
  return { m, s };
}

/** Probabilities (0..1) per option; sums to 1. */
export function nPrices(q: bigint[], b: bigint): number[] {
  if (!q.length || b <= 0n) return q.map(() => (q.length ? 1 / q.length : 0));
  let m = 0n;
  for (const v of q) if (v > m) m = v;
  const bb = Number(b);
  const w = q.map((v) => Math.exp(Number(v - m) / bb));
  const s = w.reduce((a, x) => a + x, 0);
  return w.map((x) => x / s);
}

/** C(q) in micro-units. */
export function nCost(q: bigint[], b: bigint): number {
  const { m, s } = logSumExp(q, b);
  return Number(m) + Number(b) * Math.log(s);
}

/** Estimated cost (micro-units) of buying `shares` of option `idx`. Quote only. */
export function nTradeCost(q: bigint[], b: bigint, idx: number, shares: bigint): number {
  const q2 = q.slice();
  q2[idx] += shares;
  return nCost(q2, b) - nCost(q, b);
}

/** Mirrors the on-chain create_market option rules; returns an error message or null. */
export function validateOptions(opts: string[]): string | null {
  if (opts.length < MIN_OUTCOMES || opts.length > MAX_OUTCOMES) {
    return `Use between ${MIN_OUTCOMES} and ${MAX_OUTCOMES} options`;
  }
  const seen = new Set<string>();
  const enc = new TextEncoder();
  for (const o of opts) {
    if (o.trim() === "") return "Option labels cannot be empty";
    if (enc.encode(o).length > MAX_OPTION_LABEL_BYTES) return `Option labels are limited to ${MAX_OPTION_LABEL_BYTES} bytes`;
    if (seen.has(o)) return "Option labels must be unique";
    seen.add(o);
  }
  return null;
}

/** Mark-to-market value (micro-units) of per-option shares at current LMSR prices. */
export function nPositionValue(shares: bigint[], q: bigint[], b: bigint): bigint {
  const p = nPrices(q, b);
  let v = 0;
  for (let i = 0; i < shares.length && i < p.length; i++) v += Number(shares[i]) * p[i];
  return BigInt(Math.round(v));
}

/** Index of the option with the most shares, or -1 when the position is empty. */
export function topShareIndex(shares: bigint[]): number {
  let best = -1;
  let max = 0n;
  shares.forEach((s, i) => {
    if (s > max) { max = s; best = i; }
  });
  return best;
}
