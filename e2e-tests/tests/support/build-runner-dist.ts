import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export default async function buildRunnerDist(): Promise<void> {
  if (process.env.XB_E2E_SKIP_BUILD === "1") {
    return;
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(here, "..", "..", "..");

  execFileSync(
    "pnpm",
    ["--dir", repoRoot, "--filter", "@x-builder/runner...", "build"],
    { stdio: "inherit" },
  );
}
