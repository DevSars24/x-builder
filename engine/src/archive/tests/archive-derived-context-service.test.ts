import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ArchiveDerivedContextService,
} from "../archive-derived-context-service";
import { type CanonicalOwnPostInput } from "../../server/post-library-repository";
import { SqlitePostLibraryRepository } from "../../server/sqlite-post-library-repository";
import { openEngineDatabase } from "../../server/open-engine-database";

const sourceHash = "sha256:7a2f4e9c1b3d5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcd";
const importedAt = "2026-06-16T10:00:00.000Z";

const withTempRoot = async <T>(run: (root: string) => Promise<T>): Promise<T> => {
  const root = await mkdtemp(join(tmpdir(), "x-builder-derived-context-"));

  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const post = (index: number, kind: CanonicalOwnPostInput["kind"] = "original"): CanonicalOwnPostInput => ({
  id: `x-${index}`,
  platform: "x",
  platformPostId: String(index),
  text: index % 2 === 0 ? `What changed when local tools got faster ${index}?` : `A compact lesson about writing loops ${index}`,
  createdAt: `2026-06-${String((index % 14) + 1).padStart(2, "0")}T${String(index % 24).padStart(2, "0")}:00:00.000Z`,
  kind,
  replyReferences: kind === "reply" ? { inReplyToPostId: "root" } : {},
  entityFlags: {
    hasUrls: false,
    hasMedia: false,
    hasHashtags: index % 3 === 0,
    hasMentions: kind === "reply",
  },
  weakMetrics: {
    favoriteCount: index,
    retweetCount: Math.floor(index / 3),
  },
  metricSnapshots: [
    {
      source: "archive_tweets_js",
      observedAt: `2026-06-${String((index % 14) + 1).padStart(2, "0")}T00:00:00.000Z`,
      importedAt,
      favoriteCount: index,
      retweetCount: Math.floor(index / 3),
    },
  ],
  sourceRefs: [
    {
      source: "archive_tweets_js",
      importRunId: "import-1",
      rawId: String(index),
      sourceHash,
    },
  ],
});

describe("ArchiveDerivedContextService", () => {
  it("generates derived insights and activates compact context for eligible history", async () => {
    await withTempRoot(async (root) => {
      const repository = new SqlitePostLibraryRepository(openEngineDatabase(":memory:"));
      const service = new ArchiveDerivedContextService({
        repository,
        now: () => new Date("2026-06-16T12:00:00.000Z"),
      });
      await repository.upsertPosts(Array.from({ length: 22 }, (_, index) => post(index + 1)));

      const latest = await service.latestInsights();
      const activated = await service.activateLatest();

      expect(latest.status).toBe("ready");
      if (latest.status !== "ready") {
        throw new Error("Expected ready insights.");
      }
      expect(latest.insights.counts.posts).toBe(22);
      expect(latest.insights.weakEngagement.favoriteMedian).toBeGreaterThan(0);
      expect(latest.insights).not.toHaveProperty("trailingMedianImpressions");
      expect(activated.activeContext.status).toBe("active");
      if (activated.activeContext.status !== "active") {
        throw new Error("Expected active context.");
      }
      expect(activated.activeContext.scoringContextPatch.repeatHistory?.length).toBeGreaterThan(0);
      expect(activated.activeContext.scoringContextPatch).not.toHaveProperty("trailingMedianImpressions");
      expect(activated.activeContext.judgeHints.join(" ")).not.toContain("A compact lesson");
    });
  });

  it("preserves detected post formats when activating repeat history", async () => {
    await withTempRoot(async (root) => {
      const repository = new SqlitePostLibraryRepository(openEngineDatabase(":memory:"));
      const service = new ArchiveDerivedContextService({
        repository,
        now: () => new Date("2026-06-16T12:00:00.000Z"),
      });
      await repository.upsertPosts(
        Array.from({ length: 20 }, (_, index) => ({
          ...post(index + 1),
          text: `hot take: archive context should preserve detected format ${index + 1}`,
        })),
      );

      const activated = await service.activateLatest();

      expect(activated.activeContext.status).toBe("active");
      if (activated.activeContext.status !== "active") {
        throw new Error("Expected active context.");
      }
      expect(activated.activeContext.scoringContextPatch.repeatHistory?.[0]?.format).toBe("hot_take");
    });
  });

  it("blocks activation below the minimum authored/reply threshold", async () => {
    await withTempRoot(async (root) => {
      const repository = new SqlitePostLibraryRepository(openEngineDatabase(":memory:"));
      const service = new ArchiveDerivedContextService({
        repository,
        now: () => new Date("2026-06-16T12:00:00.000Z"),
      });
      await repository.upsertPosts([post(1), post(2)]);

      const activated = await service.activateLatest();

      expect(activated.eligibility.eligible).toBe(false);
      expect(activated.activeContext).toEqual({ status: "empty" });
      expect(activated.eligibility.blockingReasons).toContain(
        "Import at least 20 authored posts or 10 replies before activating Studio context.",
      );
    });
  });

  it("deactivates active context", async () => {
    await withTempRoot(async (root) => {
      const repository = new SqlitePostLibraryRepository(openEngineDatabase(":memory:"));
      const service = new ArchiveDerivedContextService({
        repository,
        now: () => new Date("2026-06-16T12:00:00.000Z"),
      });
      await repository.upsertPosts(Array.from({ length: 20 }, (_, index) => post(index + 1)));
      await service.activateLatest();

      const deactivated = await service.deactivate();
      const active = await service.activeContext();

      expect(deactivated.activeContext).toEqual({ status: "empty" });
      expect(active).toEqual({ status: "empty" });
    });
  });
});
