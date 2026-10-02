"use client";
import { useState, useMemo } from "react";
import { useWallet } from "@/store/wallet";
import { useHeight } from "@/hooks/useHeight";
import { useToast } from "@/store/toast";
import { useQueryClient } from "@tanstack/react-query";
import { buildSigned, friendlyError, TYPE_URLS, waitForConfirmation } from "@/lib/tx";
import { encPredict } from "@/lib/proto";
import { submitTxRPC } from "@/lib/rpc";
import { extractOutcomes, yesPct } from "@/lib/markets";
import { fmtPRX } from "@/lib/format";
import type { Market } from "@/lib/markets";

interface Props {
  market: Market | null;
  onClose?: () => void;
}

export default function TradeRail({ market, onClose }: Props) {
  const { status, praxisAddress, privKey, pubKey } = useWallet();
  const { data: chain } = useHeight();
  const toast = useToast((s) => s.show);
  const queryClient = useQueryClient();
  
  const [outcome, setOutcome] = useState<boolean>(true); // true = YES
  const [amount, setAmount] = useState(10);
  const [pending, setPending] = useState(false);

  if (!market) return null;

  const connected = status === "connected" || status === "drift";
  const outLbl = extractOutcomes(market.rules || "");
  const pct = yesPct(market);
  const currentPrice = outcome ? pct : 100 - pct;

  const cost = useMemo(() => {
    const shares = amount;
    const creatorFee = Math.ceil(shares * 0.01);
    const resolverFee = Math.ceil(shares * 0.01);
    const price = currentPrice / 100;
    const baseCost = Math.ceil(shares * price);
    const totalCost = baseCost + creatorFee + resolverFee;
    const toWin = shares - baseCost;
    return { baseCost, creatorFee, resolverFee, totalCost, toWin };
  }, [amount, currentPrice]);

  const handleSubmit = async () => {
    if (!connected || !praxisAddress || !privKey || !pubKey || !chain) {
      toast("Connect wallet first", true);
      return;
    }

    setPending(true);
    try {
      const inner = encPredict(
        market.marketId,
        praxisAddress,
        outcome,
        BigInt(amount) * 1000000n,
        BigInt(cost.totalCost) * 1000000n
      );
      const tx = await buildSigned(privKey, pubKey, "submit_prediction", TYPE_URLS.submit_prediction, inner, {
        fee: 10000,
        height: chain.height,
        netId: chain.networkId,
        chainId: chain.chainId,
      });
      const hash = await submitTxRPC(tx);
      toast("Submitting transaction…");
      const res = await waitForConfirmation(praxisAddress, hash);
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["markets"] });
        queryClient.invalidateQueries({ queryKey: ["position", market.marketId, praxisAddress] });
        toast(`✓ Position confirmed: +${fmtPRX(amount)} shares ${outcome ? outLbl.yes : outLbl.no} @ ${currentPrice}¢`);
        setAmount(10);
      } else {
        toast(res.message, true);
      }
    } catch (e) {
      toast(friendlyError(null, e instanceof Error ? e.message : String(e)), true);
    } finally {
      setPending(false);
    }
  };

  const chips = [10, 50, 100, 1000];

  return (
    <div className="rounded-card border border-line bg-surface-grad shadow-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-3">
        <span className="font-mono text-[13px] uppercase tracking-[2px] text-ink-3">Trade</span>
        {onClose && (
          <button onClick={onClose} className="font-mono text-[13px] text-ink-3 hover:text-ink">✕</button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Outcome buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setOutcome(true)}
            className={`rounded-card border-2 py-3 font-mono text-[14px] font-bold transition-all ${
              outcome ? "border-up bg-up/10 text-up" : "border-line text-ink-3"
            }`}
          >
            {outLbl.yes} {pct}¢
          </button>
          <button
            onClick={() => setOutcome(false)}
            className={`rounded-card border-2 py-3 font-mono text-[14px] font-bold transition-all ${
              !outcome ? "border-up bg-up/10 text-up" : "border-line text-ink-3"
            }`}
          >
            {outLbl.no} {100 - pct}¢
          </button>
        </div>

        {/* Amount input */}
        <div>
          <div className="mb-1.5 font-mono text-[13px] text-ink-3">Amount (PRX)</div>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
            className="w-full rounded-card border border-line bg-surface px-3 py-2.5 font-mono text-[15px] text-ink outline-none focus:border-up"
            placeholder="0"
          />
          <div className="mt-2 flex gap-1.5">
            {chips.map((c) => (
              <button
                key={c}
                onClick={() => setAmount(c)}
                className={`flex-1 rounded-card border py-1.5 font-mono text-[12px] font-bold transition-all ${
                  amount === c ? "border-up bg-up/10 text-up" : "border-line text-ink-3 hover:border-ink-2"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Cost breakdown */}
        <div className="space-y-1.5 rounded-card border border-line bg-surface p-3">
          <div className="flex justify-between font-mono text-[13px]">
            <span className="text-ink-3">Base cost</span>
            <span className="text-ink">{cost.baseCost} PRX</span>
          </div>
          <div className="flex justify-between font-mono text-[13px]">
            <span className="text-ink-3">Fees (2%)</span>
            <span className="text-ink">{cost.creatorFee + cost.resolverFee} PRX</span>
          </div>
          <div className="flex justify-between border-t border-line pt-1.5 font-mono text-[14px] font-bold">
            <span className="text-ink-3">Total</span>
            <span className="text-ink">{cost.totalCost} PRX</span>
          </div>
          <div className="flex justify-between font-mono text-[13px]">
            <span className="text-ink-3">To win</span>
            <span className="text-up">{cost.toWin} PRX</span>
          </div>
        </div>

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={pending || amount <= 0}
          className="w-full rounded-card bg-up py-3 font-display text-[15px] font-bold text-black transition-all hover:bg-up/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Submitting…" : connected ? `Buy ${outcome ? outLbl.yes : outLbl.no}` : "Connect wallet"}
        </button>
      </div>
    </div>
  );
}
