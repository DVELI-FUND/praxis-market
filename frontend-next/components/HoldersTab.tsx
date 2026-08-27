"use client";
import { useState } from "react";
import type { Holder } from "@/lib/detail";
import { fmtPRX } from "@/lib/format";

interface Props {
  holders: Holder[];
}

export default function HoldersTab({ holders }: Props) {
  const [side, setSide] = useState<"yes" | "no">("yes");

  if (!holders.length) {
    return <div className="py-5 text-center font-mono text-[11px] text-ink-3">No holders yet</div>;
  }

  const filtered = holders
    .filter((h) => (side === "yes" ? h.sharesYes > 0n : h.sharesNo > 0n))
    .sort((a, b) => Number((side === "yes" ? b.sharesYes - a.sharesYes : b.sharesNo - a.sharesNo)))
    .slice(0, 10);

  if (!filtered.length) {
    return <div className="py-5 text-center font-mono text-[11px] text-ink-3">No {side.toUpperCase()} holders yet</div>;
  }

  return (
    <div>
      <div className="flex gap-1 border-b border-line px-4 py-2">
        <button
          onClick={() => setSide("yes")}
          className={`rounded px-3 py-1 font-mono text-[9px] uppercase tracking-[1px] ${
            side === "yes" ? "bg-up-dim text-up" : "text-ink-3 hover:text-ink-2"
          }`}
        >
          YES
        </button>
        <button
          onClick={() => setSide("no")}
          className={`rounded px-3 py-1 font-mono text-[9px] uppercase tracking-[1px] ${
            side === "no" ? "bg-down-dim text-down" : "text-ink-3 hover:text-ink-2"
          }`}
        >
          NO
        </button>
      </div>
      {filtered.map((h, i) => {
        const shortAddr = h.address.slice(0, 6) + "…" + h.address.slice(-4);
        const amt = side === "yes" ? h.sharesYes : h.sharesNo;
        const color = side === "yes" ? "text-up" : "text-down";
        return (
          <div key={h.address} className="flex items-center gap-2 border-b border-line px-4 py-2.5 last:border-b-0">
            <span className="font-mono text-[9px] text-ink-3">#{i + 1}</span>
            <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-surface-2 font-mono text-[10px] text-up">
              {h.address.slice(0, 2).toUpperCase()}
            </div>
            <span className="font-mono text-[10px] text-ink-2">{shortAddr}</span>
            <span className={`ml-auto font-mono text-[11px] font-bold tabular-nums ${color}`}>{fmtPRX(amt)}</span>
          </div>
        );
      })}
    </div>
  );
}
