import { describe, expect, expectTypeOf, it } from "vitest";
import {
  activeArchiveContextSchema,
  archiveImportOverviewSchema,
  apiErrorSchema,
  archiveDerivedInsightsSchema,
  archiveImportRunSchema,
  archivePostsPageSchema,
  archivePostPreviewSchema,
  archiveTweetsImportRequestSchema,
  archiveTweetsImportResponseSchema,
  archiveTweetsValidateRequestSchema,
  archiveTweetsValidateResponseSchema,
  type ActiveArchiveContext,
  type ArchiveDerivedInsights,
  type ArchiveImportOverview,
  type ArchiveImportRun,
  type ArchivePostsPage,
  type ArchivePostPreview,
  type ArchiveTweetsImportRequest,
  type ArchiveTweetsImportResponse,
  type ArchiveTweetsValidateRequest,
  type ArchiveTweetsValidateResponse,
} from "../../index";

const importedAt = "2026-06-16T10:00:00.000Z";
const sourceHash = "sha256:7a2f4e9c1b3d5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcd";

const request = {
  fileName: "tweets.js",
  fileSizeBytes: 2048,
  contents: 'window.YTD.tweets.part0 = [{"tweet":{"id":"1"}}]',
};

const postPreview = {
  id: "x-post-1",
  platformPostId: "1800000000000000001",
  kind: "original",
  textPreview: "A short post preview",
  createdAt: "2024-01-05T12:00:00.000Z",
  entityFlags: {
    hasUrls: false,
    hasMedia: false,
    hasHashtags: true,
    hasMentions: false,
  },
  weakMetrics: {
    favoriteCount: 12,
    retweetCount: 3,
  },
};

const insights = {
  generatedAt: importedAt,
  counts: {
    posts: 42,
    originals: 30,
    replies: 10,
    repostReferences: 2,
  },
  cadence: {
    postsPerWeek: 4.2,
    mostCommonHoursUtc: [9, 14],
  },
  replyOriginalMix: {
    originalRatio: 0.72,
    replyRatio: 0.24,
  },
  repeatStructures: [
    {
      label: "problem-observation",
      count: 8,
      examples: ["A compact pattern"],
    },
  ],
  emotionalAngleRotation: [
    {
      angle: "curious",
      count: 11,
    },
  ],
  weakEngagement: {
    favoriteMedian: 6,
    favoriteP90: 28,
    retweetMedian: 1,
    retweetP90: 7,
  },
  confidence: "medium",
};

describe("archive import schemas", () => {
  it("exports archive schemas and inferred types from the shared entrypoint", () => {
    expect(archiveTweetsValidateRequestSchema).toBeDefined();
    expect(archiveTweetsValidateResponseSchema).toBeDefined();
    expect(archiveTweetsImportRequestSchema).toBeDefined();
    expect(archiveTweetsImportResponseSchema).toBeDefined();
    expect(archiveImportRunSchema).toBeDefined();
    expect(archiveImportOverviewSchema).toBeDefined();
    expect(archivePostPreviewSchema).toBeDefined();
    expect(archiveDerivedInsightsSchema).toBeDefined();
    expect(activeArchiveContextSchema).toBeDefined();
    expect(archivePostsPageSchema).toBeDefined();

    expectTypeOf<ArchiveTweetsValidateRequest>().toMatchTypeOf<
      ReturnType<typeof archiveTweetsValidateRequestSchema.parse>
    >();
    expectTypeOf<ArchiveTweetsValidateResponse>().toMatchTypeOf<
      ReturnType<typeof archiveTweetsValidateResponseSchema.parse>
    >();
    expectTypeOf<ArchiveTweetsImportRequest>().toMatchTypeOf<
      ReturnType<typeof archiveTweetsImportRequestSchema.parse>
    >();
    expectTypeOf<ArchiveTweetsImportResponse>().toMatchTypeOf<
      ReturnType<typeof archiveTweetsImportResponseSchema.parse>
    >();
    expectTypeOf<ArchiveImportRun>().toMatchTypeOf<
      ReturnType<typeof archiveImportRunSchema.parse>
    >();
    expectTypeOf<ArchivePostPreview>().toMatchTypeOf<
      ReturnType<typeof archivePostPreviewSchema.parse>
    >();
    expectTypeOf<ArchiveDerivedInsights>().toMatchTypeOf<
      ReturnType<typeof archiveDerivedInsightsSchema.parse>
    >();
    expectTypeOf<ArchiveImportOverview>().toMatchTypeOf<
      ReturnType<typeof archiveImportOverviewSchema.parse>
    >();
    expectTypeOf<ActiveArchiveContext>().toMatchTypeOf<
      ReturnType<typeof activeArchiveContextSchema.parse>
    >();
    expectTypeOf<ArchivePostsPage>().toMatchTypeOf<
      ReturnType<typeof archivePostsPageSchema.parse>
    >();
  });

  it("parses archive validation request metadata and contents", () => {
    const parsed = archiveTweetsValidateRequestSchema.parse(request);

    expect(parsed.fileName).toBe("tweets.js");
    expect(parsed.fileSizeBytes).toBe(2048);
    expect(parsed.contents).toContain("window.YTD.tweets");
  });

  it("rejects empty file names and oversized contents strings", () => {
    expect(
      archiveTweetsValidateRequestSchema.safeParse({
        ...request,
        fileName: "",
      }).success,
    ).toBe(false);

    expect(
      archiveTweetsValidateRequestSchema.safeParse({
        ...request,
        contents: "x".repeat(20_000_001),
      }).success,
    ).toBe(false);
  });

  it("parses a valid validation response with safe counts, warnings, previews, and source hash", () => {
    const parsed = archiveTweetsValidateResponseSchema.parse({
      status: "valid",
      file: {
        fileName: "tweets.js",
        fileSizeBytes: 2048,
        assignmentPath: "window.YTD.tweets.part0",
      },
      availability: {
        postIds: true,
        text: true,
        createdTimes: true,
        replyRefs: true,
        language: true,
        entities: true,
        favoriteCount: true,
        retweetCount: true,
      },
      counts: {
        totalRecords: 42,
        validPosts: 42,
        skippedRecords: 0,
        originals: 30,
        replies: 10,
        repostReferences: 2,
      },
      duplicatePreview: {
        duplicateRecords: 2,
        duplicatePlatformPostIds: ["1800000000000000001"],
      },
      warnings: [
        {
          code: "weak_metrics_only",
          message: "Archive favorites and retweets are weak historical signals.",
        },
      ],
      previews: [postPreview],
      sourceHash,
    });

    expect(parsed.status).toBe("valid");
    if (parsed.status !== "valid") {
      throw new Error("Expected a valid archive validation response.");
    }
    expect(parsed.counts.validPosts).toBe(42);
    expect(parsed.warnings[0]?.code).toBe("weak_metrics_only");
    expect(parsed.sourceHash).toBe(sourceHash);
  });

  it("drops future-only archive metrics at the response boundary", () => {
    const parsed = archivePostPreviewSchema.parse({
      ...postPreview,
      weakMetrics: {
        favoriteCount: 12,
        retweetCount: 3,
        impressionCount: 1000,
        bookmarkCount: 5,
      },
    });

    expect(parsed.weakMetrics).toEqual({
      favoriteCount: 12,
      retweetCount: 3,
    });
    expect(parsed.weakMetrics).not.toHaveProperty("impressionCount");
    expect(parsed.weakMetrics).not.toHaveProperty("bookmarkCount");
  });

  it("parses a partial validation response with a source hash", () => {
    const parsed = archiveTweetsValidateResponseSchema.parse({
      status: "partial",
      file: {
        fileName: "tweets.js",
        fileSizeBytes: 2048,
        assignmentPath: "window.YTD.tweets.part0",
      },
      availability: {
        postIds: true,
        text: true,
        createdTimes: true,
        replyRefs: false,
        language: false,
        entities: false,
        favoriteCount: true,
        retweetCount: true,
      },
      counts: {
        totalRecords: 5,
        validPosts: 3,
        skippedRecords: 2,
        originals: 2,
        replies: 1,
        repostReferences: 0,
      },
      duplicatePreview: {
        duplicateRecords: 0,
        duplicatePlatformPostIds: [],
      },
      warnings: [
        {
          code: "records_skipped",
          message: "Some records could not be imported.",
        },
      ],
      previews: [postPreview],
      sourceHash,
    });

    expect(parsed.status).toBe("partial");
    expect(parsed.counts.skippedRecords).toBe(2);
  });

  it("parses an invalid validation response without requiring source hash or previews", () => {
    const parsed = archiveTweetsValidateResponseSchema.parse({
      status: "invalid",
      file: {
        fileName: "likes.js",
        fileSizeBytes: 512,
      },
      availability: {
        postIds: false,
        text: false,
        createdTimes: false,
        replyRefs: false,
        language: false,
        entities: false,
        favoriteCount: false,
        retweetCount: false,
      },
      counts: {
        totalRecords: 0,
        validPosts: 0,
        skippedRecords: 0,
        originals: 0,
        replies: 0,
        repostReferences: 0,
      },
      duplicatePreview: {
        duplicateRecords: 0,
        duplicatePlatformPostIds: [],
      },
      warnings: [
        {
          code: "unsupported_assignment",
          message: "Select data/tweets.js from your X archive.",
        },
      ],
    });

    expect(parsed.status).toBe("invalid");
    expect(parsed).not.toHaveProperty("sourceHash");
    expect(parsed).not.toHaveProperty("previews");
  });

  it("rejects malformed archive import duplicate policies", () => {
    expect(
      archiveTweetsImportRequestSchema.safeParse({
        ...request,
        duplicatePolicy: "replace_all",
      }).success,
    ).toBe(false);

    expect(
      archiveTweetsImportRequestSchema.safeParse({
        ...request,
        duplicatePolicy: "merge_update",
      }).success,
    ).toBe(true);
  });

  it("parses an archive import run summary", () => {
    const importRun = {
      id: "import-1",
      sourceHash,
      assignmentPath: "window.YTD.tweets.part0",
      status: "completed",
      counts: {
        totalRecords: 42,
        validPosts: 41,
        skippedRecords: 1,
        originals: 29,
        replies: 10,
        repostReferences: 2,
        insertedPosts: 38,
        updatedPosts: 3,
        unchangedPosts: 0,
      },
      duplicates: {
        duplicateRecords: 2,
        duplicatePlatformPostIds: ["1800000000000000001"],
      },
      warnings: [
        {
          code: "records_skipped",
          message: "One record was skipped.",
        },
      ],
      createdAt: importedAt,
      completedAt: importedAt,
    };
    const parsed = archiveImportRunSchema.parse(importRun);

    expect(parsed.status).toBe("completed");
    expect(parsed.counts.insertedPosts).toBe(38);

    expect(
      archiveTweetsImportResponseSchema.parse({
        importRun,
        previews: [postPreview],
      }).previews,
    ).toHaveLength(1);

    const overview = archiveImportOverviewSchema.parse({
      status: "ready",
      latestImportRun: importRun,
      postCount: 41,
      activeContext: {
        status: "empty",
      },
    });

    expect(overview.status).toBe("ready");
  });

  it("parses archive derived insights without impression calibration fields", () => {
    const parsed = archiveDerivedInsightsSchema.parse({
      ...insights,
      trailingMedianImpressions: 1234,
    });

    expect(parsed.weakEngagement.favoriteMedian).toBe(6);
    expect(parsed).not.toHaveProperty("trailingMedianImpressions");
  });

  it("parses empty and active archive context lookup responses", () => {
    expect(activeArchiveContextSchema.parse({ status: "empty" })).toEqual({ status: "empty" });

    const active = activeArchiveContextSchema.parse({
      status: "active",
      sourceImportId: "import-1",
      activatedAt: importedAt,
      scoringContextPatch: {
        repeatHistory: [
          {
            format: "insight_share",
            lastPostedAt: "2026-06-15T08:00:00.000Z",
            countLast7d: 2,
          },
        ],
        trailingMedianImpressions: 999,
      },
      judgeHints: ["Often writes compact observation-led posts."],
      provenance: "Imported X archive",
      confidence: "high",
      counts: {
        posts: 42,
        originals: 30,
        replies: 10,
      },
    });

    expect(active.status).toBe("active");
    if (active.status !== "active") {
      throw new Error("Expected an active archive context.");
    }
    expect(active.scoringContextPatch).not.toHaveProperty("trailingMedianImpressions");
  });

  it("parses cursor-paginated archive post pages and rejects invalid cursors", () => {
    const parsed = archivePostsPageSchema.parse({
      items: [postPreview],
      nextCursor: "createdAt:2024-01-05T12:00:00.000Z:id:x-post-1",
      limit: 25,
    });

    expect(parsed.items).toHaveLength(1);
    expect(parsed.limit).toBe(25);

    expect(
      archivePostsPageSchema.safeParse({
        items: [],
        nextCursor: "",
        limit: 25,
      }).success,
    ).toBe(false);
  });

  it("accepts archive and library scoped API errors through the closed error contract", () => {
    expect(
      apiErrorSchema.safeParse({
        code: "archive_validation_failed",
        message: "The selected file is not a supported tweets.js archive file.",
        scope: "archive",
        retryable: false,
        status: 400,
      }).success,
    ).toBe(true);

    expect(
      apiErrorSchema.safeParse({
        code: "library_storage_failed",
        message: "The local post library could not be saved.",
        scope: "library",
        retryable: true,
        status: 500,
      }).success,
    ).toBe(true);
  });
});
