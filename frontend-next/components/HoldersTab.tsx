"use client";
import { useState } from "react";
import type { Holder } from "@/lib/detail";
import { fmtPRX } from "@/lib/format";

const MEDAL = ["bg-amberx text-black", "bg-[#9ca3af] text-black", "bg-[#b45309] text-black"];

export default function HoldersTab({ holders }: { holders: Holder[] }) {
  const [side, setSide] = useState<"yes" | "no">("yes");

  const rows = holders
    .map((h) => ({ addr: String(h.address || ""), amt: BigInt(Math.round(Number(side === "yes" ? h.sharesYes : h.sharesNo) || 0)) }))
    .filter((r) => r.addr && r.amt > 0n)
    .sort((a, b) => Number(b.amt - a.amt))
    .slice(0, 10);

  return (
    <div className="p-4">
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-card border border-line bg-bg-2 p-1">
        {(["yes", "no"] as const).map((s) => (
          <button key={s} onClick={() => setSide(s)} className={`rounded-card py-1.5 font-mono text-[10px] font-bold uppercase transition-colors ${side === s ? (s === "yes" ? "bg-up text-black" : "bg-down text-black") : "text-ink-3 hover:text-ink-2"}`}>
            {s}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="py-6 text-center font-mono text-[10px] text-ink-3">No {side.toUpperCase()} holders yet</div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={r.addr} className="flex items-center gap-3 rounded-card border border-line bg-bg-2 px-3 py-2">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[9px] font-bold ${i < 3 ? MEDAL[i] : "bg-surface-3 text-ink-3"}`}>{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-ink-2">{r.addr.slice(0, 10)}…{r.addr.slice(-4)}</span>
              <span className={`font-mono text-[11px] font-bold tabular-nums ${side === "yes" ? "text-up" : "text-down"}`}>{fmtPRX(r.amt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
