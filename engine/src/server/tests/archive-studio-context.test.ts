import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it, vi } from "vitest";
import type { AnalyzePostsRequest, AnalyzePostsResponse } from "@x-builder/shared";

import { buildServer } from "../server";
import { JsonFilePostLibraryRepository } from "../post-library-repository";
import { JsonFileAppSettingsRepository } from "../settings-repository";

const withTempRoot = async <T>(run: (root: string) => Promise<T>): Promise<T> => {
  const root = await mkdtemp(join(tmpdir(), "x-builder-studio-context-"));

  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const responseFor = (request: AnalyzePostsRequest): AnalyzePostsResponse => ({
  items: request.items.map((item) => ({
    status: "score_failed",
    id: item.id,
    text: item.text,
    sourceFormat: item.sourceFormat,
    reason: "analysis_failed",
    message: "stub",
    retryable: true,
  })),
});

describe("archive Studio context integration", () => {
  it("imports an archive, activates context, and merges it into Studio analysis", async () => {
    await withTempRoot(async (root) => {
      const repository = new JsonFilePostLibraryRepository({ root });
      const analyzePosts = vi.fn(responseFor);
      const app = buildServer({ analyzePosts, postLibraryRepository: repository });
      const tweetsJs = `window.YTD.tweets.part0 = [${Array.from(
        { length: 20 },
        (_, index) => `{"tweet":{"id_str":"${index + 1}","full_text":"Useful writing loop ${index + 1}","created_at":"Fri Jan ${String((index % 9) + 10).padStart(2, "0")} 12:00:00 +0000 2024","favorite_count":"${index + 1}","retweet_count":"1"}}`,
      ).join(",")}];`;

      try {
        const importResponse = await app.inject({
          method: "POST",
          url: "/archive/tweets/import",
          payload: {
            fileName: "tweets.js",
            fileSizeBytes: tweetsJs.length,
            contents: tweetsJs,
            duplicatePolicy: "merge_update",
          },
        });
        const activateResponse = await app.inject({
          method: "POST",
          url: "/archive/context/activate",
        });
        await app.inject({
          method: "POST",
          url: "/posts/analyze",
          payload: {
            items: [{ id: "draft", text: "A draft to score." }],
            scoringContext: {},
          },
        });
        const store = await repository.loadStore();

        expect(importResponse.statusCode).toBe(200);
        expect(activateResponse.statusCode).toBe(200);
        expect(store.posts).toHaveLength(20);
        expect(store.importRuns).toHaveLength(1);
        expect(store.derivedInsights).toHaveLength(1);
        expect(analyzePosts.mock.calls[0]?.[0].scoringContext.repeatHistory).toBeDefined();
        expect(analyzePosts.mock.calls[0]?.[0].scoringContext).not.toHaveProperty(
          "trailingMedianImpressions",
        );
      } finally {
        await app.close();
      }
    });
  });

  it("merges active repeat history into analysis when the request has no manual repeat history", async () => {
    await withTempRoot(async (root) => {
      const repository = new JsonFilePostLibraryRepository({ root });
      await repository.setActiveContext({
        status: "active",
        sourceImportId: "import-1",
        activatedAt: "2026-06-16T10:00:00.000Z",
        scoringContextPatch: {
          repeatHistory: [
            {
              format: "insight_share",
              lastPostedAt: "2026-06-15T10:00:00.000Z",
              countLast7d: 3,
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
      });
      const analyzePosts = vi.fn(responseFor);
      const app = buildServer({ analyzePosts, postLibraryRepository: repository });

      try {
        await app.inject({
          method: "POST",
          url: "/posts/analyze",
          payload: {
            items: [{ id: "draft", text: "A draft to score." }],
            scoringContext: {},
          },
        });

        expect(analyzePosts).toHaveBeenCalledWith(
          expect.objectContaining({
            scoringContext: expect.objectContaining({
              repeatHistory: [
                {
                  format: "insight_share",
                  lastPostedAt: "2026-06-15T10:00:00.000Z",
                  countLast7d: 3,
                },
              ],
            }),
          }),
        );
        expect(analyzePosts.mock.calls[0]?.[0].scoringContext).not.toHaveProperty(
          "trailingMedianImpressions",
        );
      } finally {
        await app.close();
      }
    });
  });

  it("keeps manual repeat history ahead of archive-derived repeat history", async () => {
    await withTempRoot(async (root) => {
      const repository = new JsonFilePostLibraryRepository({ root });
      await repository.setActiveContext({
        status: "active",
        sourceImportId: "import-1",
        activatedAt: "2026-06-16T10:00:00.000Z",
        scoringContextPatch: {
          repeatHistory: [
            {
              format: "insight_share",
              lastPostedAt: "2026-06-15T10:00:00.000Z",
              countLast7d: 3,
            },
          ],
        },
        judgeHints: [],
        provenance: "Imported X archive",
        confidence: "medium",
        counts: {
          posts: 20,
          originals: 20,
          replies: 0,
        },
      });
      const analyzePosts = vi.fn(responseFor);
      const app = buildServer({ analyzePosts, postLibraryRepository: repository });

      try {
        await app.inject({
          method: "POST",
          url: "/posts/analyze",
          payload: {
            items: [{ id: "draft", text: "A draft to score." }],
            scoringContext: {
              repeatHistory: [
                {
                  format: "hot_take",
                  lastPostedAt: "2026-06-14T10:00:00.000Z",
                  countLast7d: 1,
                },
              ],
            },
          },
        });

        expect(analyzePosts.mock.calls[0]?.[0].scoringContext.repeatHistory).toEqual([
          {
            format: "hot_take",
            lastPostedAt: "2026-06-14T10:00:00.000Z",
            countLast7d: 1,
          },
        ]);
      } finally {
        await app.close();
      }
    });
  });

  it("composes compact archive judge hints with the settings account profile", async () => {
    await withTempRoot(async (root) => {
      const repository = new JsonFilePostLibraryRepository({ root: join(root, "library") });
      const settingsRepository = new JsonFileAppSettingsRepository({ root: join(root, "settings") });
      const judge = vi.fn(async (_text: string, _profile?: string) => ({
        status: "failed" as const,
        retryable: false,
        code: "provider_unconfigured",
        message: "stub",
      }));
      await settingsRepository.save({
        ...settingsRepository.defaults(),
        accountProfile: "Writes for technical founders.",
      });
      await repository.setActiveContext({
        status: "active",
        sourceImportId: "import-1",
        activatedAt: "2026-06-16T10:00:00.000Z",
        scoringContextPatch: {},
        judgeHints: ["Historical cadence is about 4 posts per week."],
        provenance: "Imported X archive",
        confidence: "medium",
        counts: {
          posts: 20,
          originals: 20,
          replies: 0,
        },
      });
      const app = buildServer({
        judgeDraftService: { judge },
        postLibraryRepository: repository,
        settingsRepository,
      });

      try {
        await app.inject({
          method: "POST",
          url: "/drafts/judge",
          payload: { text: "A draft to judge." },
        });

        expect(judge).toHaveBeenCalledWith(
          "A draft to judge.",
          expect.stringContaining("Writes for technical founders."),
        );
        const profile = judge.mock.calls[0]?.[1];

        expect(profile).toContain("Archive context hints");
        expect(profile).toContain("Historical cadence");
        expect(profile).not.toContain("A draft to judge.");
      } finally {
        await app.close();
      }
    });
  });
});
