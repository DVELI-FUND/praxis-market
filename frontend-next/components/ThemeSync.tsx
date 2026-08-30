"use client";
import { useEffect } from "react";
import { useTheme } from "@/store/theme";

// Applies the persisted theme + a brief cross-fade so toggling isn't a harsh flash.
export default function ThemeSync() {
  const theme = useTheme((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("theme-anim");
    root.setAttribute("data-theme", theme);
    const t = setTimeout(() => root.classList.remove("theme-anim"), 300);
    return () => clearTimeout(t);
  }, [theme]);
  return null;
}
