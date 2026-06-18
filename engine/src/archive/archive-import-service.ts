import { createHash } from "node:crypto";

import {
  archiveImportOverviewSchema,
  archivePostPreviewSchema,
  archivePostsPageSchema,
  archiveTweetsImportRequestSchema,
  archiveTweetsImportResponseSchema,
  archiveTweetsValidateRequestSchema,
  archiveTweetsValidateResponseSchema,
  type ArchiveImportOverview,
  type ArchivePostPreview,
  type ArchivePostsPage,
  type ArchiveTweetsImportRequest,
  type ArchiveTweetsImportResponse,
  type ArchiveTweetsValidateRequest,
  type ArchiveTweetsValidateResponse,
} from "@x-builder/shared";

import type {
  CanonicalOwnPost,
  PostLibraryRepository,
} from "../server/post-library-repository.js";
import { ArchiveTweetNormalizer, TweetsJsParser } from "./tweets-js-parser.js";

export class ArchiveValidationError extends Error {}

export type ArchiveImportServiceOptions = {
  repository: PostLibraryRepository;
  parser?: TweetsJsParser;
  normalizer?: ArchiveTweetNormalizer;
  now?: () => Date;
};

const falseAvailability = {
  postIds: false,
  text: false,
  createdTimes: false,
  replyRefs: false,
  language: false,
  entities: false,
  favoriteCount: false,
  retweetCount: false,
};

const emptyCounts = {
  totalRecords: 0,
  validPosts: 0,
  skippedRecords: 0,
  originals: 0,
  replies: 0,
  repostReferences: 0,
};

const sourceHashFor = (contents: string): string =>
  `sha256:${createHash("sha256").update(contents).digest("hex")}`;

export class ArchiveImportService {
  private readonly parser: TweetsJsParser;
  private readonly normalizer: ArchiveTweetNormalizer;
  private readonly now: () => Date;

  constructor(private readonly options: ArchiveImportServiceOptions) {
    this.parser = options.parser ?? new TweetsJsParser();
    this.normalizer = options.normalizer ?? new ArchiveTweetNormalizer();
    this.now = options.now ?? (() => new Date());
  }

  validate(input: ArchiveTweetsValidateRequest): ArchiveTweetsValidateResponse {
    const request = archiveTweetsValidateRequestSchema.parse(input);
    const parsed = this.parser.parse(request.contents);

    if (parsed.status === "invalid") {
      return archiveTweetsValidateResponseSchema.parse({
        status: "invalid",
        file: {
          fileName: request.fileName,
          fileSizeBytes: request.fileSizeBytes,
        },
        availability: falseAvailability,
        counts: emptyCounts,
        duplicatePreview: {
          duplicateRecords: 0,
          duplicatePlatformPostIds: [],
        },
        warnings: parsed.warnings,
      });
    }

    const sourceHash = sourceHashFor(request.contents);
    const normalized = this.normalizer.normalize({
      archive: parsed.archive,
      importRunId: "validation-preview",
      sourceHash,
      importedAt: this.now().toISOString(),
    });
    const duplicatePreview = this.duplicatePreview(normalized.posts);
    const warnings = [
      ...parsed.archive.warnings,
      ...normalized.skipped.map((skip) => ({
        code: "records_skipped",
        message: `${skip.count} record(s) skipped: ${skip.reason}.`,
      })),
      {
        code: "weak_metrics_only",
        message: "Archive favorites and retweets are weak historical signals, not impressions.",
      },
    ];
    const status =
      normalized.previewCounts.validPosts === 0
        ? "invalid"
        : normalized.previewCounts.skippedRecords > 0
          ? "partial"
          : "valid";

    return archiveTweetsValidateResponseSchema.parse({
      status,
      file: {
        fileName: request.fileName,
        fileSizeBytes: request.fileSizeBytes,
        assignmentPath: parsed.archive.assignmentPath,
      },
      availability: normalized.fieldAvailability,
      counts: normalized.previewCounts,
      duplicatePreview,
      warnings,
      ...(status === "invalid"
        ? {}
        : {
            previews: normalized.posts.slice(0, 25).map((post) => this.previewFor(post)),
            sourceHash,
          }),
    });
  }

  async importTweets(input: ArchiveTweetsImportRequest): Promise<ArchiveTweetsImportResponse> {
    const request = archiveTweetsImportRequestSchema.parse(input);
    const parsed = this.parser.parse(request.contents);

    if (parsed.status === "invalid") {
      throw new ArchiveValidationError("Archive contents are invalid.");
    }

    const importedAt = this.now().toISOString();
    const sourceHash = sourceHashFor(request.contents);
    const importRunId = `import-${Date.parse(importedAt)}-${sourceHash.slice(7, 15)}`;
    const normalized = this.normalizer.normalize({
      archive: parsed.archive,
      importRunId,
      sourceHash,
      importedAt,
    });

    if (normalized.posts.length === 0) {
      throw new ArchiveValidationError("Archive contains no importable posts.");
    }

    const writeResult = await this.options.repository.upsertPosts(normalized.posts);
    const duplicatePreview = this.duplicatePreview(normalized.posts);
    const importRun = {
      id: importRunId,
      sourceHash,
      assignmentPath: parsed.archive.assignmentPath,
      status: "completed" as const,
      counts: {
        ...normalized.previewCounts,
        insertedPosts: writeResult.insertedCount,
        updatedPosts: writeResult.updatedCount,
        unchangedPosts: writeResult.unchangedCount,
      },
      duplicates: duplicatePreview,
      warnings: [
        ...parsed.archive.warnings,
        ...normalized.skipped.map((skip) => ({
          code: "records_skipped",
          message: `${skip.count} record(s) skipped: ${skip.reason}.`,
        })),
      ],
      createdAt: importedAt,
      completedAt: importedAt,
    };

    await this.options.repository.saveImportRun(importRun);

    return archiveTweetsImportResponseSchema.parse({
      importRun,
      previews: normalized.posts.slice(0, 25).map((post) => this.previewFor(post)),
    });
  }

  async latestOverview(): Promise<ArchiveImportOverview> {
    const store = await this.options.repository.loadStore();
    const latestImportRun = [...store.importRuns].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )[0];

    if (!latestImportRun) {
      return archiveImportOverviewSchema.parse({
        status: "empty",
        activeContext: store.activeContext,
      });
    }

    return archiveImportOverviewSchema.parse({
      status: "ready",
      latestImportRun,
      postCount: store.posts.length,
      activeContext: store.activeContext,
    });
  }

  async postsPage(input: { cursor?: string; limit?: number }): Promise<ArchivePostsPage> {
    const store = await this.options.repository.loadStore();
    const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
    const offset = input.cursor === undefined ? 0 : this.offsetFromCursor(input.cursor);
    const sortedPosts = [...store.posts].sort((a, b) => {
      const createdOrder = b.createdAt.localeCompare(a.createdAt);

      return createdOrder === 0 ? a.id.localeCompare(b.id) : createdOrder;
    });
    const items = sortedPosts.slice(offset, offset + limit).map((post) => this.previewFor(post));
    const nextOffset = offset + items.length;

    return archivePostsPageSchema.parse({
      items,
      nextCursor: nextOffset < sortedPosts.length ? `offset:${nextOffset}` : undefined,
      limit,
    });
  }

  private offsetFromCursor(cursor: string): number {
    const match = /^offset:(\d+)$/.exec(cursor);

    if (!match) {
      throw new ArchiveValidationError("Invalid archive posts cursor.");
    }

    const offset = Number.parseInt(match[1] ?? "0", 10);

    if (!Number.isSafeInteger(offset)) {
      throw new ArchiveValidationError("Invalid archive posts cursor.");
    }

    return offset;
  }

  private duplicatePreview(posts: readonly { platformPostId: string }[]): {
    duplicateRecords: number;
    duplicatePlatformPostIds: string[];
  } {
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    for (const post of posts) {
      if (seen.has(post.platformPostId)) {
        duplicates.add(post.platformPostId);
      }
      seen.add(post.platformPostId);
    }

    return {
      duplicateRecords: duplicates.size,
      duplicatePlatformPostIds: [...duplicates].slice(0, 50),
    };
  }

  private previewFor(post: Pick<
    CanonicalOwnPost,
    "id" | "platformPostId" | "kind" | "text" | "createdAt" | "entityFlags" | "weakMetrics"
  >): ArchivePostPreview {
    return archivePostPreviewSchema.parse({
      id: post.id,
      platformPostId: post.platformPostId,
      kind: post.kind,
      textPreview: post.text.length > 240 ? `${post.text.slice(0, 237)}...` : post.text,
      createdAt: post.createdAt,
      entityFlags: post.entityFlags,
      weakMetrics: post.weakMetrics,
    });
  }
}
