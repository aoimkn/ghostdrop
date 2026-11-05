import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    paraglideVitePlugin({ project: "./project.inlang" }),
    cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } }),
    reactRouter(),
  ],
  resolve: { tsconfigPaths: true },
  test: { passWithNoTests: true },
});
