import { create } from "zustand";

type Theme = "dark" | "light";

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

export const useTheme = create<ThemeState>((set) => ({
  theme: (typeof window !== "undefined" && (window.localStorage.getItem("praxis_theme") as Theme)) || "dark",
  setTheme: (t) => {
    set({ theme: t });
    window.localStorage.setItem("praxis_theme", t);
    document.documentElement.setAttribute("data-theme", t);
  },
  toggle: () => {
    const current = (typeof window !== "undefined" && (window.localStorage.getItem("praxis_theme") as Theme)) || "dark";
    const next = current === "dark" ? "light" : "dark";
    set({ theme: next });
    window.localStorage.setItem("praxis_theme", next);
    document.documentElement.setAttribute("data-theme", next);
  },
}));
