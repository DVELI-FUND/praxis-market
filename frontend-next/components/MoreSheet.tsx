"use client";
import Link from "next/link";
import { useUi } from "@/store/ui";
import { useRoles } from "@/lib/roles";
import { ACTION_SECTIONS, ACTIONS } from "@/lib/actions";

export default function MoreSheet() {
  const open = useUi((s) => s.moreOpen);
  const setMore = useUi((s) => s.setMore);
  const roles = useRoles();

  if (!open) return null;

  const allowed = (gate?: "resolver" | "admin" | "creator") =>
    !gate ||
    (gate === "resolver" && roles.isResolver) ||
    (gate === "admin" && (roles.isAdmin || roles.isCreator)) ||
    (gate === "creator" && (roles.isCreator || roles.isAdmin));

  return (
    <div className="fixed inset-0 z-[240] bg-black/75 backdrop-blur-[4px]" onClick={() => setMore(false)}>
      <div
        className="absolute bottom-0 left-0 right-0 max-h-[70vh] overflow-y-auto rounded-t-card border-t border-line bg-surface p-4 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="font-display text-[15px] font-extrabold">More</div>
          <button className="font-mono text-[14px] text-ink-2" onClick={() => setMore(false)}>
            ✕
          </button>
        </div>
        {ACTION_SECTIONS.filter((sec) => allowed(sec.gate)).map((sec) => (
          <div key={sec.name} className="mb-4">
            <div className="mb-1.5 font-mono text-[8px] uppercase tracking-[3px] text-ink-3">{sec.name}</div>
            <div className="grid grid-cols-2 gap-1.5">
              {sec.keys.map((k) => (
                <Link
                  key={k}
                  href={`/action/${k}`}
                  onClick={() => setMore(false)}
                  className="rounded-card border border-line bg-bg-2 px-3 py-2 font-mono text-[10px] text-ink-2 transition-colors hover:border-up hover:text-up"
                >
                  {ACTIONS[k].title}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
