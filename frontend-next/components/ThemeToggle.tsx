"use client";
import { useTheme } from "@/store/theme";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="flex h-8 w-8 items-center justify-center rounded-pill border border-line-2 bg-surface font-mono text-[12px] text-ink-2 transition-colors hover:border-up hover:text-up"
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
