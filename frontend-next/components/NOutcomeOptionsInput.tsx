"use client";

import { useState } from "react";
import { validateOptions } from "@/lib/nOutcome";

interface Props {
  value: string; // pipe-separated options
  onChange: (value: string) => void;
}

export default function NOutcomeOptionsInput({ value, onChange }: Props) {
  const options = value ? value.split("|").filter(o => o.trim()) : [];
  const [error, setError] = useState<string | null>(null);

  const handleOptionChange = (index: number, newValue: string) => {
    const newOptions = [...options];
    newOptions[index] = newValue;
    const joined = newOptions.join("|");
    
    // Validate
    const validationError = validateOptions(newOptions);
    setError(validationError);
    
    onChange(joined);
  };

  const addOption = () => {
    if (options.length >= 10) return;
    const newOptions = [...options, ""];
    onChange(newOptions.join("|"));
    setError(validateOptions(newOptions));
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) return;
    const newOptions = options.filter((_, i) => i !== index);
    onChange(newOptions.join("|"));
    setError(validateOptions(newOptions));
  };

  const toggleMode = () => {
    if (options.length > 0) {
      // Clear options (switch to binary)
      onChange("");
      setError(null);
    } else {
      // Add 2 default options (switch to N-outcome)
      onChange("Option A|Option B");
      setError(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[11px] uppercase tracking-[2px] text-ink-2">
          Market Type
        </div>
        <button
          type="button"
          onClick={toggleMode}
          className={`rounded-full px-3 py-1 font-mono text-[11px] font-bold transition-colors ${
            options.length > 0
              ? "bg-up/20 text-up hover:bg-up/30"
              : "bg-line text-ink-3 hover:bg-line-2"
          }`}
        >
          {options.length > 0 ? `N-Outcome (${options.length} options)` : "Binary (YES/NO)"}
        </button>
      </div>

      {options.length > 0 && (
        <div className="space-y-2">
          {options.map((opt, idx) => (
            <div key={idx} className="flex gap-2">
              <div className="flex-1">
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => handleOptionChange(idx, e.target.value)}
                  placeholder={`Option ${idx + 1}`}
                  className="w-full rounded border border-line bg-bg px-3 py-2 font-mono text-[13px] text-ink outline-none focus:border-line-2"
                  maxLength={64}
                />
              </div>
              <button
                type="button"
                onClick={() => removeOption(idx)}
                disabled={options.length <= 2}
                className="rounded border border-line bg-bg px-3 py-2 font-mono text-[13px] text-ink-3 hover:bg-line-2 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ×
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addOption}
            disabled={options.length >= 10}
            className="w-full rounded border border-line bg-bg py-2 font-mono text-[12px] text-ink-2 hover:bg-line-2 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            + Add Option
          </button>

          {error && (
            <div className="rounded border border-red-500 bg-red-500/10 px-3 py-2 font-mono text-[11px] text-red-500">
              {error}
            </div>
          )}

          <div className="rounded border border-line bg-bg p-3 font-mono text-[11px] text-ink-3">
            <div className="mb-1 text-ink-2">Preview:</div>
            <div className="flex flex-wrap gap-2">
              {options.map((opt, idx) => (
                <span
                  key={idx}
                  className="rounded bg-line px-2 py-1 text-ink-2"
                >
                  {opt || `Option ${idx + 1}`}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
