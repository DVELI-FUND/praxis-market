"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import WalletPill from "./WalletPill";
import ThemeToggle from "./ThemeToggle";
import { useUi } from "@/store/ui";
import LogoMark from "./LogoMark";

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
      <div className="mx-auto flex h-[56px] max-w-[1200px] items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-ink">
            <LogoMark className="h-[22px] w-[22px]" />
          </span>
          <span className="font-display text-[16px] font-extrabold tracking-widest text-ink">
            PRAXIS
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-pill px-3 py-1.5 font-mono text-[11px] transition-colors ${
                pathname === l.href ? "bg-surface-2 text-up" : "text-ink-2 hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Link href="/search" className="flex items-center gap-2 rounded-pill border border-line bg-surface px-3 py-1.5 font-mono text-[10px] text-ink-3 transition-colors hover:border-line-2 hover:text-ink">
            ⌕ Search Markets
          </Link>
          <ThemeToggle />
          <button onClick={() => useUi.getState().setMore(true)} className="rounded-pill border border-line-2 bg-surface px-3 py-1.5 font-mono text-[10px] text-ink-2 transition-colors hover:border-up hover:text-up">
            ≡ More
          </button>
          <WalletPill />
        </div>
      </div>
    </header>
  );
}
