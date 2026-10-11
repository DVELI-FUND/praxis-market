"use client";
import { useWallet } from "@/store/wallet";
import { useXpBoard, useXpMe } from "@/hooks/useXp";

const fmt = (n: number) => n.toLocaleString("en-US");
const short = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);
const units = (n: number) => n / 1_000_000;

export default function QuestsPage() {
  const { praxisAddress, status, connect } = useWallet();
  const connected = (status === "connected" || status === "drift") && !!praxisAddress;
  const board = useXpBoard();
  const me = useXpMe(connected ? praxisAddress : null);

  const minBet = board.data ? units(board.data.minBetCostPRX) : 100;
  const minLp = board.data ? units(board.data.minLPValueCNPY) : 50;
  const rules = board.data?.rules;
  const myRow = me.data?.row ?? null;

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[980px] px-4 py-6 pb-24 md:px-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[3px] text-up">
          <span className="inline-block h-px w-5 bg-up" /> Earn
        </div>
        <h1 className="font-display text-[22px] font-extrabold tracking-[-0.3px]">Quests &amp; XP</h1>
        <p className="mt-1 text-[15px] text-ink-2">Trade and provide liquidity to earn XP. Counted straight from the chain.</p>
      </div>

      {/* quests */}
      <div className="mb-4 grid grid-cols-1 gap-2.5 md:grid-cols-2">
        <div className="rounded-card border border-up/30 bg-surface p-3">
          <div className="flex items-center gap-2">
            <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-line bg-bg-2 text-[16px] text-up">◈</div>
            <div className="font-display text-[15px] font-bold text-ink">Place a bet</div>
            <span className="ml-auto rounded border border-line bg-bg-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-3">min {fmt(minBet)} PRX</span>
          </div>
          <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-ink-3">
            <li>• Every bet of at least {fmt(minBet)} PRX counts</li>
            {rules && <li>• {fmt(rules.xpPerBetUnit)} XP per {fmt(minBet)} PRX of trade cost</li>}
            {rules && <li>• Capped at {fmt(rules.maxBetXPPerMarket)} XP per market</li>}
          </ul>
        </div>
        <div className="rounded-card border border-bluex/30 bg-surface p-3">
          <div className="flex items-center gap-2">
            <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-line bg-bg-2 text-[16px] text-bluex">◎</div>
            <div className="font-display text-[15px] font-bold text-ink">Provide liquidity</div>
            <span className="ml-auto rounded border border-line bg-bg-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-3">min {fmt(minLp)} CNPY</span>
          </div>
          <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-ink-3">
            <li>• Add CNPY + PRX in the terminal&apos;s Liquidity tab</li>
            {rules && <li>• {fmt(rules.xpPerLPBlock)} XP per block while your position stays above {fmt(minLp)} CNPY</li>}
            <li>• Withdrawing below the minimum stops your XP</li>
          </ul>
        </div>
      </div>

      {/* my XP */}
      <div className="mb-4 rounded-card border border-line bg-surface p-3">
        <div className="mb-2 font-mono text-[11px] uppercase tracking-[2px] text-ink-3">Your XP</div>
        {!connected ? (
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[13px] text-ink-3">Connect your wallet to see your XP</span>
            <button onClick={() => void connect()} className="rounded-pill border border-up/40 px-3 py-1.5 font-mono text-[12px] text-up transition-colors hover:bg-up/10">
              Connect
            </button>
          </div>
        ) : me.isLoading ? (
          <div className="font-mono text-[13px] text-ink-3">Loading…</div>
        ) : me.isError ? (
          <div className="font-mono text-[13px] text-ink-3">XP service unavailable right now</div>
        ) : myRow ? (
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              ["Rank", `#${myRow.rank}`],
              ["Bet XP", fmt(myRow.betXP)],
              ["Liquidity XP", fmt(myRow.lpXP)],
              ["Total", fmt(myRow.total)],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="font-display text-[18px] font-bold tabular-nums text-ink">{v}</div>
                <div className="font-mono text-[10px] uppercase tracking-[1px] text-ink-3">{k}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="font-mono text-[13px] text-ink-3">
            No XP yet. Place a bet of at least {fmt(minBet)} PRX or add {fmt(minLp)}+ CNPY of liquidity.
          </div>
        )}
      </div>

      {/* leaderboard */}
      <div className="rounded-card border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <div className="font-mono text-[11px] uppercase tracking-[2px] text-ink-3">Leaderboard</div>
          {board.data && <div className="font-mono text-[11px] text-ink-3">block #{fmt(board.data.indexedHeight)}</div>}
        </div>
        {board.isLoading ? (
          <div className="p-6 text-center font-mono text-[13px] text-ink-3">Loading…</div>
        ) : board.isError ? (
          <div className="p-6 text-center font-mono text-[13px] text-ink-3">Leaderboard temporarily unavailable</div>
        ) : board.data && board.data.rows.length === 0 ? (
          <div className="p-6 text-center font-mono text-[13px] text-ink-3">No qualifying activity yet. Be the first.</div>
        ) : (
          <div>
            <div className="grid grid-cols-[2.5rem_1fr_4.5rem_4.5rem_4.5rem] gap-2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[1px] text-ink-3">
              <span>#</span>
              <span>Address</span>
              <span className="text-right">Bets</span>
              <span className="text-right">Liq.</span>
              <span className="text-right">Total</span>
            </div>
            {board.data?.rows.map((r) => {
              const mine = connected && r.address === praxisAddress?.toLowerCase();
              return (
                <div
                  key={r.address}
                  className={`grid grid-cols-[2.5rem_1fr_4.5rem_4.5rem_4.5rem] items-center gap-2 border-t border-line/60 px-3 py-2 font-mono text-[12px] ${mine ? "bg-up/5" : ""}`}
                >
                  <span className="text-ink-3 tabular-nums">{r.rank}</span>
                  <span className="truncate text-ink">
                    {short(r.address)}
                    {mine && <span className="ml-1.5 rounded border border-up/40 px-1 text-[9px] text-up">YOU</span>}
                  </span>
                  <span className="text-right tabular-nums text-ink-2">{fmt(r.betXP)}</span>
                  <span className="text-right tabular-nums text-ink-2">{fmt(r.lpXP)}</span>
                  <span className="text-right font-bold tabular-nums text-ink">{fmt(r.total)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-4 rounded-card border border-line bg-bg-2 p-3 font-mono text-[11px] text-ink-3">
        <div className="mb-1 text-ink-2">How it works:</div>
        <ul className="space-y-0.5">
          <li>• XP is computed from on-chain bets and the liquidity pool, so anyone can re-check it</li>
          <li>• Liquidity XP is sampled from pool snapshots, so it updates every few minutes</li>
          <li>• Addresses are shown shortened; the leaderboard refreshes every 30 seconds</li>
        </ul>
      </div>
    </main>
  );
}
