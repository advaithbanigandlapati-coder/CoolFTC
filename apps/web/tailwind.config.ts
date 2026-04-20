import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#07070A", bg2: "#0C0C12", bg3: "#121219",
        surface: "#18181F", surface2: "#1F1F28", surface3: "#272730",
        accent: "#FF5A1F", "accent-light": "#FF7A45",
        ftc: { green: "#2DD88A", amber: "#F5A623", red: "#EF4545", blue: "#5B9CF4" },
      },
      fontFamily: {
        display: ["'Barlow Condensed'", "sans-serif"],
        body:    ["'Syne'", "sans-serif"],
        mono:    ["'DM Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
