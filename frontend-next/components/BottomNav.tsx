"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUi } from "@/store/ui";

const ITEMS: { href: string | null; icon: string; label: string }[] = [
  { href: "/", icon: "◈", label: "Markets" },
  { href: null, icon: "◉", label: "Resolvers" },
  { href: null, icon: "⌕", label: "Search" },
  { href: "/profile", icon: "◫", label: "Profile" },
  { href: null, icon: "≡", label: "More" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const setMore = useUi((s) => s.setMore);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[197] flex h-[60px] items-stretch border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
      {ITEMS.map((it) => {
        const active = it.href !== null && pathname === it.href;
        const isMore = it.label === "More";
        const disabled = !it.href && !isMore;
        const cls = `flex flex-1 flex-col items-center justify-center gap-[3px] border-none bg-transparent font-mono text-[8px] uppercase tracking-[0.5px] transition-colors ${
          active ? "text-up" : "text-ink-3"
        } ${disabled ? "opacity-40" : ""}`;
        if (it.href) {
          return (
            <Link key={it.label} href={it.href} className={cls}>
              <span className="text-[20px] leading-none">{it.icon}</span>
              <span>{it.label}</span>
            </Link>
          );
        }
        return (
          <button
            key={it.label}
            className={cls}
            disabled={disabled}
            title={disabled ? "Coming in a later phase" : undefined}
            onClick={isMore ? () => setMore(true) : undefined}
          >
            <span className="text-[20px] leading-none">{it.icon}</span>
            <span>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
