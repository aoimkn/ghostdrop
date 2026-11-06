import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    // E2E builds point this at a copy whose messages are their own keys, so tests can find
    // elements whatever the copy says.
    paraglideVitePlugin({ project: process.env.PARAGLIDE_PROJECT ?? "./project.inlang" }),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    reactRouter(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  resolve: { tsconfigPaths: true },
  // Each build gets its own id so browsers see a changed service worker and replace it.
  define: { "import.meta.env.BUILD_ID": JSON.stringify(Date.now().toString(36)) },
  // Rolldown does not keep module execution order across chunks by default, which runs
  // tsyringe's polyfill check (via @simplewebauthn/server) before reflect-metadata loads.
  environments: { ssr: { build: { rolldownOptions: { output: { strictExecutionOrder: true } } } } },
});
