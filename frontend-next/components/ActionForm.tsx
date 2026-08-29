"use client";
import { useEffect, useState } from "react";
import type { ActionDef, Vals } from "@/lib/actions";
import { useWallet } from "@/store/wallet";
import { useHeight } from "@/hooks/useHeight";
import { useRoles } from "@/lib/roles";
import { useMyResolver, MIN_RESOLVER_STAKE } from "@/lib/resolvers";
import { showConfirm } from "@/store/confirm";
import { signAndBroadcast } from "@/lib/broadcast";
import { TYPE_URLS } from "@/lib/tx";
import { useToast } from "@/store/toast";
import { fmtPRX } from "@/lib/format";
import ResolverStatusCard from "./ResolverStatusCard";

const CATS = ["crypto", "sports", "politics", "finance", "other"];

function validateField(def: ActionDef, v: Vals): string | null {
  for (const f of def.fields) {
    const val = v[f.id];
    if (f.type === "wallet" && !val) return "Connect wallet first";
    if ((f.type === "addr" || f.type === "mid") && !/^[0-9a-f]{40}$/.test(String(val ?? "")))
      return `${f.label} must be 40 hex chars`;
    if (f.type === "hash64" && !/^[0-9a-f]{64}$/.test(String(val ?? "")))
      return `${f.label} must be 64 hex chars`;
    if (f.type === "number" && f.min !== undefined && Number(val) < f.min)
      return `${f.label} min ${f.min}`;
    if (f.type === "text" && f.id === "question" && !String(val ?? "").trim())
      return "Question required";
  }
  return def.validate ? def.validate(v) : null;
}

export default function ActionForm({ def }: { def: ActionDef }) {
  const { status, praxisAddress, privKey, pubKey } = useWallet();
  const { data: chain } = useHeight();
  const roles = useRoles();
  const myResolver = useMyResolver();
  const connected = status === "connected" || status === "drift";

  const [vals, setVals] = useState<Vals>(() => {
    const init: Vals = {};
    for (const f of def.fields) {
      if (f.type === "number") init[f.id] = f.def ?? 0;
      else if (f.type === "outcome") init[f.id] = true;
      else if (f.type === "cat") init[f.id] = "crypto";
      else init[f.id] = "";
    }
    return init;
  });
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!praxisAddress) return;
    setVals((prev) => {
      const next = { ...prev };
      for (const f of def.fields) if (f.type === "wallet") next[f.id] = praxisAddress;
      return next;
    });
  }, [praxisAddress, def]);

  const gated =
    (def.gate === "resolver" && !roles.isResolver) ||
    (def.gate === "admin" && !roles.isAdmin && !roles.isCreator) ||
    (def.gate === "creator" && !roles.isCreator && !roles.isAdmin);

  const set = (id: string, val: string | number | boolean) => setVals((p) => ({ ...p, [id]: val }));

  // Protocol guards for unstake (handler_unstake_resolver.go)
  const unstakeBlocked =
    def.key === "unstake" && myResolver !== null && (myResolver.unbonding > 0n || !myResolver.active);

  const submit = async () => {
    const toast = useToast.getState().show;
    const err = validateField(def, vals);
    if (err) {
      toast(err, true);
      return;
    }
    if (!connected || !privKey || !pubKey || !praxisAddress || !chain?.height) return;

    if (def.key === "unstake" && myResolver) {
      if (myResolver.unbonding > 0n) {
        toast(`Unbonding already pending — claim after #${myResolver.releaseHeight}`, true);
        return;
      }
      if (!myResolver.active) {
        toast("Resolver not active", true);
        return;
      }
      const amtU = BigInt(Math.floor(Number(vals.amount) || 0));
      if (amtU > 0n && amtU < myResolver.stake && myResolver.stake - amtU < MIN_RESOLVER_STAKE) {
        toast(`Partial unstake must leave ≥ ${fmtPRX(MIN_RESOLVER_STAKE)} PRX staked`, true);
        return;
      }
    }

    const rows = def.fields
      .filter((f) => f.type !== "wallet" && f.id !== "fee")
      .map((f): [string, string, string?] => {
        const v = vals[f.id];
        if (f.type === "outcome") return [f.label, v ? "YES" : "NO", v ? "g" : "r"];
        if (f.scale) return [f.label, Number(v).toLocaleString() + " PRX", ""];
        return [f.label, String(v).slice(0, 24) || "—", ""];
      });
    const ok = await showConfirm(def.title, rows);
    if (!ok) return;

    setPending(true);
    try {
      const inner = def.build(vals, { wallet: praxisAddress, height: chain.height });
      await signAndBroadcast({
        privKey,
        pubKey,
        address: praxisAddress,
        height: chain.height,
        netId: chain.networkId,
        chainId: chain.chainId,
        msgType: def.msgType,
        typeUrl: TYPE_URLS[def.msgType],
        inner,
        fee: Number(vals.fee) || 10000,
      });
    } finally {
      setPending(false);
    }
  };

  if (gated) {
    return (
      <div className="rounded-card border border-line bg-surface p-6 text-center">
        <div className="mb-2 font-mono text-[20px] text-ink-3">locked</div>
        <div className="font-display text-[15px] font-extrabold">Not Authorized</div>
        <div className="mt-1 font-mono text-[10px] text-ink-3">
          This address is not registered for {def.gate} actions
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="mb-4 border-b border-line pb-2.5 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">
        // {def.msgType}
      </div>

      {def.statusCard === "resolver" && <ResolverStatusCard />}

      {def.fields.map((f) => (
        <div key={f.id} className="mb-2.5">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-2">{f.label}</div>
          {f.type === "outcome" ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => set(f.id, true)}
                className={`rounded-card border py-2 font-display text-[11px] font-bold ${
                  vals[f.id] ? "border-up bg-up-dim text-up" : "border-line text-ink-3"
                }`}
              >
                YES
              </button>
              <button
                onClick={() => set(f.id, false)}
                className={`rounded-card border py-2 font-display text-[11px] font-bold ${
                  !vals[f.id] ? "border-down bg-down-dim text-down" : "border-line text-ink-3"
                }`}
              >
                NO
              </button>
            </div>
          ) : f.type === "cat" ? (
            <div className="flex flex-wrap gap-1.5">
              {CATS.map((c) => (
                <button
                  key={c}
                  onClick={() => set(f.id, c)}
                  className={`rounded-full border px-3 py-1 font-mono text-[10px] ${
                    vals[f.id] === c ? "border-up bg-up text-black" : "border-line text-ink-2"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          ) : (
            <input
              type={f.type === "number" ? "number" : "text"}
              readOnly={f.type === "wallet"}
              value={String(vals[f.id] ?? "")}
              onChange={(e) =>
                set(f.id, f.type === "number" ? parseInt(e.target.value) || 0 : e.target.value)
              }
              className={`w-full rounded-card border border-line-2 bg-bg px-3 py-2 font-mono text-[12px] text-ink outline-none focus:border-up ${
                f.type === "wallet" ? "opacity-60" : ""
              }`}
            />
          )}
          {f.hint && <div className="mt-0.5 font-mono text-[9px] text-ink-3">{f.hint}</div>}
        </div>
      ))}

      {def.key === "unstake" && myResolver && myResolver.stake > 0n && (
        <div className="mb-2.5 flex gap-1.5">
          <button
            onClick={() =>
              set(
                "amount",
                Number(
                  (myResolver.stake > MIN_RESOLVER_STAKE
                    ? myResolver.stake - MIN_RESOLVER_STAKE
                    : 0n) / 1000000n
                )
              )
            }
            className="flex-1 rounded-card border border-line px-2 py-1.5 font-mono text-[9px] text-ink-2 transition-colors hover:border-up hover:text-up"
          >
            Max partial ({fmtPRX(myResolver.stake > MIN_RESOLVER_STAKE ? myResolver.stake - MIN_RESOLVER_STAKE : 0n)})
          </button>
          <button
            onClick={() => set("amount", 0)}
            className="flex-1 rounded-card border border-line px-2 py-1.5 font-mono text-[9px] text-ink-2 transition-colors hover:border-amberx hover:text-amberx"
          >
            Full exit (0)
          </button>
        </div>
      )}

      {def.key === "register" && myResolver && (
        <div className="mb-2.5 rounded-card border border-line bg-bg-2 p-2 font-mono text-[9px] text-ink-3">
          Existing record — new stake tops up current {fmtPRX(myResolver.stake)} PRX (total must be ≥{" "}
          {fmtPRX(MIN_RESOLVER_STAKE)})
        </div>
      )}

      <button
        onClick={() => void submit()}
        disabled={pending || !connected || unstakeBlocked}
        className="mt-2 w-full rounded-card bg-up py-2.5 font-sans text-[12px] font-bold text-black transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "▪▪▪ broadcasting…" : "⚡ Sign & Submit"}
      </button>
      {unstakeBlocked && myResolver && (
        <div className="mt-1.5 text-center font-mono text-[9px] text-amberx">
          {myResolver.unbonding > 0n
            ? `unbonding pending — claim available at #${myResolver.releaseHeight}`
            : "resolver inactive — re-register to stake again"}
        </div>
      )}
      {!connected && (
        <div className="mt-1.5 text-center font-mono text-[9px] text-ink-3">connect wallet to sign</div>
      )}
    </div>
  );
}
