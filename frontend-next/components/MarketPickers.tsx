"use client";
// Small helper panels rendered under the generic ActionForm fields.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/store/wallet";
import { useHeight } from "@/hooks/useHeight";
import { usePositions } from "@/lib/positions";
import { fetchMarketsIncludingHidden, stripCatPrefix, STATUS } from "@/lib/markets";
import { computeCommitHash, loadVote, randomNonceHex, saveVote } from "@/lib/vote";
import { useToast } from "@/store/toast";

const PROPOSAL_WINDOW = 8640; // PROPOSAL_WINDOW_V2: 24h at 10s blocks

function useAllMarkets() {
  return useQuery({ queryKey: ["markets-all"], queryFn: fetchMarketsIncludingHidden, staleTime: 15000, refetchOnMount: "always" });
}

function Row({ q, id, note, active, onPick }: { q: string; id: string; note: string; active: boolean; onPick: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(id)}
      className={`flex w-full items-center gap-2 rounded-card border px-3 py-2 text-left font-sans text-[13px] transition-colors ${active ? "border-up bg-up/10 text-ink" : "border-line bg-bg-2 text-ink-2 hover:border-line-2"}`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate">{stripCatPrefix(q)}</span>
        <span className="block font-mono text-[10px] text-ink-3">{note}</span>
      </span>
      <span className="shrink-0 font-mono text-[11px] text-amberx">{id.slice(0, 6)}…</span>
    </button>
  );
}

/** Reclaim Stake: markets where THIS wallet can plausibly recover funds. */
export function ReclaimPicker({ selected, onPick }: { selected: string; onPick: (mid: string) => void }) {
  const { praxisAddress } = useWallet();
  const { data: chain } = useHeight();
  const { data: markets = [], isFetching } = useAllMarkets();
  const { data: positions = [] } = usePositions();
  const me = (praxisAddress || "").toLowerCase();
  const h = chain?.height ?? 0;
  const held = new Set(positions.filter((p) => !p.claimed).map((p) => p.marketId));

  const items = markets.flatMap((m) => {
    const mine = m.creator.toLowerCase() === me;
    if (m.rawStatus === STATUS.CANCELLED && mine && m.totalPositions === 0) {
      return [{ m, note: "Cancelled by you — recovers any stranded liquidity seed (fails with 198 if already recovered)" }];
    }
    const stale = m.rawStatus === STATUS.LIVE && h > Number(m.expiry) + PROPOSAL_WINDOW;
    if (stale && (mine || held.has(m.marketId))) {
      return [{ m, note: mine ? (m.totalPositions === 0 ? "Expired unresolved — recovers your bond, reserve and liquidity" : "Expired unresolved — recovers your reserve (+ your position cost if you bet)") : "Expired unresolved — refunds your position cost" }];
    }
    return [];
  });

  return (
    <div className="mb-3">
      <div className="mb-1.5 font-mono text-[11px] uppercase tracking-[2px] text-ink-3">Markets you can reclaim from</div>
      {items.length === 0 ? (
        <div className="rounded-card border border-line bg-bg-2 p-3 font-mono text-[12px] leading-relaxed text-ink-3">
          {isFetching ? "Loading…" : "Nothing found for this wallet. A market becomes reclaimable 8,640 blocks (24h) after expiry if nobody proposed an outcome. Cancelled markets with bets are refunded from Claim Winnings."}
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map(({ m, note }) => (
            <Row key={m.marketId} q={m.question || m.rules} id={m.marketId} note={note} active={selected === m.marketId} onPick={onPick} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Claim Creator Fee: finalized markets created by this wallet. */
export function CreatorFeePicker({ selected, onPick }: { selected: string; onPick: (mid: string) => void }) {
  const { praxisAddress } = useWallet();
  const { data: markets = [], isFetching } = useAllMarkets();
  const me = (praxisAddress || "").toLowerCase();
  const mine = markets.filter((m) => m.creator.toLowerCase() === me && m.status === STATUS.FINALIZED);
  return (
    <div className="mb-3">
      <div className="mb-1.5 font-mono text-[11px] uppercase tracking-[2px] text-ink-3">Your finalized markets</div>
      {mine.length === 0 ? (
        <div className="rounded-card border border-line bg-bg-2 p-3 font-mono text-[12px] text-ink-3">
          {isFetching ? "Loading…" : "None yet — creator fees (1% of trade cost) are claimable once a market you created is finalized."}
        </div>
      ) : (
        <div className="space-y-1.5">
          {mine.map((m) => (
            <Row key={m.marketId} q={m.question || m.rules} id={m.marketId} note="Finalized" active={selected === m.marketId} onPick={onPick} />
          ))}
        </div>
      )}
    </div>
  );
}

type SetFn = (id: string, v: string | number | boolean) => void;

/** Commit–reveal helper: builds the commit hash from vote + a fresh 32-byte salt and remembers it on this device. */
export function VoteHelper({ mode, vals, set }: { mode: "commit" | "reveal"; vals: Record<string, string | number | boolean>; set: SetFn }) {
  const toast = useToast((s) => s.show);
  const [saved, setSaved] = useState<string>("");
  const mid = String(vals.mid || "").toLowerCase();
  const addr = String(vals.addr || "").toLowerCase();
  const ready = /^[0-9a-f]{40}$/.test(mid) && /^[0-9a-f]{40}$/.test(addr);

  const gen = async () => {
    if (!ready) { toast("Enter the market ID and connect your wallet first", true); return; }
    const existing = loadVote(mid, addr);
    if (existing && !window.confirm("A vote is already saved for this market on this device. Generating a new salt overwrites it — you could no longer reveal the old commitment. Continue?")) return;
    const vote = Boolean(vals.out);
    const nonce = randomNonceHex();
    const hash = await computeCommitHash(vote, nonce, addr);
    if (!saveVote(mid, addr, { vote, nonce, hash, savedAt: Date.now() })) {
      toast("Couldn't save the salt in this browser — copy it manually before committing", true);
    }
    set("hash", hash);
    setSaved(nonce);
    toast("Commitment generated — salt saved on this device");
  };

  const load = () => {
    const v = loadVote(mid, addr);
    if (!v) { toast("No saved vote for this market on this device", true); return; }
    set("out", v.vote);
    set("salt", v.nonce);
    toast("Loaded saved vote and salt");
  };

  return (
    <div className="mb-3 rounded-card border border-line bg-bg-2 p-3 font-mono text-[12px] text-ink-2">
      {mode === "commit" ? (
        <>
          <div className="mb-1 font-bold text-ink">Commitment helper</div>
          <div className="mb-2 text-[11px] leading-relaxed text-ink-3">
            Pick your vote above, then generate. The salt is created with 32 random bytes (the chain requires ≥ 32) and stored in this browser — you need it to reveal. Clearing site data loses it.
          </div>
          <button type="button" onClick={() => void gen()} className="rounded-card border border-up/40 bg-up-dim px-3 py-1.5 text-[12px] font-bold text-up hover:brightness-110">Generate commitment</button>
          {saved && <div className="mt-2 break-all text-[10px] text-ink-3">salt (backup): {saved}</div>}
        </>
      ) : (
        <>
          <div className="mb-1 font-bold text-ink">Reveal helper</div>
          <div className="mb-2 text-[11px] leading-relaxed text-ink-3">If you committed from this device, load the exact vote and salt you committed.</div>
          <button type="button" onClick={load} className="rounded-card border border-up/40 bg-up-dim px-3 py-1.5 text-[12px] font-bold text-up hover:brightness-110">Load saved vote</button>
        </>
      )}
    </div>
  );
}
