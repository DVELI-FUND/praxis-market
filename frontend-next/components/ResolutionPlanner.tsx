"use client";
import { marketVol } from "@/lib/markets";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMarket, fetchDisputeContext, fetchPosition } from "@/lib/detail";
import { useHeight } from "@/hooks/useHeight";
import { fmtPRX } from "@/lib/format";
import { nPrices } from "@/lib/nOutcome";

const ELEVATED = 25000000000n; // 25,000 PRX in uPRX

interface Props {
  mid: string;
  mode: "propose" | "dispute";
  wallet: string | null;
  bondValue?: number;
  onBond?: (n: number) => void;
}

export default function ResolutionPlanner({ mid, mode, wallet, bondValue = 0, onBond }: Props) {
  const valid = /^[0-9a-f]{40}$/.test(mid.toLowerCase());
  const { data: chain } = useHeight();
  const height = chain?.height ?? 0;

  const marketQ = useQuery({ queryKey: ["mkt-id", mid], queryFn: () => fetchMarket(mid), enabled: valid });
  const dctxQ = useQuery({
    queryKey: ["dctx", mid, wallet],
    queryFn: () => fetchDisputeContext(mid, wallet || undefined),
    enabled: valid,
  });
  const posQ = useQuery({
    queryKey: ["pos", mid, wallet],
    queryFn: () => fetchPosition(mid, wallet || ""),
    enabled: valid && !!wallet,
  });

  const m = marketQ.data;
  const isNOutcome = m && m.options && m.options.length > 0;
  const nPricesArr = isNOutcome && m && m.q && m.b0 ? nPrices(m.q, m.b0) : [];
  const pool = m ? (isNOutcome ? m.q.reduce((a, b) => a + b, 0n) : marketVol(m)) : 0n;
  const poolNum = Number(pool / 1000000n);
  // Contract: ComputeMinBond = max(b_eff / 100, MIN_B0 = 60 PRX)
  const minBond = Math.max(m ? Number(m.b0 / 1000000n) / 100 : 0, 60);
  const elevated = pool >= ELEVATED;

  // auto-raise propose bond to protocol minimum
  useEffect(() => {
    if (mode === "propose" && onBond && valid && m && bondValue < Math.ceil(minBond)) {
      onBond(Math.ceil(minBond));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, valid, minBond, m]);

  if (!valid) {
    return (
      <div className="mb-3 rounded-card border border-line bg-bg-2 p-3 font-mono text-[12px] text-ink-3">
        Enter a 40-hex Market ID to compute bond, risk & eligibility.
      </div>
    );
  }
  if (marketQ.isLoading) {
    return (
      <div className="mb-3 rounded-card border border-line bg-bg-2 p-3 font-mono text-[12px] text-ink-3">
        <span className="animate-pulseDot">▪ ▪ ▪</span>&nbsp;&nbsp;computing resolution context
      </div>
    );
  }
  if (!m) {
    return (
      <div className="mb-3 rounded-card border border-down/40 bg-down-dim p-3 font-mono text-[12px] text-down">
        Market not found — browse Markets first
      </div>
    );
  }

  const expired = height > 0 && Number(m.expiry) < height;
  const isCreator = !!wallet && m.creator.toLowerCase() === wallet.toLowerCase();
  const pos = posQ.data;
  const hasPos = !!pos && (pos.yes > 0n || pos.no > 0n);

  const dw = (dctxQ.data?.disputeWindow || {}) as Record<string, unknown>;
  const windowOpen = Boolean(dw.open);
  const deadline = Number(dw.deadline_block ?? dw.deadlineBlock ?? 0);

  const sd = dctxQ.data as (typeof dctxQ.data & { should_dispute?: boolean; should_dispute_reason?: string }) | undefined;
  const shouldDispute = Boolean(sd?.should_dispute);
  const sdReason = sd?.should_dispute_reason || "";

  const checks: { ok: boolean; label: string }[] =
    mode === "propose"
      ? [
          { ok: expired, label: expired ? "Market expired — propose unlocked" : "Not expired yet — propose locked until expiry" },
          { ok: !isCreator, label: isCreator ? "Creator cannot propose own market (COI)" : "Not the market creator" },
          { ok: !hasPos, label: hasPos ? "Hold a position — forfeit before proposing" : "No open position in this market" },
        ]
      : [
          { ok: windowOpen, label: windowOpen ? `Dispute window open until #${deadline}` : "Dispute window closed / not open" },
          { ok: shouldDispute, label: shouldDispute ? "Position conflicts with proposal — dispute justified" : sdReason || "No conflicting position" },
        ];

  return (
    <div className="mb-3 rounded-card border border-line bg-bg-2 p-3 font-mono text-[12px]">
      <div className="mb-2 text-[11px] uppercase tracking-[2px] text-ink-3">
        // {mode === "propose" ? "propose_planner" : "dispute_planner"}
      </div>

      <div
        className={`mb-2 rounded-card border p-2 ${
          elevated ? "border-down/40 bg-down-dim text-down" : "border-up/20 bg-up-dim text-ink-2"
        }`}
      >
        {elevated
          ? `⚠ ELEVATED RISK · pool ${fmtPRX(pool)} PRX (≥ 25k) · panel of 7 resolvers`
          : `✓ Standard market · pool ${fmtPRX(pool)} PRX · panel of 3 resolvers`}
      </div>

      <div className="space-y-1 text-ink-2">
        {mode === "propose" && (
          <div className="flex justify-between">
            <span className="text-ink-3">Min bond (1% of b_eff, floor 60)</span>
            <span className="text-up tabular-nums">{Math.ceil(minBond)} PRX</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-ink-3">Expiry block</span>
          <span className="tabular-nums">#{Number(m.expiry).toLocaleString()}</span>
        </div>
        {mode === "dispute" && windowOpen && (
          <div className="flex justify-between">
            <span className="text-ink-3">Blocks left to dispute</span>
            <span className="text-amberx tabular-nums">{Math.max(deadline - height, 0)}</span>
          </div>
        )}
      </div>

      <div className="mt-2 space-y-1 border-t border-line pt-2">
        {checks.map((c, i) => (
          <div key={i} className={`flex items-start gap-1.5 ${c.ok ? "text-ink-3" : "text-down"}`}>
            <span>{c.ok ? "✓" : "✗"}</span>
            <span>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
