/**
 * Oracle-INDEPENDENT loadStore() shape pins.
 *
 * Two behavior-preservation invariants are currently pinned at FIELD LEVEL only
 * through the JSON repository used as a parity/faithfulness oracle:
 *
 *   1. sqlite-post-library-repository.test.ts "AC2 / AC3 — parity with the JSON
 *      repository" asserts `expect(sqliteStore).toEqual(jsonStore)` over the full
 *      parityBatch() round-trip. The concrete counts ({insertedCount:4,...}) and the
 *      concrete post order (["post-tie-a","post-tie-b","post-mixed","post-archive"])
 *      are also pinned literally there and survive the oracle's removal — but the
 *      per-post FIELD shape (metricSnapshots incl. importedAt, sourceRefs,
 *      weakMetrics, entityFlags, replyReferences, profileSnapshots) is pinned ONLY
 *      via `toEqual(jsonStore)`.
 *
 *   2. import-post-library-json.test.ts AC1 "imports faithfully" asserts
 *      `expect(sqliteStore).toEqual(expectedStore)` where expectedStore is the JSON
 *      repository's load of the same file. The table-count + .migrated rename
 *      assertions are oracle-independent, but the imported-store FIELD shape (across
 *      every collection) is pinned ONLY via that JSON-oracle comparison.
 *
 * When the JSON repository is retired, both `toEqual(oracle)` lines disappear. This
 * suite re-pins the same observable outcomes against a concrete expected shape
 * sourced from the SQLite repository / the importer directly — no JSON oracle — so
 * that field-level coverage survives the oracle's removal.
 *
 * These tests assert OBSERVABLE BEHAVIOR (the loadStore() value), never module
 * layout, and must PASS against current code. The only normalization is the
 * write-time `updatedAt` (store-level and per-post), which both repos stamp at save
 * time with nowIso(); everything else is asserted exactly.
 *
 * Isolation: in-memory SQLite (openEngineDatabase(":memory:")) and mkdtemp json
 * roots only. The user's real ~/.x-builder corpus is never touched.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  postLibraryStoreSchema,
  type CanonicalOwnPost,
  type CanonicalOwnPostInput,
  type PostLibraryStore,
} from "../post-library-repository.js";
import { openEngineDatabase } from "../open-engine-database.js";
import { SqlitePostLibraryRepository } from "../sqlite-post-library-repository.js";
import { importPostLibraryJsonToSqlite } from "../import-post-library-json.js";

const importedAt = "2026-06-16T10:00:00.000Z";
const sourceHash = "sha256:7a2f4e9c1b3d5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcd";
const otherSourceHash =
  "sha256:0011223344556677889900112233445566778899001122334455667788990011";

// ---------------------------------------------------------------------------
// Shared write-time-timestamp normalization. store.updatedAt and every
// post.updatedAt are stamped nowIso() at save/read time, so they are not part of
// the round-trip identity; we blank them. Everything else stays asserted exactly.
// ---------------------------------------------------------------------------
const stripWriteTimestamps = (store: PostLibraryStore): PostLibraryStore => ({
  ...store,
  updatedAt: "<normalized>",
  posts: store.posts.map((post) => ({ ...post, updatedAt: "<normalized>" })),
});

// A SQLite repo backed by a fresh in-memory database opened directly.
const memorySqliteRepository = (): SqlitePostLibraryRepository =>
  new SqlitePostLibraryRepository(openEngineDatabase(":memory:"));

// ===========================================================================
// PIN 1 — parityBatch() full loadStore() shape, captured from SQLite directly.
// Replicates the parityBatch() fixture from sqlite-post-library-repository.test.ts
// verbatim so this pin covers exactly the batch the oracle-dependent toEqual covers.
// ===========================================================================

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

const parityBatch = (): CanonicalOwnPostInput[] => [
  post({
    id: "post-archive",
    platformPostId: "1700000000000000001",
    text: "Archive post with two same-observedAt snapshots.",
    createdAt: "2024-01-01T00:00:00.000Z",
    metricSnapshots: [
      {
        source: "archive_tweets_js",
        observedAt: "2024-01-01T00:00:00.000Z",
        importedAt: "2026-06-16T10:00:00.000Z",
        favoriteCount: 4,
        retweetCount: 1,
      },
      {
        source: "archive_tweets_js",
        observedAt: "2024-01-01T00:00:00.000Z",
        importedAt: "2026-06-17T10:00:00.000Z",
        favoriteCount: 9,
        retweetCount: 2,
      },
    ],
    sourceRefs: [
      {
        source: "archive_tweets_js",
        importRunId: "import-1",
        rawId: "1700000000000000001",
        sourceHash,
      },
    ],
  }),
  post({
    id: "post-mixed",
    platformPostId: "1700000000000000002",
    text: "Archive post later observed live.",
    createdAt: "2024-06-01T00:00:00.000Z",
    metricSnapshots: [
      {
        source: "archive_tweets_js",
        observedAt: "2026-06-20T08:55:00.000Z",
        importedAt: "2026-06-20T09:00:00.000Z",
        favoriteCount: 5,
        retweetCount: 1,
      },
      {
        source: "x_live_capture",
        capturedAt: "2026-06-20T08:55:00.000Z",
        impressions: 1200,
        likes: 9,
      },
    ],
    sourceRefs: [
      {
        source: "archive_tweets_js",
        importRunId: "import-2",
        rawId: "1700000000000000002",
        sourceHash: otherSourceHash,
      },
      {
        source: "x_live_capture",
        captureSessionId: "session-mixed",
        rawId: "1700000000000000002",
      },
    ],
  }),
  post({
    id: "post-tie-b",
    platformPostId: "1700000000000000003",
    text: "Tie-break sibling B (same createdAt as A).",
    createdAt: "2024-12-31T00:00:00.000Z",
  }),
  post({
    id: "post-tie-a",
    platformPostId: "1700000000000000004",
    text: "Tie-break sibling A (same createdAt as B).",
    createdAt: "2024-12-31T00:00:00.000Z",
  }),
];

// The concrete expected full store for parityBatch(), modulo the normalized
// write-time updatedAt. This is the field-level shape that the oracle-dependent
// `expect(sqliteStore).toEqual(jsonStore)` is the ONLY thing pinning today.
const expectedParityStore: PostLibraryStore = {
  schemaVersion: 2,
  updatedAt: "<normalized>",
  posts: [
    {
      id: "post-tie-a",
      platform: "x",
      platformPostId: "1700000000000000004",
      text: "Tie-break sibling A (same createdAt as B).",
      createdAt: "2024-12-31T00:00:00.000Z",
      kind: "original",
      language: "en",
      replyReferences: {},
      entityFlags: { hasUrls: false, hasMedia: false, hasHashtags: false, hasMentions: false },
      weakMetrics: { favoriteCount: 12, retweetCount: 3 },
      metricSnapshots: [
        {
          source: "archive_tweets_js",
          observedAt: "2024-01-05T12:00:00.000Z",
          importedAt: "2026-06-16T10:00:00.000Z",
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
      updatedAt: "<normalized>",
    },
    {
      id: "post-tie-b",
      platform: "x",
      platformPostId: "1700000000000000003",
      text: "Tie-break sibling B (same createdAt as A).",
      createdAt: "2024-12-31T00:00:00.000Z",
      kind: "original",
      language: "en",
      replyReferences: {},
      entityFlags: { hasUrls: false, hasMedia: false, hasHashtags: false, hasMentions: false },
      weakMetrics: { favoriteCount: 12, retweetCount: 3 },
      metricSnapshots: [
        {
          source: "archive_tweets_js",
          observedAt: "2024-01-05T12:00:00.000Z",
          importedAt: "2026-06-16T10:00:00.000Z",
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
      updatedAt: "<normalized>",
    },
    {
      id: "post-mixed",
      platform: "x",
      platformPostId: "1700000000000000002",
      text: "Archive post later observed live.",
      createdAt: "2024-06-01T00:00:00.000Z",
      kind: "original",
      language: "en",
      replyReferences: {},
      entityFlags: { hasUrls: false, hasMedia: false, hasHashtags: false, hasMentions: false },
      weakMetrics: { favoriteCount: 12, retweetCount: 3 },
      metricSnapshots: [
        {
          source: "archive_tweets_js",
          observedAt: "2026-06-20T08:55:00.000Z",
          importedAt: "2026-06-20T09:00:00.000Z",
          favoriteCount: 5,
          retweetCount: 1,
        },
        {
          source: "x_live_capture",
          capturedAt: "2026-06-20T08:55:00.000Z",
          impressions: 1200,
          likes: 9,
        },
      ],
      sourceRefs: [
        {
          source: "archive_tweets_js",
          importRunId: "import-2",
          rawId: "1700000000000000002",
          sourceHash: otherSourceHash,
        },
        {
          source: "x_live_capture",
          captureSessionId: "session-mixed",
          rawId: "1700000000000000002",
        },
      ],
      updatedAt: "<normalized>",
    },
    {
      id: "post-archive",
      platform: "x",
      platformPostId: "1700000000000000001",
      text: "Archive post with two same-observedAt snapshots.",
      createdAt: "2024-01-01T00:00:00.000Z",
      kind: "original",
      language: "en",
      replyReferences: {},
      entityFlags: { hasUrls: false, hasMedia: false, hasHashtags: false, hasMentions: false },
      weakMetrics: { favoriteCount: 12, retweetCount: 3 },
      metricSnapshots: [
        {
          source: "archive_tweets_js",
          observedAt: "2024-01-01T00:00:00.000Z",
          importedAt: "2026-06-16T10:00:00.000Z",
          favoriteCount: 4,
          retweetCount: 1,
        },
        {
          source: "archive_tweets_js",
          observedAt: "2024-01-01T00:00:00.000Z",
          importedAt: "2026-06-17T10:00:00.000Z",
          favoriteCount: 9,
          retweetCount: 2,
        },
      ],
      sourceRefs: [
        {
          source: "archive_tweets_js",
          importRunId: "import-1",
          rawId: "1700000000000000001",
          sourceHash,
        },
      ],
      updatedAt: "<normalized>",
    },
  ],
  importRuns: [],
  derivedInsights: [],
  activeContext: { status: "empty" },
  profileSnapshots: [],
};

describe("SQLite loadStore() shape — oracle-independent pins", () => {
  describe("PIN 1 — parityBatch() full round-trip field shape (no JSON oracle)", () => {
    it("loadStore() of parityBatch() equals the concrete expected store (every per-post field, both snapshot kinds, both ref kinds, order), modulo write-time updatedAt", async () => {
      const repository = memorySqliteRepository();

      const result = await repository.upsertPosts(parityBatch());
      const store = stripWriteTimestamps(await repository.loadStore());

      // The counts pin survives in the existing AC2 test too; restated here so this
      // file is a self-contained replacement for the oracle comparison.
      expect(result).toEqual({
        insertedCount: 4,
        updatedCount: 0,
        unchangedCount: 0,
        duplicateCount: 0,
      });

      // The whole-store field-level shape that `toEqual(jsonStore)` was the sole
      // pin for — now asserted against a concrete value instead of the oracle.
      // (loadStore() itself runs postLibraryStoreSchema.parse, so a returned store is
      // schema-valid by construction; this concrete shape is what the oracle pinned.)
      expect(store).toEqual(expectedParityStore);
    });

    it("pins the loaded post order createdAt DESC then id ASC for the tied pair", async () => {
      const repository = memorySqliteRepository();

      await repository.upsertPosts(parityBatch());
      const store = await repository.loadStore();

      expect(store.posts.map((item) => item.id)).toEqual([
        "post-tie-a",
        "post-tie-b",
        "post-mixed",
        "post-archive",
      ]);
    });
  });

  // =========================================================================
  // PIN 2 — importer faithfulness: imported loadStore() equals a concrete store.
  // Replicates the v2Store() fixture from import-post-library-json.test.ts verbatim
  // (every collection populated) so this pin covers exactly the store the
  // oracle-dependent faithfulness toEqual covers.
  // =========================================================================

  describe("PIN 2 — imported v2 store full field shape (no JSON oracle)", () => {
    const canonicalPost = (overrides: Partial<CanonicalOwnPost> = {}): CanonicalOwnPost => ({
      id: "post-1",
      platform: "x",
      platformPostId: "1800000000000000001",
      text: "A compact archive post.",
      createdAt: "2024-01-05T12:00:00.000Z",
      kind: "original",
      language: "en",
      replyReferences: {},
      entityFlags: { hasUrls: false, hasMedia: false, hasHashtags: false, hasMentions: false },
      weakMetrics: { favoriteCount: 12, retweetCount: 3 },
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
      updatedAt: importedAt,
      ...overrides,
    });

    const importRun = {
      id: "import-1",
      sourceHash,
      assignmentPath: "tweets.js",
      status: "completed" as const,
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
      duplicates: { duplicateRecords: 0, duplicatePlatformPostIds: [] },
      warnings: [],
      createdAt: importedAt,
      completedAt: importedAt,
    };

    const derivedInsightSnapshot = {
      importRunId: "import-1",
      generatedAt: importedAt,
      insights: {
        generatedAt: importedAt,
        counts: { posts: 1, originals: 1, replies: 0, repostReferences: 0 },
        cadence: { postsPerWeek: 1, mostCommonHoursUtc: [12] },
        replyOriginalMix: { originalRatio: 1, replyRatio: 0 },
        repeatStructures: [],
        emotionalAngleRotation: [],
        weakEngagement: {},
        confidence: "low" as const,
      },
    };

    const activeContext = {
      status: "active" as const,
      sourceImportId: "import-1",
      activatedAt: importedAt,
      scoringContextPatch: {},
      judgeHints: [],
      provenance: "Imported X archive",
      confidence: "low" as const,
      counts: { posts: 1, originals: 1, replies: 0 },
    };

    const profileSnapshot = {
      platformUserId: "user-123",
      screenName: "founder",
      followers: 980,
      capturedAt: "2026-06-20T08:55:00.000Z",
    };

    const v2Store = (posts: CanonicalOwnPost[] = [canonicalPost()]): PostLibraryStore =>
      postLibraryStoreSchema.parse({
        schemaVersion: 2,
        updatedAt: importedAt,
        posts,
        importRuns: [importRun],
        derivedInsights: [derivedInsightSnapshot],
        activeContext,
        profileSnapshots: [profileSnapshot],
      });

    // The concrete expected imported store (modulo write-time updatedAt). This is
    // the field-level shape the importer-test faithfulness `toEqual(expectedStore)`
    // (JSON oracle) is the sole pin for: posts + importRuns + derivedInsights +
    // activeContext + profileSnapshots all reconstructed from SQLite.
    const expectedImportedStore: PostLibraryStore = {
      schemaVersion: 2,
      updatedAt: "<normalized>",
      posts: [
        {
          id: "post-1",
          platform: "x",
          platformPostId: "1800000000000000001",
          text: "A compact archive post.",
          createdAt: "2024-01-05T12:00:00.000Z",
          kind: "original",
          language: "en",
          replyReferences: {},
          entityFlags: { hasUrls: false, hasMedia: false, hasHashtags: false, hasMentions: false },
          weakMetrics: { favoriteCount: 12, retweetCount: 3 },
          metricSnapshots: [
            {
              source: "archive_tweets_js",
              observedAt: "2024-01-05T12:00:00.000Z",
              importedAt: "2026-06-16T10:00:00.000Z",
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
          updatedAt: "<normalized>",
        },
      ],
      importRuns: [importRun],
      derivedInsights: [derivedInsightSnapshot],
      activeContext,
      profileSnapshots: [profileSnapshot],
    };

    const withTempJsonRoot = async <T>(run: (root: string) => Promise<T>): Promise<T> => {
      const root = await mkdtemp(join(tmpdir(), "x-builder-loadstore-shape-pin-"));

      try {
        return await run(root);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    };

    it("importer's SQLite loadStore() equals the concrete expected store across every collection, modulo write-time updatedAt", async () => {
      await withTempJsonRoot(async (root) => {
        await writeFile(
          join(root, "post-library.json"),
          `${JSON.stringify(v2Store(), null, 2)}\n`,
          "utf8",
        );
        const db = openEngineDatabase(":memory:");

        importPostLibraryJsonToSqlite(root, db);

        const store = stripWriteTimestamps(
          await new SqlitePostLibraryRepository(db).loadStore(),
        );

        expect(store).toEqual(expectedImportedStore);
      });
    });
  });
});
