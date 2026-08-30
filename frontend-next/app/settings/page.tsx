"use client";
import { useState } from "react";
import { useWallet } from "@/store/wallet";
import { useRoles } from "@/lib/roles";
import { useToast } from "@/store/toast";
import { DEFAULT_PLUGIN_RPC, DEFAULT_RPC } from "@/lib/rpc";

const inputCls =
  "w-full rounded-card border border-line-2 bg-bg px-3 py-2.5 font-mono text-[11px] text-ink outline-none transition-colors focus:border-up";

export default function SettingsPage() {
  const roles = useRoles();
  const { praxisAddress } = useWallet();
  const toast = useToast((s) => s.show);

  const [rpcHost, setRpcHost] = useState(() =>
    typeof window !== "undefined" ? window.localStorage.getItem("praxis_rpc_host") || "" : ""
  );
  const [pluginHost, setPluginHost] = useState(() =>
    typeof window !== "undefined" ? window.localStorage.getItem("praxis_plugin_rpc_host") || "" : ""
  );

  if (!roles.isAdmin) {
    return (
      <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
        <div className="rounded-card border border-line bg-surface p-6 text-center">
          <div className="mb-2 font-mono text-[20px] text-ink-3">locked</div>
          <div className="font-display text-[15px] font-extrabold">Not Authorized</div>
          <div className="mt-1 font-mono text-[10px] text-ink-3">Settings requires an authority address</div>
        </div>
      </main>
    );
  }

  const saveRpc = () => {
    if (rpcHost.trim()) window.localStorage.setItem("praxis_rpc_host", rpcHost.trim());
    else window.localStorage.removeItem("praxis_rpc_host");
    if (pluginHost.trim()) window.localStorage.setItem("praxis_plugin_rpc_host", pluginHost.trim());
    else window.localStorage.removeItem("praxis_plugin_rpc_host");
    toast("✓ Saved — reload to apply");
  };

  const authority = (process.env.NEXT_PUBLIC_AUTHORITY_ADDRESSES || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2.5 font-mono text-[9px] uppercase tracking-[3px] text-up">
          <span className="inline-block h-px w-5 bg-up" /> Admin
        </div>
        <h1 className="font-display text-[22px] font-extrabold tracking-[-0.3px]">Settings</h1>
        <p className="mt-1 text-[13px] text-ink-2">Node endpoints, authority & local data</p>
      </div>

      <div className="mx-auto max-w-[560px] space-y-3">
        <div className="rounded-card border border-line bg-surface-grad p-4 shadow-card">
          <div className="mb-3 border-b border-line pb-2 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">
            // node_rpc
          </div>
          <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-2">Node RPC host (blank = default)</div>
          <input value={rpcHost} onChange={(e) => setRpcHost(e.target.value)} placeholder="host → http://host:50002" className={inputCls} />
          <div className="mb-1 mt-3 font-mono text-[9px] uppercase tracking-[2px] text-ink-2">Plugin RPC host (blank = default)</div>
          <input value={pluginHost} onChange={(e) => setPluginHost(e.target.value)} placeholder="host[:port] → http://host" className={inputCls} />
          <div className="mt-2 font-mono text-[8px] leading-relaxed text-ink-3">
            default node: {DEFAULT_RPC}
            <br />
            default plugin: {DEFAULT_PLUGIN_RPC}
          </div>
          <button onClick={saveRpc} className="mt-3 w-full rounded-card bg-up py-2.5 font-sans text-[12px] font-extrabold text-black shadow-glowUp hover:brightness-110">
            Save endpoints
          </button>
        </div>

        <div className="rounded-card border border-line bg-surface-grad p-4 shadow-card">
          <div className="mb-3 border-b border-line pb-2 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">
            // authority
          </div>
          <div className="space-y-1 font-mono text-[10px]">
            <div className="flex justify-between">
              <span className="text-ink-3">Authority addresses</span>
              <span className="text-ink">{authority.length || "none (env not set)"}</span>
            </div>
            {authority.map((a) => (
              <div key={a} className="flex justify-between">
                <span className="text-ink-3">{a.slice(0, 10)}…{a.slice(-6)}</span>
                <span className={a.toLowerCase() === (praxisAddress || "").toLowerCase() ? "text-up" : "text-ink-3"}>
                  {a.toLowerCase() === (praxisAddress || "").toLowerCase() ? "● this wallet" : "○"}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 font-mono text-[8px] text-ink-3">
            NEXT_PUBLIC_AUTHORITY_ADDRESSES is baked at build time — change in Vercel → redeploy
          </div>
        </div>

        <div className="rounded-card border border-line bg-surface-grad p-4 shadow-card">
          <div className="mb-3 border-b border-line pb-2 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">
            // local_data
          </div>
          <button
            onClick={() => {
              window.localStorage.removeItem("praxis_bookmarks");
              toast("✓ Bookmarks cleared");
            }}
            className="w-full rounded-card border border-down/40 py-2 font-mono text-[10px] text-down transition-colors hover:bg-down-dim"
          >
            Clear bookmarks
          </button>
        </div>
      </div>
    </main>
  );
}
