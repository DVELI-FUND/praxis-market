"use client";
import { useWallet } from "@/store/wallet";
import { yesPct, extractOutcomes } from "@/lib/markets";
import type { MarketDetail } from "@/lib/detail";

interface Props {
  market: MarketDetail;
  outcome: boolean;
  onOutcome: (v: boolean) => void;
  onScrollToTicket: () => void;
}

export default function MobileTradeBar({ market, outcome, onOutcome, onScrollToTicket }: Props) {
  const { status } = useWallet();
  const connected = status === "connected" || status === "drift";
  const outLbl = extractOutcomes(market.rules || "");
  const pct = yesPct(market);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-line bg-surface-grad p-3 md:hidden">
      <div className="mx-auto max-w-[980px]">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              onOutcome(true);
              onScrollToTicket();
            }}
            className={`rounded-card border-2 py-3 font-mono text-[13px] font-bold transition-all ${
              outcome ? "border-up bg-up/10 text-up" : "border-line text-ink-3"
            }`}
          >
            {outLbl.yes} {pct}¢
          </button>
          <button
            onClick={() => {
              onOutcome(false);
              onScrollToTicket();
            }}
            className={`rounded-card border-2 py-3 font-mono text-[13px] font-bold transition-all ${
              !outcome ? "border-up bg-up/10 text-up" : "border-line text-ink-3"
            }`}
          >
            {outLbl.no} {100 - pct}¢
          </button>
        </div>
        {!connected && (
          <div className="mt-2 text-center font-mono text-[11px] text-ink-3">
            Connect wallet to trade
          </div>
        )}
      </div>
    </div>
  );
}
