import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./hooks/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#05070a", 900: "#0a0e14", 850: "#0d121a", 800: "#111823", 700: "#1a2331", 600: "#243042", 500: "#3a4a60" },
        signal: { DEFAULT: "#22d3ee", dim: "#0e7490" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      keyframes: {
        scan: { "0%": { transform: "translateX(-100%)" }, "100%": { transform: "translateX(300%)" } },
        flash: { "0%": { backgroundColor: "rgba(239,68,68,0.25)" }, "100%": { backgroundColor: "transparent" } },
      },
      animation: { scan: "scan 1.6s linear infinite", flash: "flash 2.4s ease-out" },
    },
  },
  plugins: [],
};

export default config;
