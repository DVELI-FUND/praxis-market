"use client";
// Lifecycle banner for the market page: tells the user where the market is in
// propose → dispute → vote → finalize → claim, and links to the matching action
// (the action pages pre-fill the market id from ?mid=).
import Link from "next/link";
import { STATUS, extractOutcomes } from "@/lib/markets";
import { fmtCountdown } from "@/lib/format";
import type { DisputeContext, MarketDetail } from "@/lib/detail";

const PROPOSAL_WINDOW = 8640; // blocks after expiry resolvers have to propose (24h)
const CLAIM_WINDOW = 259200; // blocks winners have to claim after finalization (30 days)

const BTN = "rounded-card border border-current px-3 py-1 font-sans text-[12px] font-bold hover:bg-white/5";

function outcomeLabel(m: MarketDetail, yes: boolean, idx: number): string {
  if (m.options.length > 0) return m.options[idx] ?? `#${idx + 1}`;
  const o = extractOutcomes(m.rules || "");
  return yes ? o.yes : o.no;
}

export default function ResolutionBanner({ market, ctx, height }: { market: MarketDetail; ctx?: DisputeContext; height: number }) {
  const mid = market.marketId;
  const link = (key: string, label: string) => (
    <Link key={key} href={`/action/${key}?mid=${mid}`} className={BTN}>{label}</Link>
  );
  const box = (cls: string, title: string, body: React.ReactNode, actions?: React.ReactNode) => (
    <div className={`mb-4 rounded-card border p-4 font-mono text-[13px] ${cls}`}>
      <div className="font-bold">{title}</div>
      {body && <div className="mt-1 text-[12px] leading-relaxed opacity-90">{body}</div>}
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );

  const prop = ctx?.proposal;
  const proposed = prop ? outcomeLabel(market, prop.proposedOutcome, prop.proposedIndex) : "";

  switch (market.status) {
    case STATUS.CANCELLED:
      return box("border-down/40 bg-down-dim text-down", "✕ This market was cancelled",
        "Bettors get their cost back, including the 2% market fees, from Claim Winnings. The creator's seed and reserve are paid back by the chain or via Reclaim Stake.",
        <>{link("claim", "Claim refund")}{link("reclaim", "Reclaim stake")}</>);
    case STATUS.AWAITING: {
      const deadline = Number(market.expiry) + PROPOSAL_WINDOW;
      if (height > deadline) {
        return box("border-amberx/40 bg-amberx/5 text-amberx", "⏱ Expired — nobody proposed an outcome in time",
          "Trading is closed and the proposal window has passed. Bettors can reclaim what they paid and the creator recovers their bond and liquidity.",
          link("reclaim", "Reclaim stake"));
      }
      return box("border-amberx/40 bg-amberx/5 text-amberx", "⏱ Expired — awaiting resolution",
        `Trading is closed. A bonded resolver can propose the outcome until block #${deadline.toLocaleString()} (${fmtCountdown(deadline, height)} left); otherwise the market becomes reclaimable.`,
        link("propose", "Propose outcome (resolvers)"));
    }
    case STATUS.PROPOSED: {
      const dw = ctx?.disputeWindow;
      const deadline = dw?.deadlineBlock ?? 0;
      const open = !!dw?.open;
      return box("border-amberx/40 bg-amberx/5 text-amberx", `◆ Outcome proposed: ${proposed || "…"}`,
        open
          ? `Dispute window open until block #${deadline.toLocaleString()} (${fmtCountdown(deadline, height)} left). If you think the proposal is wrong you can dispute it with a bond.`
          : "The dispute window has closed — the market can be finalized.",
        open ? `<div class="mt-2 rounded-card border border-amberx/30 bg-amberx/5 p-2 text-center"><span class="font-mono text-[11px] font-bold uppercase tracking-wider text-amberx">🔒 Resolver Access Only</span><p class="mt-1 font-mono text-[10px] text-ink-3">Only registered resolvers may file a dispute.</p></div>` : link("finalize", "Finalize market"));
    }
    case STATUS.DISPUTED:
      return box("border-down/40 bg-down-dim text-down", "⚠ Outcome disputed",
        `A panel of ${ctx?.dispute?.panelSize || "3–7"} resolvers decides by commit–reveal vote${prop ? ` (proposal was ${proposed})` : ""}. Panel members: commit, then reveal, then anyone on the resolver list can tally.`,
        <>{link("commit", "Commit vote")}{link("reveal", "Reveal vote")}{link("tally", "Tally votes")}</>);
    case STATUS.FINALIZED: {
      const oc = ctx?.outcome;
      const winner = oc ? outcomeLabel(market, oc.winningOutcome, oc.winningIndex) : "";
      const left = oc && oc.resolvedAt > 0 ? oc.resolvedAt + CLAIM_WINDOW - height : 0;
      return box("border-bluex/40 bg-bluex/5 text-bluex", `✓ Finalized${winner ? ` — ${winner} won` : ""}`,
        `Winning shares pay 1 PRX each. Claim within 30 days of finalization${left > 0 ? ` (${fmtCountdown(height + left, height)} left)` : ""}; unclaimed funds are swept afterwards.`,
        <>{link("claim", "Claim winnings")}{link("claimcreator", "Claim creator fee")}</>);
    }
    case STATUS.VOIDED:
      return box("border-ink-3/40 bg-ink-3/5 text-ink-2", "✕ Voided",
        "The dispute panel could not confirm the outcome, so the market was voided. Every position is refunded (plus fees) from Claim Winnings.",
        link("claim", "Claim refund"));
    default:
      return null;
  }
}
