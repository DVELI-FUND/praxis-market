// Formatting helpers — ported from Frontend/proto.js (PRX = 1e6 uPRX).
export function fmtPRX(n: bigint | number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const x = Number(n) / 1_000_000;
  if (x === 0) return "0";
  if (x >= 1e9) return (x / 1e9).toFixed(2) + "B";
  if (x >= 1e6) return (x / 1e6).toFixed(2) + "M";
  if (x >= 1000) return (x / 1000).toFixed(2) + "k";
  if (x >= 1) return x.toFixed(2);
  return x.toFixed(6);
}

export function fmtA(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}

export function h2b(hex: string): Uint8Array {
  const s = hex.trim().toLowerCase();
  if (s.length % 2) throw new Error("Odd hex");
  const o = new Uint8Array(s.length / 2);
  for (let i = 0; i < o.length; i++) o[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return o;
}

export function b2h(b: Uint8Array): string {
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

// Decode proto3-JSON base64 bytes fields to hex; passes through if already hex.
export function b64ToHex(b64: string): string {
  if (/^[0-9a-f]{40}$/i.test(b64)) return b64.toLowerCase();
  if (typeof atob === "undefined") return b64;
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return b2h(bytes);
  } catch {
    return b64;
  }
}

// Human-readable countdown from block height (~10s/block).
export function fmtCountdown(expiry: number, height: number): string {
  if (!expiry) return "—";
  const blocks = expiry - height;
  if (blocks <= 0) return "ended";
  const secs = blocks * 10;
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
