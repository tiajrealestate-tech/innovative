import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // HyperReports AI brand (from the Aug 2026 branding page):
        // navy ground, electric blue, cyan pulse accent.
        brand: {
          50: "#eef4ff",
          100: "#d9e6ff",
          500: "#104EDB",
          600: "#0c3eb2",
          700: "#0a338f",
        },
        navy: "#0B132B",
        pulse: "#00E5FF",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        display: ["var(--font-saira)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
