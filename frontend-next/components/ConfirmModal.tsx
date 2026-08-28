"use client";
import { answerConfirm, useConfirm } from "@/store/confirm";

export default function ConfirmModal() {
  const open = useConfirm((s) => s.open);
  const title = useConfirm((s) => s.title);
  const rows = useConfirm((s) => s.rows);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[230] flex items-center justify-center bg-black/70 p-4 backdrop-blur-[4px]"
      onClick={() => answerConfirm(false)}
    >
      <div
        className="w-full max-w-sm rounded-card border border-line bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-display text-[15px] font-extrabold">{title}</div>
        <div className="mb-3 font-mono text-[9px] text-ink-3">review before signing · canopy network</div>
        <div className="mb-4 space-y-1.5">
          {rows.map(([l, v, cls], i) => (
            <div key={i} className="flex justify-between gap-3 font-mono text-[10px]">
              <span className="text-ink-3">{l}</span>
              <span className={cls === "g" ? "text-up" : cls === "r" ? "text-down" : "text-ink"}>{v}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            className="flex-1 rounded-card border border-line-2 py-2 font-mono text-[10px] text-ink-2 transition-colors hover:text-ink"
            onClick={() => answerConfirm(false)}
          >
            Cancel
          </button>
          <button
            className="flex-1 rounded-card bg-up py-2 font-sans text-[12px] font-bold text-black transition-all hover:brightness-110"
            onClick={() => answerConfirm(true)}
          >
            Sign & Send
          </button>
        </div>
      </div>
    </div>
  );
}
