"use client";
import { useMemo, useState } from "react";
import { useWallet } from "@/store/wallet";
import { useHeight } from "@/hooks/useHeight";
import { useToast } from "@/store/toast";
import { showConfirm } from "@/store/confirm";
import { buildSigned, friendlyError, TYPE_URLS, waitForConfirmation } from "@/lib/tx";
import { encPredict } from "@/lib/proto";
import { submitTxRPC } from "@/lib/rpc";
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

  // Ported from legacy updatePredictBreakdown
  const bd = useMemo(() => {
    const tradeCost = shares;
    const creatorFee = Math.ceil(shares * 0.01);
    const resolverFee = Math.ceil(shares * 0.01);
    const total = tradeCost + creatorFee + resolverFee;
    const maxCost = Math.ceil(total * (1 + slip / 100));
    return { tradeCost, creatorFee, resolverFee, maxCost };
  }, [shares, slip]);

  // COI-3 position cap: 20% of pool (ported from checkPositionCap)
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

  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <div className="mb-3 border-b border-line pb-2 font-mono text-[9px] uppercase tracking-[2px] text-ink-3">
        // submit_prediction
      </div>

      <div className="mb-2">
        <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-2">Bettor Address</div>
        <input
          readOnly
          value={praxisAddress || ""}
          placeholder="connect wallet"
          className="w-full rounded-card border border-line-2 bg-bg px-3 py-2 font-mono text-[11px] text-ink outline-none"
        />
      </div>

      <div className="mb-2">
        <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-2">Outcome</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setOutcome(true)}
            className={`rounded-card border py-2 font-display text-[11px] font-bold transition-colors ${
              outcome ? "border-up bg-up-dim text-up" : "border-line text-ink-3 hover:text-ink-2"
            }`}
          >
            YES
          </button>
          <button
            onClick={() => setOutcome(false)}
            className={`rounded-card border py-2 font-display text-[11px] font-bold transition-colors ${
              !outcome ? "border-down bg-down-dim text-down" : "border-line text-ink-3 hover:text-ink-2"
            }`}
          >
            NO
          </button>
        </div>
      </div>

      <div className="mb-2">
        <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-2">Shares (PRX)</div>
        <input
          type="number"
          value={shares}
          min={1}
          onChange={(e) => setShares(parseInt(e.target.value) || 0)}
          className="w-full rounded-card border border-line-2 bg-bg px-3 py-2 font-mono text-[12px] text-ink outline-none focus:border-up"
        />
        <div className="mt-0.5 font-mono text-[9px] text-ink-3">Min 1 PRX</div>
      </div>

      <div className="mb-2">
        <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-2">
          Slippage <span className="text-up">{slip.toFixed(1)}%</span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          step={0.5}
          value={slip}
          onChange={(e) => setSlip(parseFloat(e.target.value))}
          className="w-full accent-[#00e87a]"
        />
      </div>

      <div className="mb-2">
        <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-2">Max Cost (PRX)</div>
        <input
          readOnly
          value={bd.maxCost}
          className="w-full rounded-card border border-line-2 bg-bg px-3 py-2 font-mono text-[12px] text-ink opacity-60 outline-none"
        />
      </div>

      <div className="mb-2">
        <div className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-ink-2">Fee (uPRX)</div>
        <input
          type="number"
          value={fee}
          onChange={(e) => setFee(parseInt(e.target.value) || 10000)}
          className="w-full rounded-card border border-line-2 bg-bg px-3 py-2 font-mono text-[12px] text-ink outline-none focus:border-up"
        />
      </div>

      {/* breakdown — ported from updatePredictBreakdown */}
      <div className="mb-2 space-y-1 rounded-card border border-line bg-bg-2 p-2 font-mono text-[9px]">
        <div className="flex justify-between">
          <span className="text-ink-3">Trade cost</span>
          <span className="text-up">{bd.tradeCost.toLocaleString()} PRX</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-3">Market fee (2%)</span>
          <span className="text-ink-2">{(bd.creatorFee + bd.resolverFee).toLocaleString()} PRX</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-3">TX fee</span>
          <span className="text-ink-2">{fee.toLocaleString()} uPRX</span>
        </div>
        <div className="flex justify-between border-t border-line pt-1">
          <span className="text-ink">Max cost ({slip.toFixed(1)}% slippage)</span>
          <span className="text-up">{bd.maxCost.toLocaleString()} PRX</span>
        </div>
      </div>

      {/* COI-3 cap indicator */}
      {pool > 0n && (
        <div
          className={`mb-2 rounded-card border p-2 font-mono text-[9px] ${
            over ? "border-down/40 bg-down-dim text-down" : "border-up/20 bg-up-dim text-ink-2"
          }`}
        >
          {over
            ? `⚠ Exceeds 20% position cap — max ${cap / 1000000n} PRX remaining`
            : `Position cap: 20% of pool (${cap / 1000000n} PRX)`}
        </div>
      )}

      <button
        onClick={() => void submit()}
        disabled={pending || over || !connected}
        className="w-full rounded-card bg-up py-2.5 font-sans text-[12px] font-bold text-black transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "▪▪▪ broadcasting…" : "⚡ Sign & Submit"}
      </button>
      {!connected && (
        <div className="mt-1.5 text-center font-mono text-[9px] text-ink-3">connect wallet to trade</div>
      )}
    </div>
  );
}
