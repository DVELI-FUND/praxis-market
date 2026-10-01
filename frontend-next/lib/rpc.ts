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
