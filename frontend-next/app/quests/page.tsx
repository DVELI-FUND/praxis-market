"use client";
import { useState } from "react";
import { useWallet } from "@/store/wallet";
import { useXpBoard } from "@/hooks/useXp";

const fmt = (n?: number) => (n ?? 0).toLocaleString("en-US");
const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`;
const units = (n: number) => n / 1_000_000;

type Entry = { address: string; xp: number; rank: number };

const MEDAL: Record<number, string> = {
  1: "bg-[#F5C451]/15 text-[#F5C451] ring-1 ring-[#F5C451]/50",
  2: "bg-[#C0C7D1]/15 text-[#C0C7D1] ring-1 ring-[#C0C7D1]/50",
  3: "bg-[#D08A54]/15 text-[#D08A54] ring-1 ring-[#D08A54]/50",
};

const ACCENT = {
  up: {
    bar: "bg-up",
    text: "text-up",
    chip: "border-up/30 bg-up/10 text-up",
    iconBg: "bg-up/10 text-up",
    fill: "bg-up",
    mine: "bg-up/[0.06]",
    youChip: "border-up/40 bg-up/10 text-up",
  },
  blue: {
    bar: "bg-bluex",
    text: "text-bluex",
    chip: "border-bluex/30 bg-bluex/10 text-bluex",
    iconBg: "bg-bluex/10 text-bluex",
    fill: "bg-bluex",
    mine: "bg-bluex/[0.06]",
    youChip: "border-bluex/40 bg-bluex/10 text-bluex",
  },
} as const;

const IconBet = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M14 7h7v7" />
  </svg>
);
const IconLiquidity = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
    <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />
  </svg>
);
const Check = ({ cls }: { cls: string }) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`mt-[3px] h-4 w-4 shrink-0 ${cls}`} aria-hidden="true">
    <path d="M4 10.5l4 4 8-9" />
  </svg>
);

function Rank({ rank }: { rank: number }) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-[14px] font-bold tabular-nums ${
        MEDAL[rank] ?? "bg-surface-2 text-ink-2"
      }`}
    >
      {rank}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-line bg-surface-grad px-4 py-3">
      <div className="font-display text-[26px] font-bold leading-none tabular-nums text-ink">{value}</div>
      <div className="mt-1.5 text-[13px] font-medium text-ink-2">{label}</div>
    </div>
  );
}

function Track(props: {
  accent: keyof typeof ACCENT;
  icon: React.ReactNode;
  title: string;
  tagline: string;
  requirement: string;
  how: string[];
  entries: Entry[];
  me: Entry | null;
  connected: boolean;
  loading: boolean;
  failed: boolean;
  emptyText: string;
}) {
  const a = ACCENT[props.accent];
  const [all, setAll] = useState(false);
  const shown = all ? props.entries : props.entries.slice(0, 10);
  const top = props.entries[0]?.xp || 1;

  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className={`h-1 w-full ${a.bar}`} />
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${a.iconBg}`}>{props.icon}</div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[20px] font-bold leading-tight text-ink">{props.title}</h2>
            <p className="mt-0.5 text-[14px] text-ink-2">{props.tagline}</p>
          </div>
        </div>

        <div className={`mt-4 inline-flex items-center rounded-pill border px-3 py-1 text-[13px] font-semibold ${a.chip}`}>{props.requirement}</div>

        <ul className="mt-4 space-y-2">
          {props.how.map((t) => (
            <li key={t} className="flex gap-2.5 text-[14px] leading-snug text-ink-2">
              <Check cls={a.text} />
              <span>{t}</span>
            </li>
          ))}
        </ul>

        {/* your position */}
        <div className="mt-5 flex items-center justify-between rounded-xl border border-line bg-bg-2 px-4 py-3">
          <span className="text-[13px] font-semibold uppercase tracking-wide text-ink-3">Your position</span>
          {!props.connected ? (
            <span className="text-[14px] text-ink-2">Connect wallet</span>
          ) : props.me ? (
            <span className="font-display text-[16px] font-bold tabular-nums text-ink">
              #{props.me.rank} <span className="mx-1 text-ink-3">·</span> <span className={a.text}>{fmt(props.me.xp)} XP</span>
            </span>
          ) : (
            <span className="text-[14px] text-ink-2">Not ranked yet</span>
          )}
        </div>
      </div>

      {/* leaderboard */}
      <div className="border-t border-line">
        <div className="flex items-center justify-between px-5 py-3">
          <h3 className="text-[15px] font-bold text-ink">Leaderboard</h3>
          <span className="text-[13px] text-ink-3">{props.entries.length} ranked</span>
        </div>

        {props.loading ? (
          <div className="space-y-2 px-5 pb-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-2" />
            ))}
          </div>
        ) : props.failed ? (
          <div className="px-5 pb-6 pt-2 text-center text-[14px] text-ink-2">Leaderboard temporarily unavailable. Try again in a moment.</div>
        ) : props.entries.length === 0 ? (
          <div className="px-5 pb-6 pt-2 text-center text-[14px] text-ink-2">{props.emptyText}</div>
        ) : (
          <div className="pb-2">
            {shown.map((e) => {
              const mine = props.me?.address === e.address;
              return (
                <div key={e.address} className={`px-5 py-3 ${mine ? a.mine : ""} border-t border-line/60 first:border-t-0`}>
                  <div className="flex items-center gap-3">
                    <Rank rank={e.rank} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-mono text-[14px] font-medium text-ink">{short(e.address)}</span>
                        {mine && <span className={`rounded border px-1.5 py-px text-[11px] font-bold ${a.youChip}`}>YOU</span>}
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-pill bg-surface-2">
                        <div className={`h-full rounded-pill ${a.fill}`} style={{ width: `${Math.max(4, (e.xp / top) * 100)}%` }} />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-[18px] font-bold leading-none tabular-nums text-ink">{fmt(e.xp)}</div>
                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">XP</div>
                    </div>
                  </div>
                </div>
              );
            })}
            {props.entries.length > 10 && (
              <button
                onClick={() => setAll((v) => !v)}
                className={`mx-5 mb-3 mt-2 w-[calc(100%-2.5rem)] rounded-xl border border-line py-2.5 text-[14px] font-semibold transition-colors hover:bg-surface-2 ${a.text}`}
              >
                {all ? "Show top 10" : `Show all ${props.entries.length}`}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default function QuestsPage() {
  const { praxisAddress, status, connect } = useWallet();
  const connected = (status === "connected" || status === "drift") && !!praxisAddress;
  const board = useXpBoard();

  const rows = board.data?.rows ?? [];
  const rank = (key: "betXP" | "lpXP"): Entry[] =>
    rows
      .filter((r) => r[key] > 0)
      .sort((x, y) => y[key] - x[key] || x.address.localeCompare(y.address))
      .map((r, i) => ({ address: r.address, xp: r[key], rank: i + 1 }));
  const bettors = rank("betXP");
  const lps = rank("lpXP");
  const meAddr = praxisAddress?.toLowerCase() ?? "";
  const meBet = bettors.find((e) => e.address === meAddr) ?? null;
  const meLp = lps.find((e) => e.address === meAddr) ?? null;

  const minBet = board.data ? units(board.data.minBetCostPRX) : 100;
  const minLp = board.data ? units(board.data.minLPValueCNPY) : 50;
  const rules = board.data?.rules;

  const betHow = [
    `Every bet of ${fmt(minBet)} PRX or more counts`,
    ...(rules ? [`Earn ${fmt(rules.xpPerBetUnit)} XP for each ${fmt(minBet)} PRX you bet`, `Up to ${fmt(rules.maxBetXPPerMarket)} XP per market`] : []),
  ];
  const lpHow = [
    "Add CNPY and PRX in the terminal's Liquidity tab",
    ...(rules?.lpBlocksPerXP ? [`Earn 1 XP for every ${fmt(rules.lpBlocksPerXP)} blocks your position stays at ${fmt(minLp)} CNPY or more`] : []),
    "Withdrawing below the minimum pauses your XP",
  ];

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[1100px] px-4 py-8 pb-28 md:px-8">
      {/* hero */}
      <header className="mb-6">
        <div className="mb-3 inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-3 py-1 text-[13px] font-semibold text-ink-2">
          <span className="h-2 w-2 animate-pulseDot rounded-full bg-up" /> Live from the chain
        </div>
        <h1 className="font-display text-[34px] font-bold leading-[1.1] tracking-tight text-ink md:text-[42px]">
          Quests <span className="bg-grad-brand bg-clip-text text-transparent">&amp; XP</span>
        </h1>
        <p className="mt-2 max-w-[640px] text-[16px] leading-relaxed text-ink-2">
          Two ways to earn. Bet on markets, or provide liquidity. Each has its own leaderboard.
        </p>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Participants" value={board.data ? fmt(rows.length) : "—"} />
        <Stat label="Bettors" value={board.data ? fmt(bettors.length) : "—"} />
        <Stat label="Liquidity providers" value={board.data ? fmt(lps.length) : "—"} />
        <Stat label="Indexed block" value={board.data ? `#${fmt(board.data.indexedHeight)}` : "—"} />
      </div>

      {!connected && (
        <div className="mb-6 flex flex-col items-start justify-between gap-3 rounded-card border border-line bg-surface-grad p-4 sm:flex-row sm:items-center">
          <div>
            <div className="text-[16px] font-bold text-ink">See where you stand</div>
            <div className="text-[14px] text-ink-2">Connect your wallet to find your rank on both leaderboards.</div>
          </div>
          <button
            onClick={() => void connect()}
            className="shrink-0 rounded-pill bg-grad-up px-5 py-2.5 text-[14px] font-bold text-black transition-opacity hover:opacity-90"
          >
            Connect wallet
          </button>
        </div>
      )}

      {/* two separate tracks */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Track
          accent="up"
          icon={<IconBet />}
          title="Bettors"
          tagline="Ranked by XP earned from your bets."
          requirement={`Minimum bet ${fmt(minBet)} PRX`}
          how={betHow}
          entries={bettors}
          me={meBet}
          connected={connected}
          loading={board.isLoading}
          failed={board.isError}
          emptyText={`No qualifying bets yet. Place a bet of ${fmt(minBet)} PRX or more to take the first spot.`}
        />
        <Track
          accent="blue"
          icon={<IconLiquidity />}
          title="Liquidity providers"
          tagline="Ranked by XP earned from time in the pool."
          requirement={`Minimum position ${fmt(minLp)} CNPY`}
          how={lpHow}
          entries={lps}
          me={meLp}
          connected={connected}
          loading={board.isLoading}
          failed={board.isError}
          emptyText={`No qualifying liquidity yet. Add ${fmt(minLp)} CNPY or more to take the first spot.`}
        />
      </div>

      <p className="mt-6 text-center text-[13px] leading-relaxed text-ink-3">
        XP is computed from on-chain bets and the liquidity pool, so anyone can verify it. Liquidity XP updates every few minutes. The page refreshes every 30 seconds.
      </p>
    </main>
  );
}
