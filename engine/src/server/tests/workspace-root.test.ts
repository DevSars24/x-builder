import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveWorkspaceRoot } from "../workspace-root";

async function withTempDirectory<T>(callback: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "x-builder-workspace-root-"));

  try {
    return await callback(root);
  } finally {
    await rm(root, {
      recursive: true,
      force: true,
    });
  }
}

describe("resolveWorkspaceRoot", () => {
  it("walks upward from a nested cwd to the nearest .git directory", async () => {
    await withTempDirectory(async (root) => {
      const outer = join(root, "outer");
      const inner = join(outer, "packages", "client");
      const nestedCwd = join(inner, "src", "routes");

      await mkdir(join(outer, ".git"), { recursive: true });
      await mkdir(join(inner, ".git"), { recursive: true });
      await mkdir(nestedCwd, { recursive: true });

      expect(resolveWorkspaceRoot(nestedCwd)).toBe(inner);
    });
  });

  it("returns null when no workspace root can be resolved", async () => {
    await withTempDirectory(async (root) => {
      const nestedCwd = join(root, "not-a-repo", "src");

      await mkdir(nestedCwd, { recursive: true });

      expect(resolveWorkspaceRoot(nestedCwd)).toBeNull();
    });
  });
});
