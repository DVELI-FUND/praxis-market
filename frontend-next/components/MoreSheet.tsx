"use client";
import Link from "next/link";
import { useUi } from "@/store/ui";
import { useWallet } from "@/store/wallet";
import { useRoles } from "@/lib/roles";
import LogoMark from "./LogoMark";
import ThemeToggle from "./ThemeToggle";
import WalletPill from "./WalletPill";

type Badge = "RESOLVER" | "ADMIN" | null;
interface NavItem { href: string; label: string; icon: string; badge?: Badge; gate?: "connected" | "resolver" | "creator" | "admin" }
interface NavSection { name: string; items: NavItem[] }

const SECTIONS: NavSection[] = [
  {
    name: "Markets",
    items: [
      { href: "/", label: "Browse Markets", icon: "◈" },
      { href: "/action/claim", label: "Claim Winnings", icon: "◎" , gate: "connected"},
      { href: "/action/reclaim", label: "Reclaim Stake", icon: "◍" , gate: "connected"},
      { href: "/resolvers", label: "Browse Resolvers", icon: "◉" },
      { href: "/action/claimcreator", label: "Claim Creator Fee", icon: "◔" , gate: "connected"},
      { href: "/action/cancel", label: "Cancel Market", icon: "✕" , gate: "creator"},
    ],
  },
  {
    name: "Rewards",
    items: [
      { href: "/rewards/resolver", label: "Resolver Rewards", icon: "", badge: "RESOLVER" , gate: "resolver"},
      { href: "/rewards/builder", label: "Builder Rewards", icon: "◎", badge: "ADMIN" , gate: "admin"},
      { href: "/rewards/community", label: "Community Rewards", icon: "◉" , gate: "admin"},
      { href: "/rewards/investor", label: "Investor Rewards", icon: "◆" , gate: "admin"},
      { href: "/rewards/protocol", label: "Protocol Rewards", icon: "◐" , gate: "admin"},
    ],
  },
  {
    name: "Account",
    items: [
      { href: "/profile", label: "Profile", icon: "◫" },
      { href: "/action/register", label: "Register", icon: "◈", badge: "RESOLVER" , gate: "connected"},
      { href: "/action/forfeit", label: "Forfeit Position", icon: "↩", badge: "RESOLVER" , gate: "resolver"},
      { href: "/action/propose", label: "Propose Outcome", icon: "⚖", badge: "RESOLVER" , gate: "resolver"},
      { href: "/action/dispute", label: "File Dispute", icon: "⚠", badge: "RESOLVER" , gate: "resolver"},
      { href: "/action/commit", label: "Commit Vote", icon: "◌", badge: "RESOLVER" , gate: "resolver"},
      { href: "/action/reveal", label: "Reveal Vote", icon: "○", badge: "RESOLVER" , gate: "resolver"},
      { href: "/action/tally", label: "Tally Votes", icon: "≡", badge: "RESOLVER" , gate: "resolver"},
      { href: "/action/slash", label: "Claim Slash", icon: "◈", badge: "RESOLVER" , gate: "resolver"},
      { href: "/action/unstake", label: "Unstake Resolver", icon: "↓", badge: "RESOLVER" , gate: "resolver"},
      { href: "/action/claimunbonded", label: "Claim Unbonded", icon: "◎", badge: "RESOLVER" , gate: "resolver"},
      { href: "/action/create", label: "Create Market", icon: "+", badge: "ADMIN" , gate: "creator"},
      { href: "/action/finalize", label: "Finalize Market", icon: "✓", badge: "ADMIN" , gate: "admin"},
      { href: "/settings", label: "Settings", icon: "⚙", badge: "ADMIN" , gate: "admin"},
    ],
  },
];

function BadgeChip({ kind }: { kind: Badge }) {
  if (!kind) return null;

  return (
    <span
      className={`ml-auto rounded border px-1.5 py-0.5 font-mono text-[7px] tracking-[1px] ${
        kind === "RESOLVER"
          ? "border-amberx/40 bg-amberx/10 text-amberx"
          : "border-bluex/40 bg-bluex/10 text-bluex"
      }`}
    >
      {kind}
    </span>
  );
}

export default function MoreSheet() {
  const open = useUi((s) => s.moreOpen);
  const setMore = useUi((s) => s.setMore);
  const roles = useRoles();
  const { status } = useWallet();
  const connected = status === "connected" || status === "drift";
  const canSee = (gate?: NavItem["gate"]) => {
    if (!gate) return true;
    if (gate === "connected") return connected;
    if (gate === "resolver") return roles.isResolver || roles.isAdmin;
    if (gate === "creator") return roles.isCreator || roles.isAdmin;
    if (gate === "admin") return roles.isAdmin || roles.isCreator;
    return true;
  };
  const visibleSections = SECTIONS.map((sec) => ({ ...sec, items: sec.items.filter((i) => canSee(i.gate)) })).filter((sec) => sec.items.length > 0);

  if (!open) return null;

  const badgeVisible = (b: Badge) =>
    !b || (b === "RESOLVER" && roles.isResolver) || (b === "ADMIN" && (roles.isAdmin || roles.isCreator));

  return (
    <div className="fixed inset-0 z-[240] bg-black/75 backdrop-blur-[4px]" onClick={() => setMore(false)}>
      <div
        className="absolute bottom-0 left-0 right-0 max-h-[78vh] overflow-y-auto rounded-t-card border-t border-line bg-surface p-4 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-ink"><LogoMark className="h-6 w-6" /></span>
            <span className="font-display text-[15px] font-extrabold tracking-widest text-ink">PRAXIS</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button className="font-mono text-[14px] text-ink-2" onClick={() => setMore(false)}>✕</button>
          </div>
        </div>

        <div className="mb-3">
          <WalletPill />
        </div>

        {visibleSections.map((sec) => (
          <div key={sec.name} className="mb-4">
            <div className="mb-1.5 font-mono text-[8px] uppercase tracking-[3px] text-ink-3">{sec.name}</div>
            <div className="space-y-1">
              {sec.items.map((it) => (
                <Link
                  key={it.href + it.label}
                  href={it.href}
                  onClick={() => setMore(false)}
                  className={`flex items-center gap-2.5 rounded-card border border-line bg-bg-2 px-3 py-2 font-mono text-[10px] text-ink-2 transition-colors hover:border-up hover:text-up ${
                    it.badge && !badgeVisible(it.badge) ? "opacity-50" : ""
                  }`}
                >
                  <span className="w-4 text-center text-[12px]">{it.icon}</span>
                  <span>{it.label}</span>
                  <BadgeChip kind={it.badge ?? null} />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
