import { STATUS } from "@/lib/markets";

const PILLS: Record<number, { cls: string; dot?: boolean; label: string }> = {
  [STATUS.LIVE]: { cls: "text-up", dot: true, label: "LIVE" },
  [STATUS.CANCELLED]: { cls: "text-ink-3", label: "✕ CANCELLED" },
  [STATUS.RESOLVED]: { cls: "text-bluex", label: "◔ RESOLVED" },
  [STATUS.EXPIRED]: { cls: "text-amberx", label: "⏱ EXPIRED" },
  [STATUS.PROPOSED]: { cls: "text-amberx", label: "◆ PROPOSED" },
  [STATUS.DISPUTED]: { cls: "text-down", label: "⚠ DISPUTED" },
  [STATUS.FINALIZED]: { cls: "text-bluex", label: "✓ FINALIZED" },
  [STATUS.VOIDED]: { cls: "text-ink-3", label: "✕ VOID" },
  [STATUS.AWAITING]: { cls: "text-amberx", dot: true, label: "AWAITING RESOLUTION" },
};

export default function StatusPill({ status }: { status: number }) {
  const p = PILLS[status];
  if (!p) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[8px] font-semibold uppercase tracking-[0.5px] ${p.cls}`}
    >
      {p.dot && <span className="h-1 w-1 animate-pulseDot rounded-full bg-current" />}
      {p.label}
    </span>
  );
}
