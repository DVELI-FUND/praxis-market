"use client";

import { useMemo } from "react";
import { MAX_OUTCOMES, MIN_OUTCOMES, validateOptions } from "@/lib/nOutcome";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function NOutcomeOptionsInput({ value, onChange }: Props) {
  // Keep empty segments while typing so input indexes never shift
  const options = value === "" ? [] : value.split("|");
  const active = options.length > 0;
  // Derived, not stored: the error can never go stale
  const error = useMemo(() => (active ? validateOptions(options) : null), [value]);

  const commit = (next: string[]) => onChange(next.join("|"));
  const edit = (i: number, v: string) => { const n = options.slice(); n[i] = v; commit(n); };
  const add = () => { if (options.length >= MAX_OUTCOMES) return; commit([...options, ""]); };
  const remove = (i: number) => { if (options.length <= MIN_OUTCOMES) return; commit(options.filter((_, x) => x !== i)); };
  const toggle = () => onChange(active ? "" : "Option 1|Option 2");

  const filled = options.filter((o) => o.trim() !== "");

  return (
    <div className="rounded-card border border-line bg-bg-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[2px] text-ink-3">Market type</span>
        <button
          type="button"
          onClick={toggle}
          className={`rounded-pill px-2.5 py-1 font-mono text-[11px] font-bold transition-colors ${
            active ? "bg-up/15 text-up" : "bg-line text-ink-3 hover:text-ink-2"
          }`}
        >
          {active ? `N-Outcome · ${options.length}/${MAX_OUTCOMES}` : "Binary · YES/NO"}
        </button>
      </div>

      {active && (
        <>
          <div className="mt-3 space-y-2">
            {options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center font-mono text-[11px] text-ink-3">{idx + 1}</span>
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => edit(idx, e.target.value)}
                  placeholder={`Option ${idx + 1} label`}
                  maxLength={64}
                  className="min-w-0 flex-1 rounded-card border border-line bg-bg px-3 py-2 font-mono text-[13px] text-ink outline-none transition-colors focus:border-up"
                />
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  disabled={options.length <= MIN_OUTCOMES}
                  className="shrink-0 rounded-card border border-line bg-bg px-2.5 py-2 font-mono text-[13px] text-ink-3 transition-colors hover:border-down hover:text-down disabled:cursor-not-allowed disabled:opacity-30"
                  title="Remove option"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={add}
            disabled={options.length >= MAX_OUTCOMES}
            className="mt-2 w-full rounded-card border border-dashed border-line bg-transparent py-2 font-mono text-[12px] text-ink-2 transition-colors hover:border-up hover:text-up disabled:cursor-not-allowed disabled:opacity-30"
          >
            + Add option ({options.length}/{MAX_OUTCOMES})
          </button>

          {error && (
            <div className="mt-2 rounded-card border border-down/40 bg-down-dim px-3 py-2 font-mono text-[11px] text-down">
              {error}
            </div>
          )}

          {filled.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[1.5px] text-ink-3">Preview:</span>
              {filled.map((o, i) => (
                <span key={i} className="rounded-pill border border-line bg-bg px-2 py-0.5 font-mono text-[11px] text-ink-2">{o}</span>
              ))}
            </div>
          )}
        </>
      )}

      {!active && (
        <div className="mt-2 font-mono text-[11px] leading-relaxed text-ink-3">
          Binary market — outcomes use the custom YES/NO labels above. Toggle to N-Outcome to list 2–10 custom outcomes: one shared pool, one live price per option.
        </div>
      )}
    </div>
  );
}
