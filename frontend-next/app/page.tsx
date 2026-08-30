"use client";
import MarketsBoard from "@/components/MarketsBoard";
import HomeSidebar from "@/components/HomeSidebar";
import LiveTicker from "@/components/LiveTicker";
import FeaturedCarousel from "@/components/FeaturedCarousel";
import LogoMark from "@/components/LogoMark";
import { useHeight } from "@/hooks/useHeight";

const PH13B_CANARY = "PRAXIS-NEXT-PH13B";

export default function Page() {
  const { data, isError } = useHeight();
  const live = !isError && (data?.height ?? 0) > 0;

  return (
    <main className="relative z-10 mx-auto min-h-screen max-w-[1280px] px-4 py-6 pb-24 md:px-8">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="md:hidden">
          <div className="flex items-center gap-2">
            <span className="text-ink">
              <LogoMark className="h-6 w-6" />
            </span>
            <div className="bg-grad-brand bg-clip-text font-display text-lg font-extrabold tracking-widest text-transparent">
              PRAXIS
            </div>
          </div>
          <div className="font-mono text-[9px] tracking-[2px] text-ink-3">$PRX · NEXT</div>
        </div>
        <div className="flex items-center gap-2 rounded-card border border-line bg-surface px-3 py-2 font-mono text-[10px] text-ink-2">
          <span className={`h-1.5 w-1.5 rounded-full ${live ? "animate-pulseDot bg-up" : "bg-ink-3"}`} />
          <span className={live ? "text-up" : "text-down"}>{live ? "connected" : "connecting…"}</span>
          <span className="text-ink-3">#{data?.height ?? "—"}</span>
        </div>
      </header>

      <FeaturedCarousel />

      <LiveTicker />

      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          <MarketsBoard />
        </div>
        <HomeSidebar />
      </div>

      <span className="hidden" aria-hidden="true">{PH13B_CANARY}</span>
    </main>
  );
}
