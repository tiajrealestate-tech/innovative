/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Stay independent of the inspection app's PostCSS/Tailwind config in the
  // parent folder; this project uses plain CSS.
  css: { postcss: {} },
  build: {
    // No network code in the bundle at all, not even Vite's preload helper.
    modulePreload: { polyfill: false },
    // The IRS housing table (3,223 rows) is most of the bundle; ~137 kB gzipped.
    chunkSizeWarningLimit: 700,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/tests/setup.ts"],
    css: false,
  },
});
