import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiError,
  ActiveArchiveContext,
  ArchiveContextActivationResponse,
  ArchiveImportOverview,
  ArchiveInsightsLatestResponse,
  ArchivePostsPage,
  ArchiveTweetsImportResponse,
  ArchiveTweetsValidateResponse,
} from "@x-builder/shared";

import { ApiClientError, EngineApiClient } from "../engine-api-client";

const baseUrl = "http://127.0.0.1:4173";
const tweetsJs = 'window.YTD.tweets.part0 = [{"tweet":{"id_str":"1"}}];';
const sourceHash = "sha256:7a2f4e9c1b3d5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcd";

const validateResponse: ArchiveTweetsValidateResponse = {
  status: "valid",
  file: {
    fileName: "tweets.js",
    fileSizeBytes: tweetsJs.length,
    assignmentPath: "window.YTD.tweets.part0",
  },
  availability: {
    postIds: true,
    text: true,
    createdTimes: true,
    replyRefs: false,
    language: false,
    entities: false,
    favoriteCount: false,
    retweetCount: false,
  },
  counts: {
    totalRecords: 1,
    validPosts: 1,
    skippedRecords: 0,
    originals: 1,
    replies: 0,
    repostReferences: 0,
  },
  duplicatePreview: {
    duplicateRecords: 0,
    duplicatePlatformPostIds: [],
  },
  warnings: [],
  previews: [],
  sourceHash,
};

const importResponse: ArchiveTweetsImportResponse = {
  importRun: {
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
    createdAt: "2026-06-16T10:00:00.000Z",
    completedAt: "2026-06-16T10:00:00.000Z",
  },
  previews: [],
};

const overviewResponse: ArchiveImportOverview = {
  status: "ready",
  latestImportRun: importResponse.importRun,
  postCount: 1,
  activeContext: {
    status: "empty",
  },
};

const postsPage: ArchivePostsPage = {
  items: [],
  limit: 25,
};

const insightsResponse: ArchiveInsightsLatestResponse = {
  status: "ready",
  importRunId: "import-1",
  insights: {
    generatedAt: "2026-06-16T10:00:00.000Z",
    counts: {
      posts: 20,
      originals: 20,
      replies: 0,
      repostReferences: 0,
    },
    cadence: {
      postsPerWeek: 4,
      mostCommonHoursUtc: [12],
    },
    replyOriginalMix: {
      originalRatio: 1,
      replyRatio: 0,
    },
    repeatStructures: [],
    emotionalAngleRotation: [],
    weakEngagement: {},
    confidence: "medium",
  },
  eligibility: {
    eligible: true,
    blockingReasons: [],
    warningReasons: [],
  },
};

const activationResponse: ArchiveContextActivationResponse = {
  activeContext: {
    status: "active",
    sourceImportId: "import-1",
    activatedAt: "2026-06-16T10:00:00.000Z",
    scoringContextPatch: {},
    judgeHints: [],
    provenance: "Imported X archive",
    confidence: "medium",
    counts: {
      posts: 20,
      originals: 20,
      replies: 0,
    },
  },
  eligibility: {
    eligible: true,
    blockingReasons: [],
    warningReasons: [],
  },
};

const activeContext: ActiveArchiveContext = activationResponse.activeContext;

const jsonResponse = (payload: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
    ...init,
  });

describe("EngineApiClient archive methods", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  let client: EngineApiClient;

  beforeEach(() => {
    fetchImpl = vi.fn();
    client = new EngineApiClient({ baseUrl, fetchImpl });
  });

  it("validates archive tweets.js contents through the typed route", async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse(validateResponse));

    const result = await client.validateTweetsArchive({
      fileName: "tweets.js",
      fileSizeBytes: tweetsJs.length,
      contents: tweetsJs,
    });

    expect(result.status).toBe("valid");
    expect(fetchImpl).toHaveBeenCalledWith(
      `${baseUrl}/archive/tweets/validate`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          fileName: "tweets.js",
          fileSizeBytes: tweetsJs.length,
          contents: tweetsJs,
        }),
      }),
    );
  });

  it("imports archive tweets.js contents with the merge policy", async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse(importResponse));

    const result = await client.importTweetsArchive({
      fileName: "tweets.js",
      fileSizeBytes: tweetsJs.length,
      contents: tweetsJs,
      duplicatePolicy: "merge_update",
    });

    expect(result.importRun.counts.insertedPosts).toBe(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      `${baseUrl}/archive/tweets/import`,
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("loads latest archive overview and paginated posts", async () => {
    fetchImpl
      .mockResolvedValueOnce(jsonResponse(overviewResponse))
      .mockResolvedValueOnce(jsonResponse(postsPage));

    await expect(client.getLatestArchiveImport()).resolves.toEqual(overviewResponse);
    await expect(client.getArchivePosts({ limit: 25, cursor: "offset:25" })).resolves.toEqual(
      postsPage,
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      `${baseUrl}/archive/posts?limit=25&cursor=offset%3A25`,
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("preserves normalized archive API errors", async () => {
    const apiError: ApiError = {
      code: "archive_storage_failed",
      message: "The local archive library could not be saved. Try again.",
      scope: "archive",
      retryable: true,
      status: 500,
    };
    fetchImpl.mockResolvedValueOnce(jsonResponse(apiError, { status: 500 }));

    await expect(
      client.importTweetsArchive({
        fileName: "tweets.js",
        fileSizeBytes: tweetsJs.length,
        contents: tweetsJs,
        duplicatePolicy: "merge_update",
      }),
    ).rejects.toMatchObject({
      apiError,
    });
  });

  it("loads insights and manages active archive context", async () => {
    fetchImpl
      .mockResolvedValueOnce(jsonResponse(insightsResponse))
      .mockResolvedValueOnce(jsonResponse(activationResponse))
      .mockResolvedValueOnce(jsonResponse(activeContext))
      .mockResolvedValueOnce(jsonResponse({
        ...activationResponse,
        activeContext: { status: "empty" },
      }));

    await expect(client.getLatestArchiveInsights()).resolves.toEqual(insightsResponse);
    await expect(client.activateArchiveContext()).resolves.toEqual(activationResponse);
    await expect(client.getActiveArchiveContext()).resolves.toEqual(activeContext);
    await expect(client.deactivateArchiveContext()).resolves.toMatchObject({
      activeContext: { status: "empty" },
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      `${baseUrl}/archive/insights/latest`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      `${baseUrl}/archive/context/activate`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      `${baseUrl}/archive/context/active`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      4,
      `${baseUrl}/archive/context/deactivate`,
      expect.objectContaining({ method: "POST" }),
    );
  });
});
