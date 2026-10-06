"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import WalletPill from "./WalletPill";
import ThemeToggle from "./ThemeToggle";
import LogoMark from "./LogoMark";
import { useUi } from "@/store/ui";
import { useRoles } from "@/lib/roles";

type Item = { href: string; label: string };

const CATEGORIES: Item[] = [
  { href: "/sports", label: "Sports" },
  { href: "/esports", label: "Esports" },
  { href: "/crypto", label: "Crypto" },
  { href: "/politics", label: "Politics" },
  { href: "/finance", label: "Finance" },
];

const RESOLVE: Item[] = [
  { href: "/resolvers", label: "Resolvers" },
  { href: "/resolution", label: "Resolution" },
  { href: "/rewards", label: "Rewards" },
];

const LINK = "whitespace-nowrap rounded-pill px-3 py-1.5 text-[14px] font-medium transition-colors";
const ON = "bg-surface-2 text-ink";
const OFF = "text-ink-2 hover:text-ink";

const Svg = ({ children, className = "h-4 w-4" }: { children: React.ReactNode; className?: string }) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    {children}
  </svg>
);

function NavMenu({ label, items, pathname }: { label: string; items: Item[]; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = items.some((i) => pathname === i.href);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`${LINK} flex items-center gap-1 ${active || open ? ON : OFF}`}
      >
        {label}
        <Svg className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M5 8l5 5 5-5" />
        </Svg>
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-[200] mt-2 min-w-[180px] rounded-card border border-line bg-surface p-1.5 shadow-card">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              role="menuitem"
              className={`block rounded-lg px-3 py-2 text-[14px] transition-colors ${
                pathname === i.href ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {i.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TopNav() {
  const pathname = usePathname();
  const roles = useRoles();
  const resolveItems = RESOLVE.filter((i) => (i.href === "/rewards" ? roles.hasAnyRole : true));

  return (
    <header className="sticky top-0 z-[190] hidden border-b border-line/60 bg-bg/85 backdrop-blur-xl md:block">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-6 px-5">
        {/* brand */}
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="text-ink">
            <LogoMark className="h-[22px] w-[22px]" />
          </span>
          <span className="font-logo text-[16px] font-extrabold tracking-widest text-ink">PRAXIS</span>
        </Link>

        {/* primary navigation */}
        <nav className="flex min-w-0 items-center gap-1" aria-label="Primary">
          <Link href="/" className={`${LINK} ${pathname === "/" ? ON : OFF}`}>
            Markets
          </Link>
          <NavMenu label="Categories" items={CATEGORIES} pathname={pathname} />
          <Link href="/profile" className={`${LINK} ${pathname === "/profile" ? ON : OFF}`}>
            Portfolio
          </Link>
          <NavMenu label="Resolve" items={resolveItems} pathname={pathname} />
        </nav>

        {/* right cluster */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Link
            href="/search"
            className="hidden items-center gap-2 rounded-pill border border-line bg-surface px-3 py-1.5 text-[13px] text-ink-3 transition-colors hover:border-line-2 hover:text-ink lg:flex"
            title="Search markets (Ctrl+K)"
          >
            <Svg>
              <circle cx="9" cy="9" r="5.5" />
              <path d="M13.5 13.5L17 17" />
            </Svg>
            Search
            <span className="rounded border border-line px-1.5 text-[11px] text-ink-3">/</span>
          </Link>
          <Link
            href="/search"
            aria-label="Search markets"
            className="flex h-8 w-8 items-center justify-center rounded-pill border border-line-2 bg-surface text-ink-2 transition-colors hover:border-up hover:text-up lg:hidden"
          >
            <Svg>
              <circle cx="9" cy="9" r="5.5" />
              <path d="M13.5 13.5L17 17" />
            </Svg>
          </Link>
          <ThemeToggle />
          <button
            onClick={() => useUi.getState().setMore(true)}
            aria-label="More actions"
            title="More actions"
            className="flex h-8 w-8 items-center justify-center rounded-pill border border-line-2 bg-surface text-ink-2 transition-colors hover:border-up hover:text-up"
          >
            <Svg>
              <path d="M4 6h12M4 10h12M4 14h12" />
            </Svg>
          </button>
          <div className="shrink-0">
            <WalletPill />
          </div>
        </div>
      </div>
    </header>
  );
}
