"use client";
import Link from "next/link";
import { useMarkets } from "@/hooks/useMarkets";
import { useHeight } from "@/hooks/useHeight";
import { fmtCountdown, fmtPRX } from "@/lib/format";
import { stripCatPrefix, yesPct, STATUS } from "@/lib/markets";
import { useMemo } from "react";

export default function HomeSidebar() {
  const { data: markets = [] } = useMarkets();
  const { data: chain } = useHeight();

  const endingSoon = useMemo(() => {
    return [...markets]
      .filter((m) => m.status === STATUS.LIVE || m.status === STATUS.PROPOSED)
      .sort((a, b) => Number(a.expiry - b.expiry))
      .slice(0, 3);
  }, [markets]);

  const highVolume = useMemo(() => {
    return [...markets]
      .filter((m) => m.qYes + m.qNo > 0n)
      .sort((a, b) => Number((b.qYes + b.qNo) - (a.qYes + a.qNo)))
      .slice(0, 3);
  }, [markets]);

  const newMarkets = useMemo(() => {
    return [...markets].slice(0, 3);
  }, [markets]);

  const RailCard = ({ title, items, accent }: { title: string; items: typeof markets; accent: string }) => (
    <div className="rounded-card border border-line bg-surface-grad shadow-card">
      <div className="border-b border-line px-4 py-2.5">
        <div className="font-mono text-[9px] uppercase tracking-[2px] text-ink-3">{title}</div>
      </div>
      <div className="p-3">
        {items.length === 0 ? (
          <div className="py-4 text-center font-mono text-[9px] text-ink-3">No markets</div>
        ) : (
          <div className="space-y-2">
            {items.map((m) => {
              const pct = yesPct(m);
              const vol = m.qYes + m.qNo;
              return (
                <Link
                  key={m.marketId}
                  href={`/market/${m.marketId}`}
                  className="group block rounded-card border border-line bg-bg-2 p-2.5 transition-colors hover:border-line-2 hover:bg-surface-2"
                >
                  <div className="mb-1.5 line-clamp-2 font-sans text-[11px] font-semibold leading-tight text-ink group-hover:text-white">
                    {stripCatPrefix(m.question || m.rules || "").slice(0, 60)}
                  </div>
                  <div className="flex items-center justify-between font-mono text-[9px]">
                    <span className="text-up tabular-nums">{pct}%</span>
                    <span className={`${accent} tabular-nums`}>
                      {title === "Ending Soon" ? fmtCountdown(Number(m.expiry), chain?.height ?? 0) : fmtPRX(vol)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <aside className="hidden space-y-4 lg:block lg:w-[280px]">
      <RailCard title="Ending Soon" items={endingSoon} accent="text-amberx" />
      <RailCard title="Highest Volume" items={highVolume} accent="text-cyanx" />
      <RailCard title="New Markets" items={newMarkets} accent="text-up" />
    </aside>
  );
}
