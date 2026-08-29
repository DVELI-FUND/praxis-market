import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: "#05070b", 2: "#0a0e15" },
        surface: { DEFAULT: "#0d131d", 2: "#131b29", 3: "#1a2436" },
        line: { DEFAULT: "#1c2940", 2: "#2a3b58" },
        ink: { DEFAULT: "#eef4ff", 2: "#8aa0c4", 3: "#41506d" },
        up: { DEFAULT: "#00e88a", dim: "rgba(0,232,138,0.08)", glow: "rgba(0,232,138,0.35)" },
        down: { DEFAULT: "#ff4d6b", dim: "rgba(255,77,107,0.08)", glow: "rgba(255,77,107,0.3)" },
        amberx: "#ffb020",
        bluex: "#4f8cff",
        cyanx: "#22d3ee",
        tealx: "#2dd4bf",
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
        "surface-grad": "linear-gradient(180deg, #131b29 0%, #0d131d 100%)",
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
