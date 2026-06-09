import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function resolveWorkspaceRoot(startCwd: string): string | null {
  let candidate = resolve(startCwd);

  while (true) {
    if (existsSync(join(candidate, ".git"))) {
      return candidate;
    }

    const parent = dirname(candidate);
    if (parent === candidate) {
      return null;
    }

    candidate = parent;
  }
}
