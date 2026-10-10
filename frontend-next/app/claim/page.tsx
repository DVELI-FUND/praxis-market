"use client";

import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/store/wallet";
import { usePositions } from "@/lib/positions";
import { useMarkets } from "@/hooks/useMarkets";
import { queryAccount } from "@/lib/rpc";
import LogoMark from "@/components/LogoMark";
import WalletPill from "@/components/WalletPill";
import { fmtPRX } from "@/lib/format";
import { STATUS, stripCatPrefix } from "@/lib/markets";
import { useState } from "react";

async function fetchBalance(addr: string): Promise<bigint> {
  try {
    const r = await queryAccount(addr);
    return BigInt(r?.amount || 0);
  } catch {
    return 0n;
  }
}

export default function ClaimWinningsPage() {
  const { praxisAddress } = useWallet();
  const { data: markets = [] } = useMarkets();
  const { data: positions = [] } = usePositions();
  const { data: balance = 0n } = useQuery({
    queryKey: ["balance", praxisAddress],
    queryFn: () => fetchBalance(praxisAddress as string),
    enabled: !!praxisAddress,
    staleTime: 15000,
    refetchInterval: 15000,
  });

  const [claiming, setClaiming] = useState<string | null>(null);

  if (!praxisAddress) {
    return (
      <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-12 pb-24 md:px-8">
        <div className="flex flex-col items-center gap-6 rounded-card border border-line bg-surface-grad p-12 text-center shadow-card">
          <LogoMark className="h-12 w-12 text-ink" />
          <div>
            <h1 className="font-display text-[24px] font-extrabold text-ink">Connect Wallet to Claim</h1>
            <p className="mt-2 font-mono text-[12px] text-ink-3">
              Link your wallet to view and claim your winnings from finalized markets
            </p>
          </div>
          <WalletPill size="lg" />
          <p className="max-w-[400px] font-mono text-[11px] leading-relaxed text-ink-3">
            Works with MetaMask, Rabby, Coinbase Wallet, and other EVM wallets. 
            One free signature — no gas fees, non-custodial.
          </p>
        </div>
      </main>
    );
  }

  // Filter for FINALIZED markets with unclaimed winning positions
  const claimablePositions = positions.filter((pos) => {
    if (pos.claimed) return false;
    const market = markets.find((m) => m.marketId === pos.marketId);
    if (!market) return false;
    return market.status === STATUS.FINALIZED;
  });

  // Calculate total claimable amount
  const totalClaimable = claimablePositions.reduce((total, pos) => {
    const market = markets.find((m) => m.marketId === pos.marketId);
    if (!market) return total;
    
    // For finalized markets, winning shares pay 1 PRX per share
    if (market.options.length > 0) {
      // N-outcome: find the winning option (highest q value indicates winner)
      let winningIdx = 0;
      let maxQ = market.q[0] || 0n;
      for (let i = 1; i < market.q.length; i++) {
        if (market.q[i] > maxQ) {
          maxQ = market.q[i];
          winningIdx = i;
        }
      }
      return total + (pos.shares[winningIdx] || 0n);
    } else {
      // Binary: determine winner from final q values
      const yesWins = market.qYes > market.qNo;
      return total + (yesWins ? pos.sharesYes : pos.sharesNo);
    }
  }, 0n);

  const handleClaim = async (marketId: string) => {
    setClaiming(marketId);
    try {
      // TODO: Integrate with actual claimWinnings RPC call
      alert("Claim functionality will be connected to the blockchain RPC. Market: " + marketId.slice(0, 8) + "...");
    } catch (error) {
      console.error("Claim failed:", error);
      alert("Claim failed. Please try again.");
    } finally {
      setClaiming(null);
    }
  };

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
      {/* Header */}
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[3px] text-up">
          <span className="inline-block h-px w-5 bg-up" /> Collect Payout
        </div>
        <h1 className="font-display text-[28px] font-extrabold tracking-[-0.5px] text-ink">
          Claim Winnings
        </h1>
        <p className="mt-2 font-sans text-[15px] text-ink-2">
          Winners receive 1 PRX per winning share. Claim anytime after finalization.
        </p>
      </div>

      {/* Total Claimable Card */}
      <div className="mb-8 rounded-card border border-line bg-surface-grad p-6 shadow-card">
        <div className="mb-2 font-mono text-[11px] uppercase tracking-[2px] text-ink-3">
          Total Claimable
        </div>
        <div className="flex items-baseline gap-2">
          <div className="font-display text-[42px] font-extrabold text-up tabular-nums">
            {fmtPRX(totalClaimable)}
          </div>
          <span className="font-mono text-[16px] text-ink-3">PRX</span>
        </div>
        <div className="mt-3 font-mono text-[12px] text-ink-3">
          {claimablePositions.length} market{claimablePositions.length !== 1 ? "s" : ""} ready to claim
        </div>
      </div>

      {/* Claim Rules */}
      <div className="mb-6 rounded-card border border-line bg-surface p-4">
        <h3 className="mb-3 flex items-center gap-2 font-display text-[14px] font-bold text-ink">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amberx" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Claim Rules
        </h3>
        <ul className="space-y-1.5 font-mono text-[11px] text-ink-3">
          <li>• Only finalized markets with winning shares can be claimed</li>
          <li>• Payout = winning shares × 1 PRX per share</li>
          <li>• Losers forfeit their shares to the finalized pool</li>
          <li>• Claim anytime after finalization — no deadline</li>
        </ul>
      </div>

      {/* Claimable Markets List */}
      <div className="mb-4 font-mono text-[11px] uppercase tracking-[2px] text-ink-3">
        Your Claimable Winnings
      </div>

      {claimablePositions.length === 0 ? (
        <div className="rounded-card border border-line bg-surface p-8 text-center">
          <div className="mb-3 font-mono text-[32px] text-ink-3">🎯</div>
          <div className="font-mono text-[13px] text-ink-3">
            No finalized markets with winning shares yet.
          </div>
          <div className="mt-2 font-mono text-[11px] text-ink-3">
            Trade on active markets to start earning!
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {claimablePositions.map((pos) => {
            const market = markets.find((m) => m.marketId === pos.marketId);
            if (!market) return null;

            const question = stripCatPrefix(market.question || market.rules || "");
            const isN = market.options.length > 0;
            
            // Calculate winning shares and payout
            let winningShares = 0n;
            let winningLabel = "";
            
            if (isN) {
              let winningIdx = 0;
              let maxQ = market.q[0] || 0n;
              for (let i = 1; i < market.q.length; i++) {
                if (market.q[i] > maxQ) {
                  maxQ = market.q[i];
                  winningIdx = i;
                }
              }
              winningShares = pos.shares[winningIdx] || 0n;
              winningLabel = market.options[winningIdx] || `Option ${winningIdx + 1}`;
            } else {
              const yesWins = market.qYes > market.qNo;
              winningShares = yesWins ? pos.sharesYes : pos.sharesNo;
              winningLabel = yesWins ? "YES" : "NO";
            }

            return (
              <div
                key={pos.marketId}
                className="rounded-card border border-line bg-surface-grad p-4 shadow-card"
              >
                <div className="mb-3">
                  <a
                    href={`/market/${pos.marketId}`}
                    className="font-sans text-[15px] font-semibold text-ink hover:text-up transition-colors"
                  >
                    {question.length > 100 ? question.slice(0, 100) + "…" : question}
                  </a>
                </div>

                <div className="flex items-center justify-between">
                  <div className="font-mono text-[12px] text-ink-3">
                    Winning outcome: <span className="font-bold text-up">{winningLabel}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[11px] text-ink-3">Payout</div>
                    <div className="font-display text-[18px] font-bold text-up tabular-nums">
                      {fmtPRX(winningShares)} <span className="text-[13px] text-ink-3">PRX</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => handleClaim(pos.marketId)}
                    disabled={claiming === pos.marketId}
                    className="rounded-card bg-up px-6 py-2.5 font-sans text-[13px] font-bold text-black shadow-glowUp transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {claiming === pos.marketId ? (
                      <span className="flex items-center gap-2">
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Processing...
                      </span>
                    ) : (
                      `Claim ${fmtPRX(winningShares)} PRX`
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Advanced Section */}
      <div className="mt-8 rounded-card border border-line bg-surface p-4">
        <details className="group">
          <summary className="flex cursor-pointer items-center gap-2 font-mono text-[11px] uppercase tracking-[2px] text-ink-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            Advanced — Manual Override
          </summary>
          <div className="mt-4 space-y-3">
            <p className="font-mono text-[11px] text-ink-3">
              If a market isn't showing up but should be claimable, you can manually enter the market ID:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter market ID (0x...)"
                className="flex-1 rounded-card border border-line bg-bg-2 px-3 py-2 font-mono text-[12px] text-ink placeholder-ink-3 focus:border-up focus:outline-none"
              />
              <button className="rounded-card border border-line bg-surface px-4 py-2 font-mono text-[12px] text-ink hover:border-up hover:text-up">
                Select Market
              </button>
            </div>
          </div>
        </details>
      </div>
    </main>
  );
}
