"use client";
// Trade rail for the sports / esports boards. Delegates to PredictPanel so it uses the same
// LMSR quote, tx fee + creator/resolver fees, slippage buffer, 20% cap check, N-outcome support
// and open/expired gating as the market page (the old rail priced shares linearly and failed
// on-chain with "cost exceeds max cost").
import { useState } from "react";
import Link from "next/link";
import PredictPanel from "./PredictPanel";
import { stripCatPrefix } from "@/lib/markets";
import type { Market } from "@/lib/markets";

interface Props {
  market: Market | null;
  onClose?: () => void;
}

export default function TradeRail({ market, onClose }: Props) {
  const [outcome, setOutcome] = useState<boolean>(true);
  const [option, setOption] = useState(0);
  if (!market) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2 rounded-card border border-line bg-surface-grad p-3 shadow-card">
        <Link href={`/market/${market.marketId}`} className="line-clamp-2 font-sans text-[14px] font-semibold text-ink hover:text-up">
          {stripCatPrefix(market.question || market.rules || "")}
        </Link>
        {onClose && (
          <button onClick={onClose} aria-label="Close" className="shrink-0 rounded-card border border-line px-2 py-0.5 font-mono text-[12px] text-ink-3 hover:text-ink">
            ✕
          </button>
        )}
      </div>
      <PredictPanel
        key={market.marketId}
        market={market}
        outcome={outcome}
        onOutcome={setOutcome}
        selectedOption={option}
        onSelectOption={setOption}
      />
    </div>
  );
}
