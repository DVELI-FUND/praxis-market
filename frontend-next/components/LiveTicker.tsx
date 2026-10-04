"use client";
import Link from "next/link";
import { useMarkets } from "@/hooks/useMarkets";
import { extractOutcomes, stripCatPrefix, yesPct , marketVol } from "@/lib/markets";
import { fmtPRX } from "@/lib/format";

export default function LiveTicker() {
  const { data: markets = [] } = useMarkets();
  const live = markets.filter((m) => marketVol(m) >= 100_000000n); // >= 100 PRX, skip test junk
  if (live.length === 0) return null;
  const items = [...live, ...live]; // duplicate for seamless loop

  return (
    <div className="ticker-wrap mb-5 overflow-hidden rounded-card border border-line bg-surface-grad">
      <div className="ticker-track flex animate-ticker items-center gap-8 px-4 py-2">
        {items.map((m, i) => {
          const pct = yesPct(m);
          return (
            <Link
              key={m.marketId + i}
              href={`/market/${m.marketId}`}
              className="flex shrink-0 items-center gap-2 font-mono text-[12px]"
            >
              <span className="h-1 w-1 rounded-full bg-up animate-pulseDot" />
              <span className="max-w-[220px] truncate text-ink-2">{stripCatPrefix(m.question || m.rules || "")}</span>
              <span className="text-up tabular-nums">{extractOutcomes(m.rules).yes} {pct}¢</span>
              <span className="text-ink-3 tabular-nums">Vol {fmtPRX(marketVol(m))}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
