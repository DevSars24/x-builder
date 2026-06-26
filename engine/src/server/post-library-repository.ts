import {
  activeArchiveContextSchema,
  archiveDerivedInsightsSchema,
  archiveImportRunSchema,
  type ActiveArchiveContext,
  type ArchiveImportRun,
  type LiveCapturedProfile,
} from "@x-builder/shared";
import { z } from "zod";

const sourceHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

const archiveMetricSnapshotSchema = z.object({
  source: z.literal("archive_tweets_js"),
  observedAt: z.string().datetime(),
  importedAt: z.string().datetime(),
  favoriteCount: z.number().int().min(0).optional(),
  retweetCount: z.number().int().min(0).optional(),
});

const liveMetricSnapshotSchema = z.object({
  source: z.literal("x_live_capture"),
  capturedAt: z.string().datetime(),
  impressions: z.number().int().min(0).optional(),
  likes: z.number().int().min(0).optional(),
  reposts: z.number().int().min(0).optional(),
  replies: z.number().int().min(0).optional(),
  quotes: z.number().int().min(0).optional(),
  bookmarks: z.number().int().min(0).optional(),
});

const metricSnapshotSchema = z.discriminatedUnion("source", [
  archiveMetricSnapshotSchema,
  liveMetricSnapshotSchema,
]);

const archiveSourceRefSchema = z.object({
  source: z.literal("archive_tweets_js"),
  importRunId: z.string().min(1).max(160),
  rawId: z.string().min(1).max(160),
  sourceHash: sourceHashSchema,
});

const liveSourceRefSchema = z.object({
  source: z.literal("x_live_capture"),
  captureSessionId: z.string().min(1).max(160),
  rawId: z.string().min(1).max(160),
});

const sourceRefSchema = z.discriminatedUnion("source", [
  archiveSourceRefSchema,
  liveSourceRefSchema,
]);

const liveProfileSnapshotSchema = z.object({
  platformUserId: z.string().min(1).max(160),
  screenName: z.string().min(1).max(80),
  followers: z.number().int().min(0).optional(),
  capturedAt: z.string().datetime(),
});

const replyReferencesSchema = z
  .object({
    inReplyToPostId: z.string().min(1).max(160).optional(),
    inReplyToUserId: z.string().min(1).max(160).optional(),
  })
  .default({});

const entityFlagsSchema = z.object({
  hasUrls: z.boolean(),
  hasMedia: z.boolean(),
  hasHashtags: z.boolean(),
  hasMentions: z.boolean(),
});

const weakArchiveMetricsSchema = z
  .object({
    favoriteCount: z.number().int().min(0).optional(),
    retweetCount: z.number().int().min(0).optional(),
  })
  .default({});

export const canonicalOwnPostSchema = z.object({
  id: z.string().min(1).max(160),
  platform: z.literal("x"),
  platformPostId: z.string().min(1).max(160),
  text: z.string().min(1).max(8_000),
  createdAt: z.string().datetime(),
  kind: z.enum(["original", "reply", "repost_reference", "unknown"]),
  language: z.string().min(1).max(40).optional(),
  replyReferences: replyReferencesSchema,
  entityFlags: entityFlagsSchema,
  weakMetrics: weakArchiveMetricsSchema,
  metricSnapshots: z.array(metricSnapshotSchema).default([]),
  sourceRefs: z.array(sourceRefSchema).default([]),
  updatedAt: z.string().datetime(),
});

export const canonicalOwnPostInputSchema = canonicalOwnPostSchema.extend({
  updatedAt: z.string().datetime().optional(),
});

export const archiveDerivedInsightSnapshotSchema = z.object({
  importRunId: z.string().min(1).max(160),
  generatedAt: z.string().datetime(),
  insights: archiveDerivedInsightsSchema,
});

export const postLibraryStoreSchema = z.object({
  schemaVersion: z.literal(2),
  updatedAt: z.string().datetime(),
  posts: z.array(canonicalOwnPostSchema),
  importRuns: z.array(archiveImportRunSchema),
  derivedInsights: z.array(archiveDerivedInsightSnapshotSchema),
  activeContext: activeArchiveContextSchema,
  profileSnapshots: z.array(liveProfileSnapshotSchema).default([]),
});

export type ArchiveMetricSnapshot = z.infer<typeof archiveMetricSnapshotSchema>;
export type LiveMetricSnapshot = z.infer<typeof liveMetricSnapshotSchema>;
export type ArchiveSourceRef = z.infer<typeof archiveSourceRefSchema>;
export type LiveSourceRef = z.infer<typeof liveSourceRefSchema>;
export type LiveProfileSnapshot = z.infer<typeof liveProfileSnapshotSchema>;

export type MetricSnapshot = z.infer<typeof metricSnapshotSchema>;
export type SourceRef = z.infer<typeof sourceRefSchema>;
export type CanonicalOwnPost = z.infer<typeof canonicalOwnPostSchema>;
export type CanonicalOwnPostInput = z.infer<typeof canonicalOwnPostInputSchema>;
export type ArchiveDerivedInsightSnapshot = z.infer<typeof archiveDerivedInsightSnapshotSchema>;
export type PostLibraryStore = z.infer<typeof postLibraryStoreSchema>;

export type PostLibraryWriteResult = {
  insertedCount: number;
  updatedCount: number;
  unchangedCount: number;
  duplicateCount: number;
};

export interface PostLibraryRepository {
  loadStore(): Promise<PostLibraryStore>;
  upsertPosts(posts: CanonicalOwnPostInput[]): Promise<PostLibraryWriteResult>;
  saveImportRun(importRun: ArchiveImportRun): Promise<void>;
  saveDerivedInsights(snapshot: ArchiveDerivedInsightSnapshot): Promise<void>;
  setActiveContext(context: ActiveArchiveContext): Promise<void>;
  pushProfileSnapshot(snapshot: LiveCapturedProfile): Promise<void>;
}

export class PostLibraryStorageError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "PostLibraryStorageError";
  }
}

// The single source of the v1->v2 upgrade. The JSON->SQLite importer calls this so
// the upgrade lives in exactly one place.
// A schemaVersion:1 raw object gains profileSnapshots:[] and is re-stamped to version 2;
// a v2 (or version-less) object passes through unchanged; a schemaVersion greater than 2
// throws PostLibraryStorageError. The returned value is still raw — the caller runs it
// through postLibraryStoreSchema.parse.
export const upgradePostLibraryStoreToV2 = (raw: unknown): unknown => {
  const rawVersion =
    typeof raw === "object" && raw !== null
      ? (raw as { schemaVersion?: unknown }).schemaVersion
      : undefined;

  if (rawVersion === 1) {
    return {
      ...(raw as Record<string, unknown>),
      schemaVersion: 2,
      profileSnapshots: [],
    };
  }

  if (typeof rawVersion === "number" && rawVersion > 2) {
    throw new PostLibraryStorageError(
      `Post library store schemaVersion ${rawVersion} is newer than this engine supports.`,
    );
  }

  return raw;
};

export const postLibraryFileName = "post-library.json";
