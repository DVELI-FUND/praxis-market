"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import WalletPill from "./WalletPill";
import ThemeToggle from "./ThemeToggle";
import LogoMark from "./LogoMark";
import { useUi } from "@/store/ui";

const LINKS = [
  { href: "/", label: "Markets" },
  { href: "/rewards", label: "Rewards" },
  { href: "/resolvers", label: "Resolvers" },
  { href: "/resolution", label: "Resolution" },
  { href: "/profile", label: "Portfolio" },
];

export default function TopNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-[190] hidden border-b border-line/60 bg-bg/85 backdrop-blur-xl md:block">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-4 px-5">
        {/* brand */}
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="text-ink">
            <LogoMark className="h-[22px] w-[22px]" />
          </span>
          <span className="font-display text-[15px] font-extrabold tracking-widest text-ink">PRAXIS</span>
        </Link>

        {/* links */}
        <nav className="flex min-w-0 items-center gap-0.5">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`whitespace-nowrap rounded-pill px-2.5 py-1.5 font-mono text-[10px] transition-colors lg:px-3 lg:text-[11px] ${
                pathname === l.href ? "bg-surface-2 text-up" : "text-ink-2 hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* right cluster */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Link
            href="/search"
            className="hidden items-center gap-2 rounded-pill border border-line bg-surface px-3 py-1.5 font-mono text-[10px] text-ink-3 transition-colors hover:border-line-2 hover:text-ink lg:flex"
            title="Search markets (Ctrl+K)"
          >
            ⌕ Search
            <span className="rounded border border-line px-1 text-[8px] text-ink-3">/</span>
          </Link>
          <ThemeToggle />
          <button
            onClick={() => useUi.getState().setMore(true)}
            className="flex h-8 w-8 items-center justify-center rounded-pill border border-line-2 bg-surface font-mono text-[12px] text-ink-2 transition-colors hover:border-up hover:text-up"
            title="More actions"
          >
            ≡
          </button>
          <div className="shrink-0">
            <WalletPill />
          </div>
        </div>
      </div>
    </header>
  );
}
