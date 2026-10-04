"use client";
import { useMemo, useState } from "react";
import { useWallet } from "@/store/wallet";
import { useQueryClient } from "@tanstack/react-query";
import { useHeight } from "@/hooks/useHeight";
import { useToast } from "@/store/toast";
import { showConfirm } from "@/store/confirm";
import { buildSigned, friendlyError, TYPE_URLS, waitForConfirmation } from "@/lib/tx";
import { encPredict } from "@/lib/proto";
import { submitTxRPC } from "@/lib/rpc";
import { extractOutcomes, yesPct, nPrices, binTradeCost, marketLiquidity } from "@/lib/markets";
import { nTradeCost } from "@/lib/nOutcome";
import { fmtPRX } from "@/lib/format";
import type { MarketDetail } from "@/lib/detail";

interface Props {
  market: MarketDetail;
  outcome: boolean;
  onOutcome: (v: boolean) => void;
  selectedOption?: number;
  onSelectOption?: (idx: number) => void;
}

export default function PredictPanel({ market, outcome, onOutcome, selectedOption: propSelectedOption, onSelectOption: propOnSelectOption }: Props) {
  const { status, praxisAddress, privKey, pubKey } = useWallet();
  const { data: chain } = useHeight();
  const toast = useToast((s) => s.show);
  const queryClient = useQueryClient();
  const outLbl = extractOutcomes(market.rules || "");
  const isNOutcome = market.options.length > 0;
  const [internalSelectedOption, setInternalSelectedOption] = useState(0);
  const selectedOption = propSelectedOption !== undefined ? propSelectedOption : internalSelectedOption;
  const setSelectedOption = propOnSelectOption !== undefined ? propOnSelectOption : setInternalSelectedOption;

  const [shares, setShares] = useState(1);
  const [slip, setSlip] = useState(2);
  const [fee] = useState(10000);
  const [pending, setPending] = useState(false);

  const connected = status === "connected" || status === "drift";
  const pct = isNOutcome ? 0 : yesPct(market);
  const nPricesArr = isNOutcome ? nPrices(market.q, market.b0) : [];

  // Quote straight from the LMSR the chain uses (price moves with size; fees are 1%+1% of TRADE COST, not of shares).
  const sharesU = BigInt(Math.max(0, shares)) * 1_000_000n; // chain share units; each winning N-outcome share pays 1 uPRX
  const bd = useMemo(() => {
    let cost = 0;
    if (sharesU > 0n) {
      cost = isNOutcome
        ? nTradeCost(market.q, market.b0, selectedOption, sharesU)
        : binTradeCost(market.qYes, market.qNo, market.b0, outcome, sharesU);
    }
    const tradeCost = Math.max(0, Math.ceil(cost));
    const creatorFee = Math.ceil(tradeCost * 0.01);
    const resolverFee = Math.ceil(tradeCost * 0.01);
    // chain checks tradeCost + txFee + creatorFee + resolverFee <= maxCost
    const maxCost = Math.ceil((tradeCost + creatorFee + resolverFee) * (1 + slip / 100)) + fee;
    let toWin = Number(sharesU); // N-outcome: 1 uPRX per winning share
    if (!isNOutcome) {
      // binary pays pro-rata from the pool: pool_after * mine / (side shares after)
      const side = outcome ? market.qYes : market.qNo;
      const poolAfter = Number(marketLiquidity(market)) + tradeCost;
      const denom = Number(side) + Number(sharesU);
      toWin = denom > 0 ? (poolAfter * Number(sharesU)) / denom : 0;
    }
    return { tradeCost, creatorFee, resolverFee, maxCost, toWin };
  }, [sharesU, slip, outcome, isNOutcome, selectedOption, market.q, market.b0, market.qYes, market.qNo, fee]);

  // Chain cap (checkPositionCapN / exceedsPositionCap): per-address shares <= 20% of the side's shares AFTER the trade
  // (N-outcome floor: b/2). Existing holdings add to the numerator on-chain; they are not known here.
  const sideAfter = isNOutcome
    ? (() => { const base = (market.q[selectedOption] ?? 0n) + sharesU; const floor = market.b0 / 2n; return base < floor ? floor : base; })()
    : (outcome ? market.qYes : market.qNo) + sharesU;
  const cap = (sideAfter * 2000n) / 10000n;
  const over = sharesU > 0n && sharesU > cap;

  const submit = async () => {
    if (!connected || !privKey || !pubKey || !praxisAddress) { toast("Connect wallet first", true); return; }
    if (!chain?.height) { toast("Node not connected", true); return; }
    if (shares < 1) { toast("Shares min 1 PRX", true); return; }

    const selectedLabel = isNOutcome ? market.options[selectedOption] : (outcome ? outLbl.yes : outLbl.no);
    
    const ok = await showConfirm("Submit Prediction", [
      ["Market ID", market.marketId.slice(0, 16) + "…", ""],
      ["Option", selectedLabel, "g"],
      ["Shares", shares.toLocaleString() + " PRX", ""],
      ["Max Cost", fmtPRX(bd.maxCost) + " PRX", ""],
    ]);
    if (!ok) return;

    setPending(true);
    try {
      // For N-outcome: pass outcomeIndex; for binary: pass outcome bool
      const inner = isNOutcome
        ? encPredict(market.marketId, praxisAddress, false, sharesU, BigInt(bd.maxCost), selectedOption)
        : encPredict(market.marketId, praxisAddress, outcome, sharesU, BigInt(bd.maxCost));
      
      const tx = await buildSigned(privKey, pubKey, "submit_prediction", TYPE_URLS.submit_prediction, inner, {
        fee, height: chain.height, netId: chain.networkId, chainId: chain.chainId,
      });
      const hash = await submitTxRPC(tx);
      toast("Submitting transaction…");
      const res = await waitForConfirmation(praxisAddress, hash);
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["market-txs", market.marketId] });
        queryClient.invalidateQueries({ queryKey: ["market", market.marketId] });
        queryClient.invalidateQueries({ queryKey: ["position", market.marketId, praxisAddress] });
        toast(`✓ Position confirmed: +${fmtPRX(shares)} shares ${selectedLabel}`);
      } else {
        toast(res.message, true);
      }
    } catch (e) {
      toast(friendlyError(null, e instanceof Error ? e.message : String(e)), true);
    } finally {
      setPending(false);
    }
  };

  const inputCls = "w-full rounded-card border border-line-2 bg-bg px-3 py-2.5 font-mono text-[14px] text-ink outline-none transition-colors focus:border-up";

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface-grad shadow-card">
      <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-2.5">
        <span className="font-mono text-[11px] uppercase tracking-[2px] text-ink-3">// submit_prediction</span>
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-up">
          <span className="h-1 w-1 rounded-full bg-up animate-pulseDot" /> live
        </span>
      </div>

      <div className="p-4">
        {isNOutcome ? (
          // N-outcome: show all options as radio buttons
          <div className="mb-3 space-y-2">
            {market.options.map((opt, idx) => {
              const price = Math.round(nPricesArr[idx] * 100);
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedOption(idx)}
                  className={`flex w-full items-center justify-between rounded-card border px-3 py-2.5 transition-all ${
                    selectedOption === idx ? "border-up bg-up-dim shadow-glowUp" : "border-line opacity-50 hover:opacity-80"
                  }`}
                >
                  <span className="max-w-[55%] truncate font-mono text-[12px] font-bold text-up">{opt}</span>
                  <span className="font-display text-[16px] font-bold text-up tabular-nums">{price}¢</span>
                </button>
              );
            })}
          </div>
        ) : (
          // Binary market: YES/NO toggle
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button onClick={() => onOutcome(true)} className={`flex items-center justify-between rounded-card border px-3 py-2.5 transition-all ${outcome ? "border-up bg-up-dim shadow-glowUp" : "border-line opacity-50 hover:opacity-80"}`}>
              <span className="max-w-[55%] truncate font-mono text-[12px] font-bold text-up">{outLbl.yes}</span>
              <span className="font-display text-[16px] font-bold text-up tabular-nums">{pct}¢</span>
            </button>
            <button onClick={() => onOutcome(false)} className={`flex items-center justify-between rounded-card border px-3 py-2.5 transition-all ${!outcome ? "border-down bg-down-dim shadow-glowDown" : "border-line opacity-50 hover:opacity-80"}`}>
              <span className="max-w-[55%] truncate font-mono text-[12px] font-bold text-down">{outLbl.no}</span>
              <span className="font-display text-[16px] font-bold text-down tabular-nums">{100 - pct}¢</span>
            </button>
          </div>
        )}

        <div className="mb-3">
          <div className="mb-1 font-mono text-[11px] uppercase tracking-[2px] text-ink-2">Shares (payout in PRX)</div>
          <input type="number" value={shares} min={1} onChange={(e) => setShares(parseInt(e.target.value) || 0)} className={inputCls} />
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {[10, 50, 100, 500].map((v) => (
              <button key={v} onClick={() => setShares(v)} className="rounded-card border border-line bg-bg-2 py-1.5 font-mono text-[12px] text-ink-2 transition-colors hover:border-up hover:text-up">
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <div className="mb-1 flex justify-between font-mono text-[11px] uppercase tracking-[2px] text-ink-2">
            <span>Execution</span>
            <span className="text-up">{slip.toFixed(1)}% max impact</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[{ l: "Tight", v: 0.5 }, { l: "Bal", v: 2 }, { l: "Std", v: 5 }, { l: "Fast", v: 10 }].map((o) => (
              <button
                key={o.v}
                onClick={() => setSlip(o.v)}
                className={`rounded-card border py-1.5 font-mono text-[11px] transition-colors ${
                  slip === o.v ? "border-up bg-up-dim font-bold text-up" : "border-line bg-bg-2 text-ink-3 hover:border-up hover:text-up"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3 space-y-1 rounded-card border border-line bg-bg-2 p-2.5 font-mono text-[11px]">
          <div className="flex justify-between"><span className="text-ink-3">Trade cost</span><span className="text-up">{fmtPRX(bd.tradeCost)} PRX</span></div>
          <div className="flex justify-between"><span className="text-ink-3">Market fee (2%)</span><span className="text-ink-2">{fmtPRX(bd.creatorFee + bd.resolverFee)} PRX</span></div>
          <div className="flex justify-between"><span className="text-ink-3">TX fee</span><span className="text-ink-2">{fee.toLocaleString()} uPRX</span></div>
          <div className="flex justify-between border-t border-line pt-1"><span className="text-ink">Max cost</span><span className="text-up">{fmtPRX(bd.maxCost)} PRX</span></div>
          <div className="flex justify-between border-t border-line pt-1"><span className="text-ink">To Win</span><span className="text-cyanx">{fmtPRX(bd.toWin)} PRX</span></div>
        </div>

        {sharesU > 0n && (
          <div className={`mb-3 rounded-card border p-2 font-mono text-[11px] ${over ? "border-down/40 bg-down-dim text-down" : "border-up/20 bg-up-dim text-ink-2"}`}>
            {over ? `⚠ Exceeds 20% cap — max ${fmtPRX(cap)} shares` : `20% position cap: ${fmtPRX(cap)} shares`}
          </div>
        )}

        <button onClick={() => void submit()} disabled={pending || over || !connected} className="w-full rounded-card bg-up py-3 font-sans text-[15px] font-extrabold text-black shadow-glowUp transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
          {pending ? "▪▪▪ broadcasting…" : `⚡ Buy ${isNOutcome ? market.options[selectedOption] : (outcome ? outLbl.yes : outLbl.no)} · ${fmtPRX(bd.maxCost)} PRX max`}
        </button>
        {!connected && <div className="mt-2 text-center font-mono text-[11px] text-ink-3">connect wallet to trade</div>}
      </div>
    </div>
  );
}
