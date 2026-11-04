import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        eco: { DEFAULT: "#D80017", dark: "#A80012", soft: "#FDECEE" },
        ink: { DEFAULT: "#1A1A1A", muted: "#5F6368" },
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Roboto", "'Noto Sans'", "'Noto Sans Devanagari'", "'Segoe UI'", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
