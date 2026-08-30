"use client";
import { useEffect } from "react";
import { useTheme } from "@/store/theme";

// Applies the persisted theme to <html data-theme="…"> from a client context.
export default function ThemeSync() {
  const theme = useTheme((s) => s.theme);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  return null;
}
