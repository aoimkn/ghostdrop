import { defineConfig } from "@inlang/paraglide-js";

export default defineConfig({
  outdir: "./app/paraglide",
  strategy: ["cookie", "preferredLanguage", "baseLocale"],
});
