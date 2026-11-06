import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    paraglideVitePlugin({ project: "./project.inlang" }),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    reactRouter(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  resolve: { tsconfigPaths: true },
  // Rolldown does not keep module execution order across chunks by default, which runs
  // tsyringe's polyfill check (via @simplewebauthn/server) before reflect-metadata loads.
  environments: { ssr: { build: { rolldownOptions: { output: { strictExecutionOrder: true } } } } },
});
