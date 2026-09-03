"use client";
import { useEffect, useState , useMemo} from "react";
import type { ActionDef, Vals } from "@/lib/actions";
import { datetimeToBlock } from "@/lib/actions";
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
import UnstakePlanner from "./UnstakePlanner";
import { b2b64 } from "@/lib/proto";
import { fetchMarkets, stripCatPrefix } from "@/lib/markets";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { normalizeBanner } from "@/lib/img";
import ResolutionPlanner from "./ResolutionPlanner";

const CATS: { key: string; label: string }[] = [
  { key: "crypto", label: "🟠 Crypto" },
  { key: "sports", label: "⚽ Sports" },
  { key: "politics", label: "🌐 Politics" },
  { key: "finance", label: "📈 Finance" },
  { key: "other", label: "👁 Other" },
];

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
  const queryClient = useQueryClient();
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
      else if (f.type === "datetime") init[f.id] = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16);
      else init[f.id] = "";
    }
    return init;
  });
  const [pending, setPending] = useState(false);
  // Create Market: silently store banner in Vercel Blob → permanent URL
  useEffect(() => {
    if (def.key !== "create") return;
    const u = String(vals.img ?? "").trim();
    if (!u || !/^https?:\/\//.test(u) || u.includes("vercel-storage.com")) return;
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/banner?url=" + encodeURIComponent(u));
        if (r.ok) {
          const j = (await r.json()) as { url?: string };
          if (j.url) set("img", j.url);
        }
      } catch {
        // keep original URL; render-time ladder still covers it
      }
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vals.img, def.key]);


  const [payload, setPayload] = useState("");
  const [imgLoaded, setImgLoaded] = useState(false);

  // Cancel Market: live list of THIS wallet's cancellable markets
  const { data: cancelList = [] } = useQuery({ queryKey: ["markets-cancel"], queryFn: fetchMarkets, staleTime: 15000, refetchOnMount: "always" });
  const { data: chChain } = useHeight();
  const mine = useMemo(() => (cancelList || []).filter((mm) => {
    const cr = String((mm as unknown as { creator?: string }).creator || "").toLowerCase();
    return cr === String(praxisAddress || "").toLowerCase() && mm.status === 1 && Number(mm.expiry) > (chChain?.height ?? 0);
  }), [cancelList, praxisAddress, chChain?.height]);

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
  const planAmtU = BigInt(Math.floor(Number(vals.amount) || 0)) * 1000000n;
  const planMinOk =
    !myResolver ||
    planAmtU === 0n ||
    planAmtU >= myResolver.stake ||
    myResolver.stake - planAmtU >= MIN_RESOLVER_STAKE;
  const unstakeBlocked =
    def.key === "unstake" &&
    myResolver !== null &&
    (myResolver.unbonding > 0n || !myResolver.active || !planMinOk);

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
      queryClient.invalidateQueries({ queryKey: ["markets-cancel"] });
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

  const buildPayload = () => {
    const toast = useToast.getState().show;
    const err = validateField(def, vals);
    if (err) {
      toast(err, true);
      return;
    }
    if (!chain?.height) {
      toast("Node not connected", true);
      return;
    }
    const inner = def.build(vals, { wallet: praxisAddress, height: chain.height });
    const unsigned = {
      message_type: def.msgType,
      msg: { type_url: TYPE_URLS[def.msgType], value: b2b64(inner) },
      signature: null,
      created_height: chain.height,
      time: Number(BigInt(Date.now()) * 1000n),
      fee: Number(vals.fee) || 10000,
      memo: "",
      network_id: chain.networkId ?? 1,
      chain_id: chain.chainId ?? 1,
    };
    setPayload(JSON.stringify(unsigned, null, 2));
    toast("✓ Unsigned payload built — copy for CLI signing");
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

      {def.statusCard === "resolver" && <ResolverStatusCard hideCta={def.key === "claimunbonded"} />}

      {def.planner && (
        <ResolutionPlanner
          mid={String(vals.mid ?? "")}
          mode={def.planner}
          wallet={praxisAddress}
          bondValue={Number(vals.bond) || 0}
          onBond={(n) => set("bond", n)}
        />
      )}

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
                  key={c.key}
                  onClick={() => set(f.id, c.key)}
                  className={`rounded-full border px-3 py-1 font-mono text-[10px] ${
                    vals[f.id] === c.key ? "border-up bg-up text-black" : "border-line text-ink-2"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          ) : f.type === "datetime" ? (
            <div>
              <input
                type="datetime-local"
                value={String(vals[f.id] ?? "")}
                onChange={(e) => set(f.id, e.target.value)}
                className="w-full rounded-card border border-line-2 bg-bg px-3 py-2 font-mono text-[12px] text-ink outline-none focus:border-up"
              />
              {String(vals[f.id] || "") && chain?.height ? (
                <div className="mt-1 rounded border border-amberx/40 bg-amberx/5 px-2 py-1 font-mono text-[9px] text-amberx">
                  Block #{datetimeToBlock(String(vals[f.id]), chain.height).toLocaleString()}
                  {" (~"}
                  {(() => {
                    const ms = new Date(String(vals[f.id])).getTime() - Date.now();
                    const d = Math.floor(ms / 86400000);
                    const h = Math.floor((ms % 86400000) / 3600000);
                    return d > 0 ? `${d}d ${h}h` : `${h}h`;
                  })()}
                  {" from now, "}
                  {(datetimeToBlock(String(vals[f.id]), chain.height) - chain.height).toLocaleString()}
                  {" blocks)"}
                </div>
              ) : null}
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

      {def.key === "unstake" && myResolver && (
        <UnstakePlanner
          rec={myResolver}
          amount={Number(vals.amount) || 0}
          onAmount={(n) => set("amount", n)}
          currentHeight={chain?.height ?? 0}
        />
      )}

      {def.key === "register" && myResolver && (
        <div className="mb-2.5 rounded-card border border-line bg-bg-2 p-2 font-mono text-[9px] text-ink-3">
          Existing record — new stake tops up current {fmtPRX(myResolver.stake)} PRX (total must be ≥{" "}
          {fmtPRX(MIN_RESOLVER_STAKE)})
        </div>
      )}

      {def.key === "create" && String(vals.img ?? "").trim() !== "" && (
        <div className="mb-2.5">
          <img
            src={normalizeBanner(String(vals.img))}
            alt=""
            className="h-40 w-full rounded-card border border-line object-cover"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgLoaded(false)}
          />
          {imgLoaded && <div className="mt-1 font-mono text-[9px] text-up">✓ Image loaded</div>}
        </div>
      )}

      {def.key === "create" && (
        <div className="mb-3 rounded-card border border-line bg-bg-2 p-3 font-mono text-[10px] text-ink-2">
          <div className="flex justify-between py-1">
            <span>B0 liquidity seed</span>
            <span className="text-up">{Number(vals.b0) || 0} PRX</span>
          </div>
          <div className="flex justify-between border-t border-line py-1">
            <span>Creator bond (locked)</span>
            <span>5,000 PRX</span>
          </div>
          <div className="flex justify-between border-t border-line py-1">
            <span>TX fee</span>
            <span>{(Number(vals.fee) || 10000).toLocaleString()} uPRX</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-line pt-2">
            <span>Total deducted</span>
            <span className="text-up">{((Number(vals.b0) || 0) + 5000).toLocaleString()} PRX</span>
          </div>
        </div>
      )}

      {def.key === "cancel" && (
        <div className="mb-3 rounded-card border border-line bg-bg-2 p-3 font-mono text-[10px] text-ink-2">
          <div className="mb-1 font-bold text-ink">Cancellation rules</div>
          <ul className="list-disc space-y-1 pl-4">
            <li>Only the wallet that created the market can cancel it.</li>
            <li>Only while live and before expiry.</li>
            <li>Creator bond (5,000 PRX) is returned on cancel.</li>
            <li>Cancellation is final — the market is voided.</li>
          </ul>
        </div>
      )}

      {def.key === "cancel" && (
        <div className="mb-3">
          <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">Your cancellable markets</div>
          {mine.length === 0 ? (
            <div className="rounded-card border border-line bg-bg-2 p-3 font-mono text-[10px] text-ink-3">No live markets created by this wallet.</div>
          ) : (
            <div className="space-y-1.5">
              {mine.map((mm) => (
                <button
                  key={mm.marketId}
                  type="button"
                  onClick={() => set("mid", mm.marketId)}
                  className={`flex w-full items-center gap-2 rounded-card border px-3 py-2 text-left font-sans text-[11px] transition-colors ${vals.mid === mm.marketId ? "border-up bg-up/10 text-ink" : "border-line bg-bg-2 text-ink-2 hover:border-line-2"}`}
                >
                  <span className="min-w-0 flex-1 truncate">{stripCatPrefix(mm.question || mm.rules)}</span>
                  <span className="shrink-0 font-mono text-[9px] text-amberx">{mm.marketId.slice(0, 6)}…</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-2 flex gap-1.5">
        <button
          onClick={() => void submit()}
          disabled={pending || !connected || unstakeBlocked}
          className="flex-1 rounded-card bg-up py-2.5 font-sans text-[12px] font-extrabold text-black shadow-glowUp transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "▪▪▪ broadcasting…" : "⚡ Sign & Submit"}
        </button>
        <button
          onClick={buildPayload}
          className="rounded-card border border-line-2 px-3 py-2.5 font-mono text-[10px] text-ink-2 transition-colors hover:border-up hover:text-up"
          title="Build unsigned payload"
        >
          ⎘ Payload
        </button>
      </div>
      {payload && (
        <textarea
          readOnly
          value={payload}
          rows={7}
          className="mt-2 w-full break-all rounded-card border border-line bg-bg p-2 font-mono text-[9px] text-ink-2 outline-none"
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
      {unstakeBlocked && myResolver && (
        <div className="mt-1.5 text-center font-mono text-[9px] text-amberx">
          {myResolver.unbonding > 0n
            ? (chain?.height ?? 0) >= myResolver.releaseHeight
              ? "unbonding released — claim it via Claim Unbonded Stake, then you can unstake again"
              : `unbonding pending — claim available at #${myResolver.releaseHeight}`
            : "resolver inactive — re-register to stake again"}
        </div>
      )}
      {!connected && (
        <div className="mt-1.5 text-center font-mono text-[9px] text-ink-3">connect wallet to sign</div>
      )}
    </div>
  );
}
