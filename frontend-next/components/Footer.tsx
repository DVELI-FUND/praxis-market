"use client";
import Link from "next/link";
import LogoMark from "./LogoMark";

export default function Footer() {
  return (
    <footer className="relative z-10 mt-10 border-t border-line bg-surface-grad">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-ink"><LogoMark className="h-5 w-5" /></span>
          <span className="font-display text-[13px] font-extrabold tracking-widest text-ink">PRAXIS</span>
          <span className="font-mono text-[9px] text-ink-3">· live on Canopy</span>
        </div>
        <nav className="flex flex-wrap items-center gap-4 font-mono text-[10px] text-ink-2">
          <Link href="/resolution" className="transition-colors hover:text-up">Resolution</Link>
          <Link href="/resolvers" className="transition-colors hover:text-up">Resolvers</Link>
          <Link href="/rewards" className="transition-colors hover:text-up">Rewards</Link>
          <Link href="/watchlist" className="transition-colors hover:text-up">Watchlist</Link>
          <a href="https://github.com/Makaveli912/praxis-market" target="_blank" rel="noreferrer" className="transition-colors hover:text-up">GitHub</a>
        </nav>
        <div className="font-mono text-[9px] text-ink-3">© 2026 Praxis · v1.0</div>
      </div>
    </footer>
  );
}
