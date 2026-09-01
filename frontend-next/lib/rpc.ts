// Praxis RPC layer — ported from Frontend/rpc.js (same endpoints, same 10s timeout).
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
  return typeof d === "string" ? d.replace(/^"|"$/g, "") : JSON.stringify(d);
}

export interface HeightInfo {
  height: number;
  networkId?: number;
  chainId?: number;
}

// Case/underscore-insensitive deep scan: finds "chainId" / "chain_id" / "chainID"
// / "networkID" / "network_id" anywhere in the response, at any nesting depth.
function dig(obj: unknown, want: string): number | undefined {
  if (obj === null || typeof obj !== "object") return undefined;
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const r = dig(v, want);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  const rec = obj as Record<string, unknown>;
  for (const [k, v] of Object.entries(rec)) {
    if (k.replace(/[^a-z0-9]/gi, "").toLowerCase() === want) {
      if (typeof v === "number") return v;
      if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
    }
  }
  for (const v of Object.values(rec)) {
    const r = dig(v, want);
    if (r !== undefined) return r;
  }
  return undefined;
}

// Mirrors legacy checkRPC: height + networkID from /v1/query/height,
// chainID + networkID from block-by-height → lastQuorumCertificate.header.
// dig() makes extraction robust to casing/nesting differences vs the old frontend.
export async function queryHeight(): Promise<HeightInfo> {
  const d = await rpc<unknown>("/v1/query/height", {});
  const height = dig(d, "height") ?? 0;
  let networkId = dig(d, "networkid");
  let chainId = dig(d, "chainid");
  try {
    const blk = await rpc<unknown>("/v1/query/block-by-height", { height });
    chainId = dig(blk, "chainid") ?? chainId;
    networkId = dig(blk, "networkid") ?? networkId;
  } catch {
    // chainId optional — encSignBytes falls back to 1
  }
  return { height, networkId, chainId };
}

export async function queryAccount(address: string): Promise<{ amount?: string | number }> {
  return rpc<{ amount?: string | number }>("/v1/query/account", { address });
}
