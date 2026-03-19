import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "var(--cream)",
        "cream-dark": "var(--cream-dark)",
        ink: "var(--ink)",
        "ink-muted": "var(--ink-muted)",
        "ink-subtle": "var(--ink-subtle)",
        brand: "var(--brand)",
        "brand-hover": "var(--brand-hover)",
        "brand-muted": "var(--brand-muted)",
        border: "var(--border)",
      },
      boxShadow: {
        "brand-sm": "var(--shadow-sm)",
        "brand-md": "var(--shadow-md)",
      },
    },
  },
  plugins: [],
};
export default config;
