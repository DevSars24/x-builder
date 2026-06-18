import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it, vi } from "vitest";

import {
  JsonFilePostLibraryRepository,
  PostLibraryStorageError,
  postLibraryStoreSchema,
  type CanonicalOwnPostInput,
} from "../post-library-repository";

const importedAt = "2026-06-16T10:00:00.000Z";
const sourceHash = "sha256:7a2f4e9c1b3d5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcd";

const withTempRoot = async <T>(run: (root: string) => Promise<T>): Promise<T> => {
  const root = await mkdtemp(join(tmpdir(), "x-builder-post-library-"));

  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const post = (overrides: Partial<CanonicalOwnPostInput> = {}): CanonicalOwnPostInput => ({
  id: "post-1",
  platform: "x",
  platformPostId: "1800000000000000001",
  text: "A compact archive post.",
  createdAt: "2024-01-05T12:00:00.000Z",
  kind: "original",
  language: "en",
  replyReferences: {},
  entityFlags: {
    hasUrls: false,
    hasMedia: false,
    hasHashtags: false,
    hasMentions: false,
  },
  weakMetrics: {
    favoriteCount: 12,
    retweetCount: 3,
  },
  metricSnapshots: [
    {
      source: "archive_tweets_js",
      observedAt: "2024-01-05T12:00:00.000Z",
      importedAt,
      favoriteCount: 12,
      retweetCount: 3,
    },
  ],
  sourceRefs: [
    {
      source: "archive_tweets_js",
      importRunId: "import-1",
      rawId: "1800000000000000001",
      sourceHash,
    },
  ],
  ...overrides,
});

describe("JSON file post library repository", () => {
  it("loads an empty valid store when no library file exists", async () => {
    await withTempRoot(async (root) => {
      const repository = new JsonFilePostLibraryRepository({ root });

      const store = postLibraryStoreSchema.parse(await repository.loadStore());

      expect(store.schemaVersion).toBe(1);
      expect(store.posts).toEqual([]);
      expect(store.importRuns).toEqual([]);
      expect(store.derivedInsights).toEqual([]);
      expect(store.activeContext).toEqual({ status: "empty" });
    });
  });

  it("raises a controlled storage error for corrupt persisted JSON", async () => {
    await withTempRoot(async (root) => {
      await writeFile(join(root, "post-library.json"), "{ not valid json", "utf8");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      try {
        const repository = new JsonFilePostLibraryRepository({ root });

        await expect(repository.loadStore()).rejects.toBeInstanceOf(PostLibraryStorageError);
        expect(errorSpy).toHaveBeenCalledOnce();
      } finally {
        errorSpy.mockRestore();
      }
    });
  });

  it("upserts canonical posts by platform and platform post id", async () => {
    await withTempRoot(async (root) => {
      const repository = new JsonFilePostLibraryRepository({ root });

      const result = await repository.upsertPosts([
        post(),
        post({
          id: "post-duplicate-input",
          text: "Updated text from the same platform id.",
          weakMetrics: {
            favoriteCount: 18,
            retweetCount: 4,
          },
        }),
      ]);
      const store = await repository.loadStore();

      expect(result).toEqual({
        insertedCount: 1,
        updatedCount: 1,
        unchangedCount: 0,
        duplicateCount: 1,
      });
      expect(store.posts).toHaveLength(1);
      expect(store.posts[0]?.platformPostId).toBe("1800000000000000001");
      expect(store.posts[0]?.text).toBe("Updated text from the same platform id.");
      expect(store.posts[0]?.weakMetrics.favoriteCount).toBe(18);
    });
  });

  it("preserves metric snapshots and source refs when an existing post is updated", async () => {
    await withTempRoot(async (root) => {
      const repository = new JsonFilePostLibraryRepository({ root });

      await repository.upsertPosts([post()]);
      await repository.upsertPosts([
        post({
          text: "A compact archive post with newer metrics.",
          metricSnapshots: [
            {
              source: "archive_tweets_js",
              observedAt: "2024-02-05T12:00:00.000Z",
              importedAt: "2026-06-16T10:30:00.000Z",
              favoriteCount: 25,
              retweetCount: 6,
            },
          ],
          sourceRefs: [
            {
              source: "archive_tweets_js",
              importRunId: "import-2",
              rawId: "1800000000000000001",
              sourceHash,
            },
          ],
        }),
      ]);

      const store = await repository.loadStore();

      expect(store.posts).toHaveLength(1);
      expect(store.posts[0]?.metricSnapshots).toHaveLength(2);
      expect(store.posts[0]?.sourceRefs.map((ref) => ref.importRunId)).toEqual([
        "import-1",
        "import-2",
      ]);
    });
  });

  it("serializes concurrent upsert writes from the same repository instance", async () => {
    await withTempRoot(async (root) => {
      const repository = new JsonFilePostLibraryRepository({ root });

      await Promise.all([
        repository.upsertPosts([post({ id: "post-1", platformPostId: "1" })]),
        repository.upsertPosts([post({ id: "post-2", platformPostId: "2" })]),
        repository.upsertPosts([post({ id: "post-3", platformPostId: "3" })]),
      ]);

      const store = await repository.loadStore();

      expect(store.posts.map((item) => item.platformPostId).sort()).toEqual(["1", "2", "3"]);
    });
  });

  it("persists import runs, derived insight snapshots, and active context without raw archive contents", async () => {
    await withTempRoot(async (root) => {
      const repository = new JsonFilePostLibraryRepository({ root });
      await repository.saveImportRun({
        id: "import-1",
        sourceHash,
        assignmentPath: "window.YTD.tweets.part0",
        status: "completed",
        counts: {
          totalRecords: 1,
          validPosts: 1,
          skippedRecords: 0,
          originals: 1,
          replies: 0,
          repostReferences: 0,
          insertedPosts: 1,
          updatedPosts: 0,
          unchangedPosts: 0,
        },
        duplicates: {
          duplicateRecords: 0,
          duplicatePlatformPostIds: [],
        },
        warnings: [],
        createdAt: importedAt,
        completedAt: importedAt,
      });
      await repository.saveDerivedInsights({
        importRunId: "import-1",
        generatedAt: importedAt,
        insights: {
          generatedAt: importedAt,
          counts: {
            posts: 1,
            originals: 1,
            replies: 0,
            repostReferences: 0,
          },
          cadence: {
            postsPerWeek: 1,
            mostCommonHoursUtc: [12],
          },
          replyOriginalMix: {
            originalRatio: 1,
            replyRatio: 0,
          },
          repeatStructures: [],
          emotionalAngleRotation: [],
          weakEngagement: {
            favoriteMedian: 12,
            retweetMedian: 3,
          },
          confidence: "low",
        },
      });
      await repository.setActiveContext({
        status: "active",
        sourceImportId: "import-1",
        activatedAt: importedAt,
        scoringContextPatch: {},
        judgeHints: [],
        provenance: "Imported X archive",
        confidence: "low",
        counts: {
          posts: 1,
          originals: 1,
          replies: 0,
        },
      });

      const rawStore = await readFile(join(root, "post-library.json"), "utf8");
      const store = postLibraryStoreSchema.parse(JSON.parse(rawStore));

      expect(store.importRuns).toHaveLength(1);
      expect(store.derivedInsights).toHaveLength(1);
      expect(store.activeContext.status).toBe("active");
      expect(rawStore).not.toContain("[{\"tweet\"");
      expect(rawStore).not.toContain("contents");
    });
  });
});
