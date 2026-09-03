"use client";
import { useEffect, useState , useMemo} from "react";
import Link from "next/link";
import { useMarketDetail } from "@/hooks/useMarketDetail";
import { useHeight } from "@/hooks/useHeight";
import { extractCat, stripCatPrefix, yesPct, STATUS } from "@/lib/markets";
import { fmtPRX, fmtCountdown } from "@/lib/format";
import StatusPill from "./StatusPill";
import ShareButton from "./ShareButton";
import DetailTabs from "./DetailTabs";
import BannerImg from "./BannerImg";
import PriceChart from "./PriceChart";
import { useMarketTxs } from "@/lib/txHistory";
import { fetchMarkets, type Market } from "@/lib/markets";
import { useQuery } from "@tanstack/react-query";
import PredictPanel from "./PredictPanel";
import PositionCard from "./PositionCard";
import LogoMark from "./LogoMark";

export default function MarketDetail({ mid }: Props) {
  const { data: chain } = useHeight();
  const { market, holders, disputeContext, isLoading, isError } = useMarketDetail(mid);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [outcome, setOutcome] = useState(true);
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    try { setBookmarked((JSON.parse(window.localStorage.getItem("praxis_bookmarks") || "[]") as string[]).includes(mid)); } catch { setBookmarked(false); }
  }, [mid]);

  const toggleBm = () => {
    setBookmarked((b) => {
      const n = !b;
      try {
        const arr = JSON.parse(window.localStorage.getItem("praxis_bookmarks") || "[]") as string[];
        const next = n ? [...new Set([...arr, mid])] : arr.filter((x) => x !== mid);
        window.localStorage.setItem("praxis_bookmarks", JSON.stringify(next));
      } catch {}
      return n;
    });
  };

  const { data: txs = [] } = useMarketTxs(mid);
  const { data: mkq = [] } = useQuery({ queryKey: ["markets-related"], queryFn: fetchMarkets });
  const allMarkets = (mkq ?? []) as Market[];
  const chain2 = chain;
  const chg = useMemo(() => {
    if (!market) return 0;
    const height = chain2?.height ?? 0;
    const trades = [...txs].filter((t) => t.messageType === "submit_prediction").sort((a, b) => a.height - b.height);
    let yesAdd = 0n, noAdd = 0n;
    for (const t of trades) { const sh = BigInt(t.transaction?.msg?.shares || 0); if (t.transaction?.msg?.outcome) yesAdd += sh; else noAdd += sh; }
    let yes = market.qYes - yesAdd, no = market.qNo - noAdd;
    if (yes < 0n) yes = 0n;
    if (no < 0n) no = 0n;
    const minH = Math.max(0, height - 17280);
    let pct24 = yes + no > 0n ? Number((yes * 10000n) / (yes + no)) / 100 : 50;
    for (const t of trades) {
      const sh = BigInt(t.transaction?.msg?.shares || 0);
      if (t.transaction?.msg?.outcome) yes += sh; else no += sh;
      if (t.height <= minH && yes + no > 0n) pct24 = Number((yes * 10000n) / (yes + no)) / 100;
    }
    const pct = yesPct(market);
    return Math.round((pct - pct24) * 10) / 10;
  }, [txs, market, chain2?.height]);
  const fmtChg = (v: number) => (v > 0 ? `▲ ${v.toFixed(1)}%` : v < 0 ? `▼ ${Math.abs(v).toFixed(1)}%` : "— 0.0%");
  const blkDate = (b: number) => new Date(Date.now() + (b - (chain2?.height ?? 0)) * 5000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const related = useMemo(() => allMarkets.filter((m2) => m2.marketId !== mid && m2.status === STATUS.LIVE).slice(0, 3), [allMarkets, mid]);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 w-40 rounded-card bg-surface-2" />
        <div className="h-[200px] rounded-card bg-surface-grad" />
        <div className="h-[300px] rounded-card bg-surface-grad" />
      </div>
    );
  }

  if (isError || !market) {
    return <div className="rounded-card border border-down/40 bg-down-dim p-4 font-mono text-[11px] text-down">⚠ Market not found</div>;
  }

  const pct = yesPct(market);

  const noPct = 100 - pct;
  const total = market.qYes + market.qNo;
  const vol = total > 0n ? fmtPRX(total) : "—";
  const catKey = extractCat(market.rules);
  const question = stripCatPrefix(market.question || market.rules || "(no question)");
  const rules = market.rules || "";
  const rulesText = rules.replace(/^\[.*?\]\s*/, "").trim();

  return (
    <div className="animate-fadeUp">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 font-mono text-[10px] text-ink-2 transition-colors hover:text-up">← Back</Link>

      <BannerImg rules={market.rules} className="mb-4 h-40 w-full rounded-card border border-line object-cover" />
      <div className="md:grid md:grid-cols-[1fr_340px] md:items-start md:gap-5">
        <div>
          {/* icon + title header */}
          <div className="mb-4 flex items-start gap-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-card border border-line-2 bg-surface text-ink">
              <BannerImg
                rules={market.rules}
                className="h-full w-full object-cover"
                fallback={
                  <div className="flex h-full w-full items-center justify-center">
                    <LogoMark className="h-7 w-7" />
                  </div>
                }
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-2">
                <StatusPill status={market.status} />
                <span className="rounded-pill border border-line bg-bg px-2 py-0.5 font-mono text-[8px] uppercase tracking-[1.5px] text-ink-2">{catKey}</span>
                <ShareButton mid={mid} question={question} />
                <button onClick={toggleBm} className={`rounded-pill border border-line bg-bg px-2 py-0.5 font-mono text-[11px] transition-colors ${bookmarked ? "text-amberx" : "text-ink-3 hover:text-amberx"}`}>{bookmarked ? "★" : "☆"}</button>
              </div>
              <h1 className="font-display text-[20px] font-extrabold leading-tight tracking-[-0.3px] text-ink md:text-[24px]">{question}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-4 font-mono text-[11px]">
                <span className="text-ink-2">Vol <b className="text-[13px] text-cyanx tabular-nums">{vol}</b></span>
                <span className="text-ink-3">·</span>
                <span className="text-ink-2">Ends <b className="text-[13px] text-up tabular-nums">{fmtCountdown(Number(market.expiry), chain?.height ?? 0)}</b></span>
              </div>
            </div>
          </div>

          {/* rules accordion */}
          {rulesText && (
            <div className="mb-4 overflow-hidden rounded-card border border-line bg-surface-grad shadow-card">
              <button onClick={() => setRulesOpen(!rulesOpen)} className="flex w-full items-center justify-between px-4 py-3 text-left">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[2px] text-ink-3">Rules</span>
                <span className="font-mono text-[14px] text-ink-3">{rulesOpen ? "−" : "+"}</span>
              </button>
              {rulesOpen && (
                <div className="border-t border-line px-4 py-3">
                  <p className="font-sans text-[12px] leading-relaxed text-ink-2 whitespace-pre-wrap">{rulesText}</p>
                </div>
              )}
            </div>
          )}

          {/* outcome row */}
          <div className="mb-4 overflow-hidden rounded-card border border-line bg-surface-grad shadow-card">
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-line px-4 py-2.5 font-mono text-[8px] uppercase tracking-[1.5px] text-ink-3">
              <span>Outcome</span>
              <span className="w-[80px] text-right">Chance</span>
              <span className="w-[80px] text-right">Change</span>
              <span className="w-[120px] text-right">Action</span>
            </div>
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-up" />
                <span className="font-display text-[14px] font-bold text-ink">YES</span>
              </div>
              <div className="w-[80px] text-right font-display text-[18px] font-extrabold text-up tabular-nums">{pct}%</div>
              <div className={`w-[80px] text-right font-mono text-[11px] tabular-nums ${chg > 0 ? "text-up" : chg < 0 ? "text-down" : "text-ink-3"}`}>{fmtChg(chg)}</div>
              <div className="w-[120px] text-right">
                <button onClick={() => setOutcome(true)} className="rounded-card bg-up px-4 py-1.5 font-sans text-[11px] font-extrabold text-black transition-all hover:brightness-110">Buy YES</button>
              </div>
            </div>
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-t border-line px-4 py-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-down" />
                <span className="font-display text-[14px] font-bold text-ink">NO</span>
              </div>
              <div className="w-[80px] text-right font-display text-[18px] font-extrabold text-down tabular-nums">{noPct}%</div>
              <div className={`w-[80px] text-right font-mono text-[11px] tabular-nums ${chg < 0 ? "text-up" : chg > 0 ? "text-down" : "text-ink-3"}`}>{fmtChg(-chg)}</div>
              <div className="w-[120px] text-right">
                <button onClick={() => setOutcome(false)} className="rounded-card bg-down px-4 py-1.5 font-sans text-[11px] font-extrabold text-black transition-all hover:brightness-110">Buy NO</button>
              </div>
            </div>
          </div>

          {/* status banners */}
          {market.status === STATUS.CANCELLED && (
            <div className="mb-4 rounded-card border border-down/40 bg-down-dim p-4 font-mono text-[11px] text-down">✕ This market has been cancelled.</div>
          )}
          {market.status === STATUS.EXPIRED && (
            <div className="mb-4 rounded-card border border-amberx/40 bg-amberx/5 p-4 font-mono text-[11px] text-amberx">⏱ Expired and awaiting resolution.</div>
          )}
          {market.status === STATUS.FINALIZED && (
            <div className="mb-4 rounded-card border border-bluex/40 bg-bluex/5 p-4 font-mono text-[11px] text-bluex">✓ Finalized.</div>
          )}
          {market.status === STATUS.VOIDED && (
            <div className="mb-4 rounded-card border border-ink-3/40 bg-ink-3/5 p-4 font-mono text-[11px] text-ink-2">✕ Voided.</div>
          )}

          {/* position card */}
          {holders && <PositionCard market={market} holders={holders} />}

          {/* price chart */}
          <div className="mb-4">
            <PriceChart mid={mid} initialYes={market.qYes} initialNo={market.qNo} />
          </div>

          {/* tabs */}
          {holders && <DetailTabs mid={mid} market={market} holders={holders} disputeContext={disputeContext} />}

          {/* timeline & payout */}
          <div className="mb-4 overflow-hidden rounded-card border border-line bg-surface-grad shadow-card">
            <div className="border-b border-line px-4 py-3 font-display text-[13px] font-bold text-ink">Timeline & payout</div>
            <div className="space-y-2 px-4 py-3 font-mono text-[10px] text-ink-2">
              <div className="flex justify-between gap-3"><span>Trading opened</span><span className="text-right text-ink-3">blk {Number((market as unknown as { openTime?: number }).openTime ?? 0).toLocaleString()} · {blkDate(Number((market as unknown as { openTime?: number }).openTime ?? 0))}</span></div>
              <div className="flex justify-between gap-3"><span>Trading closes</span><span className="text-right text-amberx">blk {Number(market.expiry).toLocaleString()} · {blkDate(Number(market.expiry))}</span></div>
              <div className="flex justify-between gap-3"><span>Resolution</span><span className="text-right text-ink-3">bonded propose → dispute window → finalize</span></div>
              <div className="flex justify-between gap-3"><span>Payout</span><span className="text-right text-up">1 PRX per winning share · losers forfeit</span></div>
            </div>
          </div>

          {/* people are also trading */}
          {related.length > 0 && (
            <div className="mb-4">
              <div className="mb-2 font-display text-[13px] font-bold text-ink">People are also trading</div>
              <div className="space-y-1.5">
                {related.map((rm) => (
                  <Link key={rm.marketId} href={`/market/${rm.marketId}`} className="flex items-center gap-3 rounded-card border border-line bg-surface px-3 py-2 transition-colors hover:border-line-2">
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-card border border-line bg-surface-2">
                      <BannerImg rules={rm.rules} className="h-full w-full object-cover" fallback={<div className="flex h-full w-full items-center justify-center text-[14px] text-ink-2">◈</div>} />
                    </div>
                    <div className="min-w-0 flex-1 truncate font-sans text-[12px] font-semibold text-ink">{stripCatPrefix(rm.question || rm.rules)}</div>
                    <div className="font-display text-[13px] font-extrabold text-up tabular-nums">{yesPct(rm)}%</div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <FaqSection pct={pct} ends={fmtCountdown(Number(market.expiry), chain?.height ?? 0)} />
        </div>

        <div className="mt-4 md:mt-0">
          <PredictPanel market={market} outcome={outcome} onOutcome={setOutcome} />
        </div>
      </div>
    </div>
  );
}

interface Props {
  mid: string;
}

function FaqSection({ pct, ends }: { pct: number; ends: string }) {
  const [open, setOpen] = useState<number | null>(0);
  const faqs = [
    { q: "What are the current odds?", a: `YES is priced at ${pct}% and NO at ${100 - pct}%. Prices move as traders buy each side.` },
    { q: `What does a YES price of ${pct}¢ mean?`, a: "It means the market currently assigns a " + pct + "% probability to the outcome resolving YES. Buying YES at this price pays 100¢ per share if correct." },
    { q: "When does this market resolve?", a: `Trading ends in ${ends}. After expiry, a resolver proposes the outcome and it finalizes unless disputed.` },
    { q: "How is resolution decided?", a: "Bonded resolvers stake PRX to propose the outcome. Anyone can dispute by staking; a correct challenge is rewarded, a rejected one is forfeited." },
  ];
  return (

    <div className="mt-4">
      <div className="mb-2 font-display text-[15px] font-bold text-ink">Frequently Asked Questions</div>
      <div className="overflow-hidden rounded-card border border-line bg-surface-grad shadow-card">
        {faqs.map((f, i) => (
          <div key={i} className="border-b border-line last:border-b-0">
            <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between px-4 py-3 text-left">
              <span className="font-sans text-[12px] font-semibold text-ink">{f.q}</span>
              <span className="font-mono text-[12px] text-ink-3">{open === i ? "−" : "+"}</span>
            </button>
            {open === i && <div className="border-t border-line bg-bg-2 px-4 py-3 font-sans text-[11px] leading-relaxed text-ink-2">{f.a}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
