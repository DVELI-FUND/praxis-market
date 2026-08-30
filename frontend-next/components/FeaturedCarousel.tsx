"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useMarkets } from "@/hooks/useMarkets";
import { useHeight } from "@/hooks/useHeight";
import { extractCat, extractImg, stripCatPrefix, STATUS, yesPct } from "@/lib/markets";
import { fmtPRX, fmtCountdown } from "@/lib/format";
import StatusPill from "./StatusPill";

export default function FeaturedCarousel() {
  const { data: markets = [] } = useMarkets();
  const { data: chain } = useHeight();
  const [idx, setIdx] = useState(0);

  const featured = useMemo(() => {
    // top 3 by volume from live/proposed markets
    return [...markets]
      .filter((m) => m.status === STATUS.LIVE || m.status === STATUS.PROPOSED)
      .sort((a, b) => Number((b.qYes + b.qNo) - (a.qYes + a.qNo)))
      .slice(0, 3);
  }, [markets]);

  if (featured.length === 0) return null;
  const m = featured[idx];
  const pct = yesPct(m);
  const total = m.qYes + m.qNo;
  const vol = total > 0n ? fmtPRX(total) : "—";
  const imgUrl = extractImg(m.rules);
  const catKey = extractCat(m.rules);
  const question = stripCatPrefix(m.question || m.rules || "");

  const prev = () => setIdx((i) => (i - 1 + featured.length) % featured.length);
  const next = () => setIdx((i) => (i + 1) % featured.length);

  return (
    <div className="relative mb-5 overflow-hidden rounded-card border border-line bg-surface-grad shadow-card">
      {imgUrl && (
        <>
          <img src={imgUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/60 to-transparent" />
        </>
      )}

      <div className="relative p-5 md:p-6">
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-pill border border-amberx/40 bg-amberx/10 px-2 py-0.5 font-mono text-[8px] uppercase tracking-[2px] text-amberx">★ Featured</span>
          <span className="rounded-pill border border-line bg-bg/60 px-2 py-0.5 font-mono text-[8px] uppercase tracking-[1.5px] text-ink-2 backdrop-blur">{catKey}</span>
          <StatusPill status={m.status} />
        </div>

        <Link href={`/market/${m.marketId}`} className="mb-4 block font-display text-[18px] font-extrabold leading-tight tracking-[-0.3px] text-ink hover:text-up md:text-[22px]">
          {question.length > 100 ? question.slice(0, 100) + "…" : question}
        </Link>

        <div className="mb-4 flex flex-wrap items-end gap-5">
          <div>
            <div className="font-mono text-[8px] uppercase tracking-[2px] text-ink-3">YES chance</div>
            <div className="font-display text-[36px] font-extrabold leading-none text-up tabular-nums md:text-[44px]">
              {pct}<span className="text-[16px] opacity-60">%</span>
            </div>
          </div>
          <div>
            <div className="font-mono text-[8px] uppercase tracking-[2px] text-ink-3">Volume</div>
            <div className="font-display text-[20px] font-extrabold text-cyanx tabular-nums">{vol}</div>
          </div>
          <div>
            <div className="font-mono text-[8px] uppercase tracking-[2px] text-ink-3">Ends</div>
            <div className="font-display text-[20px] font-extrabold text-amberx tabular-nums">
              {fmtCountdown(Number(m.expiry), chain?.height ?? 0)}
            </div>
          </div>
        </div>

        {/* controls row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={prev} className="flex h-8 w-8 items-center justify-center rounded-full border border-line-2 bg-surface text-ink-2 transition-colors hover:border-up hover:text-up" aria-label="Previous">
              ‹
            </button>
            <button onClick={next} className="flex h-8 w-8 items-center justify-center rounded-full border border-line-2 bg-surface text-ink-2 transition-colors hover:border-up hover:text-up" aria-label="Next">
              ›
            </button>
            <div className="ml-2 flex items-center gap-1.5">
              {featured.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  aria-label={`Go to slide ${i + 1}`}
                  className={`h-1.5 rounded-pill transition-all ${i === idx ? "w-6 bg-up" : "w-1.5 bg-line-2 hover:bg-line"}`}
                />
              ))}
            </div>
          </div>
          <Link
            href={`/market/${m.marketId}`}
            className="rounded-card bg-grad-up px-4 py-2 font-sans text-[11px] font-extrabold text-black shadow-glowUp hover:brightness-110"
          >
            Trade →
          </Link>
        </div>
      </div>
    </div>
  );
}
