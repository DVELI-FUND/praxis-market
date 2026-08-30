"use client";
import { useMemo, useState } from "react";
import { useWallet } from "@/store/wallet";
import { useHeight } from "@/hooks/useHeight";
import { useToast } from "@/store/toast";
import { showConfirm } from "@/store/confirm";
import { buildSigned, friendlyError, TYPE_URLS, waitForConfirmation } from "@/lib/tx";
import { encPredict } from "@/lib/proto";
import { submitTxRPC } from "@/lib/rpc";
import { yesPct } from "@/lib/markets";
import type { MarketDetail } from "@/lib/detail";

interface Props {
  market: MarketDetail;
}

export default function PredictPanel({ market }: Props) {
  const { status, praxisAddress, privKey, pubKey } = useWallet();
  const { data: chain } = useHeight();
  const toast = useToast((s) => s.show);

  const [outcome, setOutcome] = useState(true);
  const [shares, setShares] = useState(1);
  const [slip, setSlip] = useState(5);
  const [fee, setFee] = useState(10000);
  const [pending, setPending] = useState(false);

  const connected = status === "connected" || status === "drift";
  const pct = yesPct(market);

  const bd = useMemo(() => {
    const tradeCost = shares;
    const creatorFee = Math.ceil(shares * 0.01);
    const resolverFee = Math.ceil(shares * 0.01);
    const total = tradeCost + creatorFee + resolverFee;
    const maxCost = Math.ceil(total * (1 + slip / 100));
    return { tradeCost, creatorFee, resolverFee, maxCost };
  }, [shares, slip]);

  const pool = market.qYes + market.qNo;
  const cap = pool > 0n ? (pool * 2000n) / 10000n : 0n;
  const over = pool > 0n && BigInt(bd.maxCost) > cap;

  const submit = async () => {
    if (!connected || !privKey || !pubKey || !praxisAddress) {
      toast("Connect wallet first", true);
      return;
    }
    if (!chain?.height) {
      toast("Node not connected", true);
      return;
    }
    if (shares < 1) {
      toast("Shares min 1 PRX", true);
      return;
    }
    const ok = await showConfirm("Submit Prediction", [
      ["Market ID", market.marketId.slice(0, 16) + "…", ""],
      ["Outcome", outcome ? "YES" : "NO", outcome ? "g" : "r"],
      ["Shares", shares.toLocaleString() + " PRX", ""],
      ["Max Cost", bd.maxCost.toLocaleString() + " PRX", ""],
    ]);
    if (!ok) return;

    setPending(true);
    try {
      const inner = encPredict(
        market.marketId,
        praxisAddress,
        outcome,
        BigInt(shares) * 1000000n,
        BigInt(bd.maxCost) * 1000000n
      );
      const tx = await buildSigned(privKey, pubKey, "submit_prediction", TYPE_URLS.submit_prediction, inner, {
        fee,
        height: chain.height,
        netId: chain.networkId,
        chainId: chain.chainId,
      });
      const hash = await submitTxRPC(tx);
      toast("⏳ Broadcasting — confirming in ~25s…");
      const res = await waitForConfirmation(praxisAddress, hash);
      toast(res.message, !res.ok);
    } catch (e) {
      toast(friendlyError(null, e instanceof Error ? e.message : String(e)), true);
    } finally {
      setPending(false);
    }
  };

  const inputCls =
    "w-full rounded-card border border-line-2 bg-bg px-3 py-2.5 font-mono text-[12px] text-ink outline-none transition-colors focus:border-up";

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface-grad shadow-card">
      <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-2.5">
        <span className="font-mono text-[9px] uppercase tracking-[2px] text-ink-3">// submit_prediction</span>
        <span className="flex items-center gap-1.5 font-mono text-[8px] text-up">
          <span className="h-1 w-1 rounded-full bg-up animate-pulseDot" /> live
        </span>
      </div>

      <div className="p-4">
        {/* outcome segmented */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => setOutcome(true)}
            className={`flex items-center justify-between rounded-card border px-3 py-2.5 transition-all ${
              outcome ? "border-up bg-up-dim shadow-glowUp" : "border-line opacity-50 hover:opacity-80"
            }`}
          >
            <span className="font-mono text-[10px] font-bold text-up">YES</span>
            <span className="font-display text-[15px] font-bold text-up tabular-nums">{pct}¢</span>
          </button>
          <button
            onClick={() => setOutcome(false)}
            className={`flex items-center justify-between rounded-card border px-3 py-2.5 transition-all ${
              !outcome ? "border-down bg-down-dim shadow-glowDown" : "border-line opacity-50 hover:opacity-80"
            }`}
          >
            <span className="font-mono text-[10px] font-bold text-down">NO</span>
            <span className="font-display text-[15px] font-bold text-down tabular-nums">{100 - pct}¢</span>
          </button>
        </div>

        <div className="mb-3">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-2">Shares (PRX)</div>
          <input type="number" value={shares} min={1} onChange={(e) => setShares(parseInt(e.target.value) || 0)} className={inputCls} />
        </div>

        <div className="mb-3">
          <div className="mb-1 flex justify-between font-mono text-[9px] uppercase tracking-[2px] text-ink-2">
            <span>Slippage</span>
            <span className="text-up">{slip.toFixed(1)}%</span>
          </div>
          <input type="range" min={1} max={10} step={0.5} value={slip} onChange={(e) => setSlip(parseFloat(e.target.value))} className="w-full accent-[#00e88a]" />
        </div>

        <div className="mb-3 space-y-1 rounded-card border border-line bg-bg-2 p-2.5 font-mono text-[9px]">
          <div className="flex justify-between"><span className="text-ink-3">Trade cost</span><span className="text-up">{bd.tradeCost.toLocaleString()} PRX</span></div>
          <div className="flex justify-between"><span className="text-ink-3">Market fee (2%)</span><span className="text-ink-2">{(bd.creatorFee + bd.resolverFee).toLocaleString()} PRX</span></div>
          <div className="flex justify-between"><span className="text-ink-3">TX fee</span><span className="text-ink-2">{fee.toLocaleString()} uPRX</span></div>
          <div className="flex justify-between border-t border-line pt-1"><span className="text-ink">Max cost</span><span className="text-up">{bd.maxCost.toLocaleString()} PRX</span></div>
        </div>

        {pool > 0n && (
          <div className={`mb-3 rounded-card border p-2 font-mono text-[9px] ${over ? "border-down/40 bg-down-dim text-down" : "border-up/20 bg-up-dim text-ink-2"}`}>
            {over ? `⚠ Exceeds 20% cap — max ${cap / 1000000n} PRX` : `20% position cap: ${cap / 1000000n} PRX`}
          </div>
        )}

        <button
          onClick={() => void submit()}
          disabled={pending || over || !connected}
          className="w-full rounded-card bg-up py-3 font-sans text-[13px] font-extrabold text-black shadow-glowUp transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "▪▪▪ broadcasting…" : `⚡ Buy ${outcome ? "YES" : "NO"} · ${bd.maxCost} PRX max`}
        </button>
        {!connected && <div className="mt-2 text-center font-mono text-[9px] text-ink-3">connect wallet to trade</div>}
      </div>
    </div>
  );
}
