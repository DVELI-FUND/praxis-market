"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUi } from "@/store/ui";
import { useRoles } from "@/lib/roles";

const ITEMS: { href: string | null; icon: string; label: string }[] = [
  { href: "/", icon: "◈", label: "Markets" },
  { href: "/rewards", icon: "◎", label: "Rewards" },
  { href: "/search", icon: "⌕", label: "Search" },
  { href: "/profile", icon: "◫", label: "Profile" },
  { href: null, icon: "≡", label: "More" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const setMore = useUi((s) => s.setMore);
  const roles = useRoles();

  const filteredItems = ITEMS.filter((it) => {
    if (it.href === "/rewards") return roles.hasAnyRole;
    return true;
  });

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[197] flex h-[64px] md:hidden items-stretch border-t border-line/60 bg-bg/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      {filteredItems.map((it) => {
        const active = it.href !== null && pathname === it.href;
        const isMore = it.label === "More";
        const cls = `relative flex flex-1 flex-col items-center justify-center gap-[3px] border-none bg-transparent font-mono text-[8px] uppercase tracking-[0.5px] transition-colors ${
          active ? "text-up" : "text-ink-3 hover:text-ink-2"
        }`;
        const inner = (
          <>
            {active && <span className="absolute top-0 h-[2px] w-8 rounded-pill bg-up shadow-glowUp" />}
            <span className={`text-[20px] leading-none ${active ? "drop-shadow-[0_0_8px_rgba(0,232,138,0.5)]" : ""}`}>{it.icon}</span>
            <span>{it.label}</span>
          </>
        );
        if (it.href) {
          return (
            <Link key={it.label} href={it.href} className={cls}>
              {inner}
            </Link>
          );
        }
        return (
          <button key={it.label} className={cls} onClick={() => setMore(true)}>
            {inner}
          </button>
        );
      })}
    </nav>
  );
}
