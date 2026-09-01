import { setChainContext } from "./chainContext";

export const DEFAULT_RPC = "https://prax.val-a.grad.dev.app.canopynetwork.org/rpc";
export const DEFAULT_PLUGIN_RPC = "https://prax.val-a.grad.dev.app.canopynetwork.org/plugin";

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

// Mirrors old frontend's checkRPC: populate global store with height/networkId/chainId
export async function queryHeight(): Promise<HeightInfo> {
  const d = await rpc<{ height?: number | string; network_id?: number; networkID?: number }>(
    "/v1/query/height",
    {}
  );
  const height = Number(d.height || 0);
  let networkId = d.network_id ?? d.networkID;
  let chainId: number | undefined;
  
  try {
    const blk = await rpc<{
      blockHeader?: {
        lastQuorumCertificate?: {
          header?: { chainId?: number; chainID?: number; networkID?: number; networkId?: number };
        };
      };
    }>("/v1/query/block-by-height", { height });
    const hdr = blk?.blockHeader?.lastQuorumCertificate?.header;
    if (hdr) {
      chainId = hdr.chainId ?? hdr.chainID;
      networkId = hdr.networkID ?? hdr.networkId ?? networkId;
    }
  } catch {
    // block-by-height may fail — use what we have
  }
  
  // Populate global store (mirrors old frontend's window.currentHeight/ChainID/NetworkID)
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
