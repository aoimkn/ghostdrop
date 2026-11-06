import { defineConfig } from "@playwright/test";

const PORT = 5287;

export default defineConfig({
  testDir: "./test/browser",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}`, channel: "chrome", trace: "retain-on-failure" },
  webServer: {
    command: `node test/browser/prepare.ts && react-router dev --port ${PORT} --strictPort`,
    env: { PARAGLIDE_PROJECT: "test/browser/.generated/project.inlang" },
    url: `http://localhost:${PORT}/sign-in`,
    reuseExistingServer: false,
  },
});
