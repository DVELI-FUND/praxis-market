import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: "rgb(var(--bg) / <alpha-value>)", 2: "rgb(var(--bg-2) / <alpha-value>)" },
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          2: "rgb(var(--surface-2) / <alpha-value>)",
          3: "rgb(var(--surface-3) / <alpha-value>)",
        },
        line: { DEFAULT: "rgb(var(--line) / <alpha-value>)", 2: "rgb(var(--line-2) / <alpha-value>)" },
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          2: "rgb(var(--ink-2) / <alpha-value>)",
          3: "rgb(var(--ink-3) / <alpha-value>)",
        },
        up: {
          DEFAULT: "rgb(var(--up) / <alpha-value>)",
          dim: "rgb(var(--up) / 0.08)",
          glow: "rgb(var(--up) / 0.35)",
        },
        down: {
          DEFAULT: "rgb(var(--down) / <alpha-value>)",
          dim: "rgb(var(--down) / 0.08)",
          glow: "rgb(var(--down) / 0.3)",
        },
        amberx: "rgb(var(--amberx) / <alpha-value>)",
        bluex: "rgb(var(--bluex) / <alpha-value>)",
        cyanx: "rgb(var(--cyanx) / <alpha-value>)",
        tealx: "rgb(var(--tealx) / <alpha-value>)",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        sans: ["var(--font-sans)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: { card: "14px", pill: "999px" },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px rgba(0,0,0,0.45)",
        cardHover: "0 1px 0 rgba(255,255,255,0.05) inset, 0 14px 40px rgba(0,0,0,0.55)",
        glowUp: "0 0 24px rgba(0,232,138,0.18)",
        glowDown: "0 0 24px rgba(255,77,107,0.16)",
      },
      backgroundImage: {
        "grad-up": "linear-gradient(135deg, #00e88a 0%, #00b8d4 100%)",
        "grad-down": "linear-gradient(135deg, #ff4d6b 0%, #ff8a3d 100%)",
        "grad-brand": "linear-gradient(120deg, #00e88a 0%, #22d3ee 60%, #4f8cff 100%)",
        "surface-grad": "linear-gradient(180deg, rgb(var(--surface-2)) 0%, rgb(var(--surface)) 100%)",
      },
      keyframes: {
        fadeUp: { "0%": { opacity: "0", transform: "translateY(10px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        pulseDot: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.3" } },
        glowPulse: { "0%,100%": { opacity: "0.5" }, "50%": { opacity: "1" } },
      },
      animation: {
        fadeUp: "fadeUp 0.45s cubic-bezier(0.16,1,0.3,1) both",
        pulseDot: "pulseDot 2s ease-in-out infinite",
        glowPulse: "glowPulse 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
