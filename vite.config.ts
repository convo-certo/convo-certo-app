import { bundledNotices } from "./scripts/bundled-notices-plugin.mjs";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths(), bundledNotices()],
  test: {
    environment: "jsdom",
    include: ["app/**/*.{test,spec}.{ts,tsx}", "scripts/**/*.test.js"],
  },
});
