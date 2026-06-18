import { z } from "zod";
import { repeatHistoryEntrySchema } from "./deterministic-analysis.js";

const maxTweetsJsBytes = 25_000_000;
const maxTweetsJsCharacters = 20_000_000;

const archiveFileNameSchema = z.string().trim().min(1).max(260);

const archiveContentsSchema = z
  .string()
  .min(1, "Archive contents are required.")
  .max(maxTweetsJsCharacters, "Archive contents are too large for the local v1 importer.");

const sourceHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const archiveImportStatusSchema = z.enum(["pending", "completed", "failed"]);

export const archivePostKindSchema = z.enum(["original", "reply", "repost_reference", "unknown"]);

export const archiveConfidenceSchema = z.enum(["low", "medium", "high"]);

export const archiveWarningSchema = z.object({
  code: z.string().min(1).max(80),
  message: z.string().min(1).max(240),
});

export const archiveFileFactsSchema = z.object({
  fileName: archiveFileNameSchema,
  fileSizeBytes: z.number().int().min(0).max(maxTweetsJsBytes),
  assignmentPath: z.string().min(1).max(160).optional(),
});

export const archiveFieldAvailabilitySchema = z.object({
  postIds: z.boolean(),
  text: z.boolean(),
  createdTimes: z.boolean(),
  replyRefs: z.boolean(),
  language: z.boolean(),
  entities: z.boolean(),
  favoriteCount: z.boolean(),
  retweetCount: z.boolean(),
});

export const archiveRecordCountsSchema = z.object({
  totalRecords: z.number().int().min(0),
  validPosts: z.number().int().min(0),
  skippedRecords: z.number().int().min(0),
  originals: z.number().int().min(0),
  replies: z.number().int().min(0),
  repostReferences: z.number().int().min(0),
});

export const archiveDuplicatePreviewSchema = z.object({
  duplicateRecords: z.number().int().min(0),
  duplicatePlatformPostIds: z.array(z.string().min(1).max(120)).max(50),
});

export const archiveTweetsValidateRequestSchema = z.object({
  fileName: archiveFileNameSchema,
  fileSizeBytes: z.number().int().min(0).max(maxTweetsJsBytes),
  contents: archiveContentsSchema,
});

export const archiveTweetsImportRequestSchema = archiveTweetsValidateRequestSchema.extend({
  duplicatePolicy: z.literal("merge_update"),
});

const archiveWeakMetricsSchema = z.object({
  favoriteCount: z.number().int().min(0).optional(),
  retweetCount: z.number().int().min(0).optional(),
});

export const archivePostPreviewSchema = z.object({
  id: z.string().min(1).max(160),
  platformPostId: z.string().min(1).max(120),
  kind: archivePostKindSchema,
  textPreview: z.string().min(1).max(280),
  createdAt: z.string().datetime(),
  entityFlags: z.object({
    hasUrls: z.boolean(),
    hasMedia: z.boolean(),
    hasHashtags: z.boolean(),
    hasMentions: z.boolean(),
  }),
  weakMetrics: archiveWeakMetricsSchema.default({}),
});

const baseValidationResponseSchema = z.object({
  file: archiveFileFactsSchema,
  availability: archiveFieldAvailabilitySchema,
  counts: archiveRecordCountsSchema,
  duplicatePreview: archiveDuplicatePreviewSchema,
  warnings: z.array(archiveWarningSchema).default([]),
});

const validValidationResponseSchema = baseValidationResponseSchema.extend({
  status: z.literal("valid"),
  previews: z.array(archivePostPreviewSchema).max(25).default([]),
  sourceHash: sourceHashSchema,
});

const partialValidationResponseSchema = baseValidationResponseSchema.extend({
  status: z.literal("partial"),
  previews: z.array(archivePostPreviewSchema).max(25).default([]),
  sourceHash: sourceHashSchema,
});

const invalidValidationResponseSchema = baseValidationResponseSchema.extend({
  status: z.literal("invalid"),
});

export const archiveTweetsValidateResponseSchema = z.discriminatedUnion("status", [
  validValidationResponseSchema,
  partialValidationResponseSchema,
  invalidValidationResponseSchema,
]);

export const archiveImportRunSchema = z.object({
  id: z.string().min(1).max(160),
  sourceHash: sourceHashSchema,
  assignmentPath: z.string().min(1).max(160),
  status: archiveImportStatusSchema,
  counts: archiveRecordCountsSchema.extend({
    insertedPosts: z.number().int().min(0),
    updatedPosts: z.number().int().min(0),
    unchangedPosts: z.number().int().min(0),
  }),
  duplicates: archiveDuplicatePreviewSchema,
  warnings: z.array(archiveWarningSchema).default([]),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});

export const archiveTweetsImportResponseSchema = z.object({
  importRun: archiveImportRunSchema,
  previews: z.array(archivePostPreviewSchema).max(25).default([]),
});

export const archivePostsPageSchema = z.object({
  items: z.array(archivePostPreviewSchema),
  nextCursor: z.string().min(1).max(400).optional(),
  limit: z.number().int().min(1).max(100),
});

export const archiveDerivedInsightsSchema = z.object({
  generatedAt: z.string().datetime(),
  counts: z.object({
    posts: z.number().int().min(0),
    originals: z.number().int().min(0),
    replies: z.number().int().min(0),
    repostReferences: z.number().int().min(0),
  }),
  cadence: z.object({
    postsPerWeek: z.number().min(0),
    mostCommonHoursUtc: z.array(z.number().int().min(0).max(23)).max(24),
  }),
  replyOriginalMix: z.object({
    originalRatio: z.number().min(0).max(1),
    replyRatio: z.number().min(0).max(1),
  }),
  repeatStructures: z
    .array(
      z.object({
        label: z.string().min(1).max(120),
        count: z.number().int().min(0),
        examples: z.array(z.string().min(1).max(160)).max(3).default([]),
      }),
    )
    .max(20),
  emotionalAngleRotation: z
    .array(
      z.object({
        angle: z.string().min(1).max(80),
        count: z.number().int().min(0),
      }),
    )
    .max(20),
  weakEngagement: z.object({
    favoriteMedian: z.number().min(0).optional(),
    favoriteP90: z.number().min(0).optional(),
    retweetMedian: z.number().min(0).optional(),
    retweetP90: z.number().min(0).optional(),
  }),
  confidence: archiveConfidenceSchema,
});

export const archiveContextActivationEligibilitySchema = z.object({
  eligible: z.boolean(),
  blockingReasons: z.array(z.string().min(1).max(160)).default([]),
  warningReasons: z.array(z.string().min(1).max(160)).default([]),
});

const compactArchiveScoringPatchSchema = z.object({
  repeatHistory: z.array(repeatHistoryEntrySchema).max(40).optional(),
});

const emptyActiveArchiveContextSchema = z.object({
  status: z.literal("empty"),
});

const activeActiveArchiveContextSchema = z.object({
  status: z.literal("active"),
  sourceImportId: z.string().min(1).max(160),
  activatedAt: z.string().datetime(),
  scoringContextPatch: compactArchiveScoringPatchSchema.default({}),
  judgeHints: z.array(z.string().min(1).max(180)).max(6).default([]),
  provenance: z.string().min(1).max(120),
  confidence: archiveConfidenceSchema,
  counts: z.object({
    posts: z.number().int().min(0),
    originals: z.number().int().min(0),
    replies: z.number().int().min(0),
  }),
});

export const activeArchiveContextSchema = z.discriminatedUnion("status", [
  emptyActiveArchiveContextSchema,
  activeActiveArchiveContextSchema,
]);

const emptyArchiveImportOverviewSchema = z.object({
  status: z.literal("empty"),
  activeContext: activeArchiveContextSchema.default({ status: "empty" }),
});

const readyArchiveImportOverviewSchema = z.object({
  status: z.literal("ready"),
  latestImportRun: archiveImportRunSchema,
  postCount: z.number().int().min(0),
  activeContext: activeArchiveContextSchema,
});

export const archiveImportOverviewSchema = z.discriminatedUnion("status", [
  emptyArchiveImportOverviewSchema,
  readyArchiveImportOverviewSchema,
]);

const emptyArchiveInsightsLatestResponseSchema = z.object({
  status: z.literal("empty"),
  eligibility: archiveContextActivationEligibilitySchema,
});

const readyArchiveInsightsLatestResponseSchema = z.object({
  status: z.literal("ready"),
  importRunId: z.string().min(1).max(160),
  insights: archiveDerivedInsightsSchema,
  eligibility: archiveContextActivationEligibilitySchema,
});

export const archiveInsightsLatestResponseSchema = z.discriminatedUnion("status", [
  emptyArchiveInsightsLatestResponseSchema,
  readyArchiveInsightsLatestResponseSchema,
]);

export const archiveContextActivationResponseSchema = z.object({
  activeContext: activeArchiveContextSchema,
  eligibility: archiveContextActivationEligibilitySchema,
});

export type ArchiveTweetsValidateRequest = z.infer<typeof archiveTweetsValidateRequestSchema>;
export type ArchiveTweetsImportRequest = z.infer<typeof archiveTweetsImportRequestSchema>;
export type ArchiveTweetsValidateResponse = z.infer<typeof archiveTweetsValidateResponseSchema>;
export type ArchiveTweetsImportResponse = z.infer<typeof archiveTweetsImportResponseSchema>;
export type ArchiveImportRun = z.infer<typeof archiveImportRunSchema>;
export type ArchiveImportOverview = z.infer<typeof archiveImportOverviewSchema>;
export type ArchivePostPreview = z.infer<typeof archivePostPreviewSchema>;
export type ArchiveDerivedInsights = z.infer<typeof archiveDerivedInsightsSchema>;
export type ArchiveContextActivationEligibility = z.infer<
  typeof archiveContextActivationEligibilitySchema
>;
export type ArchiveInsightsLatestResponse = z.infer<typeof archiveInsightsLatestResponseSchema>;
export type ArchiveContextActivationResponse = z.infer<
  typeof archiveContextActivationResponseSchema
>;
export type ActiveArchiveContext = z.infer<typeof activeArchiveContextSchema>;
export type ArchivePostsPage = z.infer<typeof archivePostsPageSchema>;
