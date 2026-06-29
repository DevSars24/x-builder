import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "compose-cockpit-overlay-flow.spec.ts",
  globalSetup: "./tests/support/build-runner-dist.ts",
  timeout: 45_000,
  expect: { timeout: 7_500 },
  use: { trace: "retain-on-failure" },
});
