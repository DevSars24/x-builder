import {
  activeArchiveContextSchema,
  archiveContextActivationResponseSchema,
  archiveDerivedInsightsSchema,
  archiveInsightsLatestResponseSchema,
  detectedPostFormatSchema,
  type ActiveArchiveContext,
  type ArchiveContextActivationEligibility,
  type ArchiveContextActivationResponse,
  type ArchiveDerivedInsights,
  type ArchiveInsightsLatestResponse,
} from "@x-builder/shared";

import type {
  CanonicalOwnPost,
  PostLibraryRepository,
} from "../server/post-library-repository.js";
import { classifyPostFormat } from "../deterministic/format-classifier.js";

export type ArchiveDerivedContextServiceOptions = {
  repository: PostLibraryRepository;
  now?: () => Date;
};

const activationThresholdMessage =
  "Import at least 20 authored posts or 10 replies before activating Studio context.";

const median = (values: number[]): number | undefined => {
  if (values.length === 0) {
    return undefined;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[midpoint];
  }

  const low = sorted[midpoint - 1];
  const high = sorted[midpoint];

  return low === undefined || high === undefined ? undefined : (low + high) / 2;
};

const percentile = (values: number[], p: number): number | undefined => {
  if (values.length === 0) {
    return undefined;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);

  return sorted[index];
};

const ratio = (part: number, total: number): number => (total === 0 ? 0 : part / total);

const daysBetween = (first: string, last: string): number => {
  const firstMs = Date.parse(first);
  const lastMs = Date.parse(last);

  if (Number.isNaN(firstMs) || Number.isNaN(lastMs) || firstMs === lastMs) {
    return 1;
  }

  return Math.max(1, Math.abs(lastMs - firstMs) / 86_400_000);
};

const topEntries = <T extends string | number>(values: T[], limit: number): T[] => {
  const counts = new Map<T, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value]) => value);
};

const textAngle = (text: string): string => {
  const lower = text.toLowerCase();

  if (lower.includes("?")) {
    return "curious";
  }

  if (/\b(fail|hard|stuck|mistake|risk)\b/.test(lower)) {
    return "caution";
  }

  if (/\b(win|faster|better|clear|useful)\b/.test(lower)) {
    return "constructive";
  }

  return "observational";
};

export class ArchiveDerivedContextService {
  private readonly now: () => Date;

  constructor(private readonly options: ArchiveDerivedContextServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async latestInsights(): Promise<ArchiveInsightsLatestResponse> {
    const store = await this.options.repository.loadStore();
    const importRunId = this.latestImportRunId(store.importRuns);

    if (store.posts.length === 0) {
      return archiveInsightsLatestResponseSchema.parse({
        status: "empty",
        eligibility: this.eligibilityFor([]),
      });
    }

    const insights = this.deriveInsights(store.posts);
    const generatedAt = this.now().toISOString();
    const snapshotImportRunId = importRunId ?? "manual-library";

    await this.options.repository.saveDerivedInsights({
      importRunId: snapshotImportRunId,
      generatedAt,
      insights,
    });

    return archiveInsightsLatestResponseSchema.parse({
      status: "ready",
      importRunId: snapshotImportRunId,
      insights,
      eligibility: this.eligibilityFor(store.posts),
    });
  }

  async activateLatest(): Promise<ArchiveContextActivationResponse> {
    const latest = await this.latestInsights();

    if (latest.status === "empty" || !latest.eligibility.eligible) {
      const activeContext = activeArchiveContextSchema.parse({ status: "empty" });

      await this.options.repository.setActiveContext(activeContext);

      return archiveContextActivationResponseSchema.parse({
        activeContext,
        eligibility: latest.eligibility,
      });
    }

    const activeContext = this.activeContextFor(latest.importRunId, latest.insights);

    await this.options.repository.setActiveContext(activeContext);

    return archiveContextActivationResponseSchema.parse({
      activeContext,
      eligibility: latest.eligibility,
    });
  }

  async deactivate(): Promise<ArchiveContextActivationResponse> {
    const activeContext = activeArchiveContextSchema.parse({ status: "empty" });
    const store = await this.options.repository.loadStore();

    await this.options.repository.setActiveContext(activeContext);

    return archiveContextActivationResponseSchema.parse({
      activeContext,
      eligibility: this.eligibilityFor(store.posts),
    });
  }

  async activeContext(): Promise<ActiveArchiveContext> {
    const store = await this.options.repository.loadStore();

    return activeArchiveContextSchema.parse(store.activeContext);
  }

  private latestImportRunId(importRuns: { id: string; createdAt: string }[]): string | undefined {
    return [...importRuns].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.id;
  }

  private deriveInsights(posts: CanonicalOwnPost[]): ArchiveDerivedInsights {
    const sortedPosts = [...posts].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const originals = posts.filter((post) => post.kind === "original").length;
    const replies = posts.filter((post) => post.kind === "reply").length;
    const repostReferences = posts.filter((post) => post.kind === "repost_reference").length;
    const first = sortedPosts[0]?.createdAt ?? this.now().toISOString();
    const last = sortedPosts[sortedPosts.length - 1]?.createdAt ?? first;
    const weeks = daysBetween(first, last) / 7;
    const favoriteValues = posts.flatMap((post) =>
      post.weakMetrics.favoriteCount === undefined ? [] : [post.weakMetrics.favoriteCount],
    );
    const retweetValues = posts.flatMap((post) =>
      post.weakMetrics.retweetCount === undefined ? [] : [post.weakMetrics.retweetCount],
    );
    const formats = posts.map((post) => classifyPostFormat(post.text));
    const angles = posts.map((post) => textAngle(post.text));
    const topFormats = topEntries(formats, 8);
    const topAngles = topEntries(angles, 8);

    return archiveDerivedInsightsSchema.parse({
      generatedAt: this.now().toISOString(),
      counts: {
        posts: posts.length,
        originals,
        replies,
        repostReferences,
      },
      cadence: {
        postsPerWeek: Number((posts.length / Math.max(weeks, 1 / 7)).toFixed(2)),
        mostCommonHoursUtc: topEntries(
          posts.map((post) => new Date(post.createdAt).getUTCHours()),
          6,
        ),
      },
      replyOriginalMix: {
        originalRatio: ratio(originals, posts.length),
        replyRatio: ratio(replies, posts.length),
      },
      repeatStructures: topFormats.map((format) => ({
        label: format,
        count: formats.filter((candidate) => candidate === format).length,
        examples: [],
      })),
      emotionalAngleRotation: topAngles.map((angle) => ({
        angle,
        count: angles.filter((candidate) => candidate === angle).length,
      })),
      weakEngagement: {
        favoriteMedian: median(favoriteValues),
        favoriteP90: percentile(favoriteValues, 90),
        retweetMedian: median(retweetValues),
        retweetP90: percentile(retweetValues, 90),
      },
      confidence: posts.length >= 50 ? "high" : posts.length >= 20 ? "medium" : "low",
    });
  }

  private eligibilityFor(posts: CanonicalOwnPost[]): ArchiveContextActivationEligibility {
    const originals = posts.filter((post) => post.kind === "original").length;
    const replies = posts.filter((post) => post.kind === "reply").length;
    const eligible = originals >= 20 || replies >= 10;

    return {
      eligible,
      blockingReasons: eligible ? [] : [activationThresholdMessage],
      warningReasons: posts.some((post) => post.kind === "repost_reference")
        ? ["Repost references are excluded from Studio scoring context."]
        : [],
    };
  }

  private activeContextFor(importRunId: string, insights: ArchiveDerivedInsights): ActiveArchiveContext {
    const repeatHistory = insights.repeatStructures.slice(0, 8).map((structure) => ({
      format: this.formatForRepeatStructureLabel(structure.label),
      lastPostedAt: insights.generatedAt,
      countLast7d: Math.min(100, structure.count),
    }));

    return activeArchiveContextSchema.parse({
      status: "active",
      sourceImportId: importRunId,
      activatedAt: this.now().toISOString(),
      scoringContextPatch: repeatHistory.length > 0 ? { repeatHistory } : {},
      judgeHints: [
        `Historical cadence is about ${insights.cadence.postsPerWeek} posts per week.`,
        `Recent archive mix is ${Math.round(insights.replyOriginalMix.originalRatio * 100)}% originals and ${Math.round(
          insights.replyOriginalMix.replyRatio * 100,
        )}% replies.`,
      ],
      provenance: "Imported X archive",
      confidence: insights.confidence,
      counts: {
        posts: insights.counts.posts,
        originals: insights.counts.originals,
        replies: insights.counts.replies,
      },
    });
  }

  private formatForRepeatStructureLabel(label: string) {
    const detectedFormat = detectedPostFormatSchema.safeParse(label);

    return detectedFormat.success ? detectedFormat.data : classifyPostFormat(label);
  }
}
