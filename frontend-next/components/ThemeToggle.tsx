"use client";
import { useTheme } from "@/store/theme";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1.5 font-mono text-[10px] text-ink-2 transition-colors hover:border-line-2 hover:text-ink"
      title="Toggle theme"
    >
      {theme === "dark" ? "☀ Light" : "● Dark"}
    </button>
  );
}
