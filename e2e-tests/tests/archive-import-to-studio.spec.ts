import { expect, test, type Route } from "@playwright/test";

import {
  engineBaseUrl,
  fulfillJson,
  fulfillPreflight,
  requestJson,
  stubEngine,
} from "./support/engine-stub";

const sourceHash = "sha256:7a2f4e9c1b3d5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcd";

const activeContext = {
  status: "active",
  sourceImportId: "import-1",
  activatedAt: "2026-06-16T10:00:00.000Z",
  scoringContextPatch: {
    repeatHistory: [
      {
        format: "insight_share",
        lastPostedAt: "2026-06-15T10:00:00.000Z",
        countLast7d: 2,
      },
    ],
  },
  judgeHints: ["Historical cadence is about 4 posts per week."],
  provenance: "Imported X archive",
  confidence: "medium",
  counts: {
    posts: 20,
    originals: 20,
    replies: 0,
  },
} as const;

const emptyContext = { status: "empty" } as const;

const counts = {
  totalRecords: 20,
  validPosts: 20,
  skippedRecords: 0,
  originals: 20,
  replies: 0,
  repostReferences: 0,
};

const validationResponse = {
  status: "valid",
  file: {
    fileName: "tweets.js",
    fileSizeBytes: 1000,
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
  counts,
  duplicatePreview: {
    duplicateRecords: 0,
    duplicatePlatformPostIds: [],
  },
  warnings: [
    {
      code: "weak_metrics_only",
      message: "Archive favorites and retweets are weak historical signals, not impressions.",
    },
  ],
  previews: [],
  sourceHash,
};

const importRun = {
  id: "import-1",
  sourceHash,
  assignmentPath: "window.YTD.tweets.part0",
  status: "completed",
  counts: {
    ...counts,
    insertedPosts: 20,
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
} as const;

const insights = {
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
    weakEngagement: {
      favoriteMedian: 5,
      retweetMedian: 1,
    },
    confidence: "medium",
  },
  eligibility: {
    eligible: true,
    blockingReasons: [],
    warningReasons: [],
  },
} as const;

function analysisResponse(text: string) {
  return {
    items: [
      {
        status: "score_failed",
        id: "draft",
        text,
        reason: "analysis_failed",
        message: "Stubbed analysis complete.",
        retryable: true,
      },
    ],
  };
}

test("imports archive context and activates it in Studio without sending raw history", async ({ page }) => {
  let imported = false;
  let active = false;
  const analyzeRequests: unknown[] = [];

  await stubEngine(page, {
    onAnalyze: async (route) => {
      const body = requestJson(route);
      analyzeRequests.push(body);
      const text =
        typeof body === "object" &&
        body !== null &&
        "items" in body &&
        Array.isArray((body as { items: unknown }).items)
          ? (((body as { items: Array<{ text?: string }> }).items[0]?.text) ?? "")
          : "";

      await fulfillJson(route, 200, analysisResponse(text));
    },
  });

  const archiveRoute = async (route: Route) => {
    if (route.request().method() === "OPTIONS") {
      await fulfillPreflight(route);
      return;
    }

    const url = route.request().url();

    if (url.endsWith("/archive/imports/latest")) {
      await fulfillJson(
        route,
        200,
        imported
          ? {
              status: "ready",
              latestImportRun: importRun,
              postCount: 20,
              activeContext: active ? activeContext : emptyContext,
            }
          : {
              status: "empty",
              activeContext: emptyContext,
            },
      );
      return;
    }

    if (url.endsWith("/archive/insights/latest")) {
      await fulfillJson(
        route,
        200,
        imported
          ? insights
          : {
              status: "empty",
              eligibility: {
                eligible: false,
                blockingReasons: ["Import at least 20 authored posts or 10 replies before activating Studio context."],
                warningReasons: [],
              },
            },
      );
      return;
    }

    if (url.endsWith("/archive/context/active")) {
      await fulfillJson(route, 200, active ? activeContext : emptyContext);
      return;
    }

    if (url.endsWith("/archive/tweets/validate")) {
      await fulfillJson(route, 200, validationResponse);
      return;
    }

    if (url.endsWith("/archive/tweets/import")) {
      imported = true;
      await fulfillJson(route, 200, {
        importRun,
        previews: [],
      });
      return;
    }

    if (url.endsWith("/archive/context/activate")) {
      active = true;
      await fulfillJson(route, 200, {
        activeContext,
        eligibility: insights.eligibility,
      });
      return;
    }

    if (url.endsWith("/archive/context/deactivate")) {
      active = false;
      await fulfillJson(route, 200, {
        activeContext: emptyContext,
        eligibility: insights.eligibility,
      });
      return;
    }

    await fulfillJson(route, 404, {
      code: "not_found",
      message: "Unhandled archive route.",
      retryable: false,
      scope: "route",
      status: 404,
    });
  };

  await page.route(`${engineBaseUrl}/archive/**`, archiveRoute);

  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Import archive" })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles("fixtures/tweets.js");
  await page.getByRole("button", { name: "Validate" }).click();
  await expect(page.getByRole("heading", { name: "Boundary review" })).toBeVisible();
  await expect(page.getByText("Importable 20")).toBeVisible();

  await page.getByRole("button", { name: "Import with merge" }).click();
  await expect(page.getByRole("heading", { name: "Import summary" })).toBeVisible();
  await expect(page.getByText("Inserted 20")).toBeVisible();

  await page.getByRole("button", { name: "Activate Studio context" }).click();
  await expect(page.getByText(/Imported X archive/)).toBeVisible();

  await page.getByRole("button", { name: "Open Studio" }).click();
  await expect(page.getByRole("heading", { name: "Studio" })).toBeVisible();
  await expect(page.getByText("Archive context active")).toBeVisible();

  await page.getByLabel("Idea input").getByLabel("Draft").fill("A draft to score with archive context.");
  await expect.poll(() => analyzeRequests.length).toBeGreaterThan(0);
  expect(JSON.stringify(analyzeRequests)).not.toContain("window.YTD.tweets");
  expect(JSON.stringify(analyzeRequests)).not.toContain("Useful writing loop");
});
