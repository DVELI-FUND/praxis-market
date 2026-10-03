"use client";
import { useState } from "react";
import type { Holder } from "@/lib/detail";
import { fmtPRX } from "@/lib/format";

const MEDAL = ["bg-amberx text-black", "bg-[#9ca3af] text-black", "bg-[#b45309] text-black"];

export default function HoldersTab({ holders, options = [] }: { holders: Holder[]; options?: string[] }) {
  const isN = options.length > 0;
  const tabs: string[] = isN ? options : ["YES", "NO"];
  const [sel, setSel] = useState(0);
  const idx = Math.min(sel, tabs.length - 1);
  const isYes = !isN && idx === 0;
  const color = isN ? "text-up" : isYes ? "text-up" : "text-down";

  const rows = holders
    .map((h) => {
      const v = isN ? h.shares[idx] ?? 0n : idx === 0 ? h.sharesYes : h.sharesNo;
      return { addr: String(h.address || ""), amt: BigInt(Math.round(Number(v) || 0)) };
    })
    .filter((r) => r.addr && r.amt > 0n)
    .sort((a, b) => Number(b.amt - a.amt))
    .slice(0, 10);

  return (
    <div className="p-4">
      <div className={`mb-3 gap-1 rounded-card border border-line bg-bg-2 p-1 ${isN ? "flex flex-wrap" : "grid grid-cols-2"}`}>
        {tabs.map((label, i) => (
          <button
            key={`${i}-${label}`}
            onClick={() => setSel(i)}
            className={`rounded-card px-3 py-1.5 font-mono text-[12px] font-bold uppercase transition-colors ${isN ? "max-w-full truncate" : ""} ${
              idx === i ? (isN || i === 0 ? "bg-up text-black" : "bg-down text-black") : "text-ink-3 hover:text-ink-2"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="py-6 text-center font-mono text-[12px] text-ink-3">No {tabs[idx]} holders yet</div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={r.addr} className="flex items-center gap-3 rounded-card border border-line bg-bg-2 px-3 py-2">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold ${i < 3 ? MEDAL[i] : "bg-surface-3 text-ink-3"}`}>{i + 1}</span>
              <span
                className="h-6 w-6 shrink-0 rounded-full border border-line"
                style={{ background: `conic-gradient(from 0deg, hsl(${(parseInt(r.addr.slice(2, 6), 16) || 0) % 360} 70% 45%), hsl(${(parseInt(r.addr.slice(6, 10), 16) || 0) % 360} 70% 35%), hsl(${(parseInt(r.addr.slice(2, 6), 16) || 0) % 360} 70% 45%))` }}
              />
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-2">{r.addr.slice(0, 10)}…{r.addr.slice(-4)}</span>
              <span className={`font-mono text-[13px] font-bold tabular-nums ${color}`}>{fmtPRX(r.amt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
