import { setChainContext } from "./chainContext";

export const DEFAULT_RPC = process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.praxismarket.store/rpc";
export const DEFAULT_PLUGIN_RPC = process.env.NEXT_PUBLIC_PLUGIN_RPC_URL || "https://rpc.praxismarket.store/plugin";

export function getRPC(): string {
  const h = typeof window !== "undefined" ? window.localStorage.getItem("praxis_rpc_host") : null;
  return h ? `http://${h}:50002` : DEFAULT_RPC;
}

export function getPluginRPC(): string {
  const h = typeof window !== "undefined" ? window.localStorage.getItem("praxis_plugin_rpc_host") : null;
  return h ? `http://${h}` : DEFAULT_PLUGIN_RPC;
}

export async function rpc<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10000);
  let r: Response;
  try {
    r = await fetch(getRPC() + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("RPC timed out after 10s: " + path);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export async function submitTxRPC(obj: Record<string, unknown>): Promise<string> {
  const d = await rpc<unknown>("/v1/tx", obj);
  if (typeof d === "string") {
    const t = d.replace(/^"|"$/g, "").trim();
    if (/^[0-9a-fA-F]{16,}$/.test(t)) return t;
    throw new Error("Node rejected tx: " + t);
  }
  const rec = (d || {}) as Record<string, unknown>;
  if (rec.error || rec.code || rec.msg || rec.message) {
    throw new Error("Node rejected tx: " + String(rec.msg || rec.message || rec.error || JSON.stringify(rec)));
  }
  return JSON.stringify(d);
}

export interface HeightInfo {
  height: number;
  networkId?: number;
  chainId?: number;
}

type BlkResp = {
  blockHeader?: {
    lastQuorumCertificate?: {
      header?: { chainId?: number; chainID?: number; networkID?: number; networkId?: number };
    };
  };
};

// Praxis chain id (node rejects any tx whose chainID != its Config.ChainId)
const FALLBACK_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 30);

async function discoverChain(height: number): Promise<{ chainId?: number; networkId?: number }> {
  // block at the current height is often not indexed yet (HTTP 400): 0 = latest indexed
  const heights = [0, height - 1, height - 2].filter((h, i, arr) => h >= 0 && arr.indexOf(h) === i);
  for (const h of heights) {
    try {
      const blk = await rpc<BlkResp>("/v1/query/block-by-height", { height: h });
      const hdr = blk?.blockHeader?.lastQuorumCertificate?.header;
      const chainId = hdr?.chainId ?? hdr?.chainID;
      if (chainId) return { chainId, networkId: hdr?.networkID ?? hdr?.networkId };
    } catch {
      // try next height
    }
  }
  return {};
}

// Seconds per block. Every countdown/date in the UI used a hard-coded 5s or 10s; measure it instead.
const PIN_BLOCK_SECS = Number(process.env.NEXT_PUBLIC_BLOCK_SECS) || 0; // >0 pins the value and skips measuring
let blockSecs = PIN_BLOCK_SECS || 10; // fallback = design block time of chain 30; the measured value overrides it
let blockSecsAt = 0;
let blockSecsMeasured = false;
const BLOCK_SECS_KEY = "praxis_block_secs";
try {
  // reuse the last measurement so a fresh page load doesn't fall back to the 5s guess
  const saved = typeof window !== "undefined" ? Number(window.localStorage.getItem(BLOCK_SECS_KEY)) : 0;
  if (saved > 0.5 && saved < 120) { blockSecs = saved; blockSecsMeasured = true; }
} catch { /* storage unavailable */ }
export function getBlockSecs(): number { return blockSecs; }
/** True once seconds/block came from the chain (or a previous measurement), not the 5s guess. */
export function blockSecsReady(): boolean { return blockSecsMeasured; }

async function measureBlockSecs(height: number): Promise<void> {
  if (PIN_BLOCK_SECS || height < 50 || Date.now() - blockSecsAt < 10 * 60_000) return;
  const span = Math.min(200, height - 2);
  try {
    const t = async (h: number) => {
      const b = await rpc<{ blockHeader?: { time?: number | string } }>("/v1/query/block-by-height", { height: h });
      return Number(b?.blockHeader?.time || 0);
    };
    const [t1, t0] = await Promise.all([t(height - 1), t(height - 1 - span)]);
    const secs = (t1 - t0) / span / 1e6; // header time is in microseconds
    if (secs > 0.5 && secs < 120) {
      blockSecs = secs; blockSecsAt = Date.now(); blockSecsMeasured = true;
      try { window.localStorage.setItem(BLOCK_SECS_KEY, String(secs)); } catch { /* ignore */ }
    }
  } catch { /* keep previous estimate */ }
}

export async function queryHeight(): Promise<HeightInfo> {
  const d = await rpc<{ height?: number | string; network_id?: number; networkID?: number }>(
    "/v1/query/height",
    {}
  );
  const height = Number(d.height || 0);
  const found = await discoverChain(height);
  const chainId = found.chainId ?? FALLBACK_CHAIN_ID;
  const networkId = found.networkId ?? d.network_id ?? d.networkID;
  setChainContext(height, chainId, networkId);
  void measureBlockSecs(height);
  return { height, networkId, chainId };
}

export async function queryAccount(address: string): Promise<{ amount?: string | number }> {
  return rpc<{ amount?: string | number }>("/v1/query/account", { address });
}

// Call this on app startup to populate chain context
export async function initChainContext(): Promise<void> {
  try {
    await queryHeight();
  } catch (e) {
    console.warn("Failed to init chain context:", e);
  }
}
