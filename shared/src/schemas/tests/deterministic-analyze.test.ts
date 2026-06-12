import { describe, expect, expectTypeOf, it } from "vitest";
import {
  analyzedPostItemSchema,
  analyzePostsRequestSchema,
  analyzePostsResponseSchema,
  detectedPostFormatSchema,
  deterministicSourceFormatSchema,
  engagementPredictionSchema,
  judgeSignalsSchema,
  postCoachViewModelSchema,
  reachRangeSchema,
  repeatHistoryEntrySchema,
  scoringContextSchema,
  type AnalyzedPostItem,
  type AnalyzePostsRequest,
  type AnalyzePostsResponse,
  type DetectedPostFormat,
  type DeterministicSourceFormat,
  type EngagementPrediction,
  type JudgeSignals,
  type PostCoachViewModel,
  type ReachRange,
  type RepeatHistoryEntry,
  type ScoringContext,
} from "../../index";

const analyzedAt = "2026-06-07T12:00:00.000Z";
const learningCaveat = "Static rule check. Imported performance data is not connected yet.";

const score = {
  value: 72,
  checks: [
    {
      id: "quality_hook",
      label: "Clear hook",
      status: "pass",
    },
    {
      id: "specificity",
      label: "Specific proof",
      status: "warn",
    },
  ],
  learnings: [
    {
      text: "Static rule evidence: specific launch details tend to make posts easier to evaluate.",
      relevance: "general",
    },
  ],
  engageability: {
    engageable: true,
    reason: "Ends with a concrete question.",
  },
};

const postCoach = {
  state: "ready",
  title: "Post Coach",
  value: 72,
  badge: {
    label: "Ship it",
    tone: "ship",
    tooltip: "Solid post. Ship it; higher scores are a bonus.",
  },
  target: 60,
  engageability: score.engageability,
  failed: [],
  warned: [score.checks[1]],
  passed: [score.checks[0]],
  counts: {
    flagged: 0,
    nudges: 1,
    onPoint: 1,
  },
  expanded: false,
  previewMode: true,
  sections: [
    {
      title: "Sample",
      items: [score.checks[0], score.checks[1]],
    },
  ],
  learnings: [],
  learningCaveat,
  hiddenChecks: 0,
  helperText: "Signals, not verdicts.",
  footerText: "Static heuristic checks only.",
};

const availablePrediction = {
  status: "available",
  rangeLow: 180,
  rangeHigh: 420,
  midpoint: 300,
  confidence: "medium",
  signals: [
    {
      signal_key: "quality_voice",
      label: "Static score 72",
      multiplier: 0.8,
    },
  ],
  predictedMidImpressions: 300,
  stallRange: { low: 180, high: 260 },
  escapeRange: { low: 320, high: 420 },
  escapeProbability: 0.35,
  expectedReplies: 4.2,
  baseImpressions: 240,
  baseSource: "trailing_median",
  qualityBasis: "static",
  reachModelVersion: "reach-v2",
};

const missingFollowersPrediction = {
  status: "disabled",
  reason: "missing_followers",
  message: "Prediction needs follower count.",
};

const scoredItem = {
  status: "scored",
  id: "candidate-1",
  text: "genuine question: what made your onboarding finally click?",
  sourceFormat: "debate-question",
  detectedFormat: "genuine_question",
  score,
  postCoach,
  prediction: availablePrediction,
  heuristicLabel: "Heuristic rank, not prediction.",
  analyzedAt,
  analyzerVersion: "deterministic-v1",
};

describe("deterministic analyze schemas", () => {
  it("exports deterministic analyze schemas and inferred types from the shared entrypoint", () => {
    expect(analyzePostsRequestSchema).toBeDefined();
    expect(analyzePostsResponseSchema).toBeDefined();
    expect(analyzedPostItemSchema).toBeDefined();
    expect(postCoachViewModelSchema).toBeDefined();
    expect(engagementPredictionSchema).toBeDefined();
    expect(deterministicSourceFormatSchema).toBeDefined();
    expect(detectedPostFormatSchema).toBeDefined();

    expectTypeOf<AnalyzePostsRequest>().toMatchTypeOf<
      ReturnType<typeof analyzePostsRequestSchema.parse>
    >();
    expectTypeOf<AnalyzePostsResponse>().toMatchTypeOf<
      ReturnType<typeof analyzePostsResponseSchema.parse>
    >();
    expectTypeOf<AnalyzedPostItem>().toMatchTypeOf<
      ReturnType<typeof analyzedPostItemSchema.parse>
    >();
    expectTypeOf<PostCoachViewModel>().toMatchTypeOf<
      ReturnType<typeof postCoachViewModelSchema.parse>
    >();
    expectTypeOf<EngagementPrediction>().toMatchTypeOf<
      ReturnType<typeof engagementPredictionSchema.parse>
    >();
    expectTypeOf<DeterministicSourceFormat>().toMatchTypeOf<
      ReturnType<typeof deterministicSourceFormatSchema.parse>
    >();
    expectTypeOf<DetectedPostFormat>().toMatchTypeOf<
      ReturnType<typeof detectedPostFormatSchema.parse>
    >();
  });

  it("parses request-scoped analysis input and defaults Post Coach presentation to preview", () => {
    const parsed = analyzePostsRequestSchema.parse({
      items: [
        {
          id: "candidate-1",
          text: "Ship the smaller version that creates proof.",
          sourceFormat: "one-liner",
        },
      ],
      scoringContext: {},
      presentation: {},
    });

    expect(parsed).toMatchObject({
      items: [
        {
          id: "candidate-1",
          text: "Ship the smaller version that creates proof.",
          sourceFormat: "one-liner",
        },
      ],
      scoringContext: {},
      presentation: {
        postCoachMode: "preview",
      },
    });
  });

  it("accepts one to ten items and rejects empty or oversized batches", () => {
    const tenItems = Array.from({ length: 10 }, (_, index) => ({
      id: `candidate-${index + 1}`,
      text: `Candidate ${index + 1} has enough text to analyze.`,
    }));

    expect(
      analyzePostsRequestSchema.safeParse({
        items: [tenItems[0]],
        scoringContext: { followers: 2400 },
        presentation: { postCoachMode: "expanded" },
      }).success,
    ).toBe(true);
    expect(
      analyzePostsRequestSchema.safeParse({
        items: tenItems,
        scoringContext: { followers: 2400 },
        presentation: { postCoachMode: "expanded" },
      }).success,
    ).toBe(true);
    expect(
      analyzePostsRequestSchema.safeParse({
        items: [],
        scoringContext: {},
        presentation: {},
      }).success,
    ).toBe(false);
    expect(
      analyzePostsRequestSchema.safeParse({
        items: [...tenItems, { id: "candidate-11", text: "This pushes the batch over the limit." }],
        scoringContext: {},
        presentation: {},
      }).success,
    ).toBe(false);
  });

  it("parses scored responses with required Post Coach, prediction, labels, and analyzer metadata", () => {
    const result = analyzedPostItemSchema.safeParse(scoredItem);

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected scored deterministic item to parse.");
    }
    expect(result.data).toMatchObject({
      status: "scored",
      id: "candidate-1",
      sourceFormat: "debate-question",
      detectedFormat: "genuine_question",
      heuristicLabel: "Heuristic rank, not prediction.",
      analyzedAt,
      analyzerVersion: "deterministic-v1",
      postCoach: {
        state: "ready",
        title: "Post Coach",
        learningCaveat,
      },
      prediction: {
        status: "available",
        confidence: "medium",
      },
    });
  });

  it("rejects scored responses that omit the engine-produced Post Coach view model", () => {
    const { postCoach: _postCoach, ...withoutPostCoach } = scoredItem;

    expect(analyzedPostItemSchema.safeParse(withoutPostCoach).success).toBe(false);
    expect(
      analyzePostsResponseSchema.safeParse({
        items: [withoutPostCoach],
      }).success,
    ).toBe(false);
  });

  it("rejects ready Post Coach view models that omit the learning caveat", () => {
    const { learningCaveat: _learningCaveat, ...withoutLearningCaveat } = postCoach;

    expect(postCoachViewModelSchema.safeParse(withoutLearningCaveat).success).toBe(false);
    expect(
      analyzedPostItemSchema.safeParse({
        ...scoredItem,
        postCoach: withoutLearningCaveat,
      }).success,
    ).toBe(false);
  });

  it("parses ready Post Coach view models with the day-one learning caveat", () => {
    const result = postCoachViewModelSchema.safeParse(postCoach);

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected ready Post Coach with learning caveat to parse.");
    }
    expect(result.data).toMatchObject({
      state: "ready",
      learningCaveat,
    });
  });

  it("parses per-item score failures while preserving candidate text and retry metadata", () => {
    expect(
      analyzedPostItemSchema.safeParse({
        status: "score_failed",
        id: "candidate-2",
        text: "Hot take: unclear drafts are usually missing one concrete tradeoff.",
        sourceFormat: "mini-framework",
        reason: "analysis_failed",
        message: "Deterministic analysis failed for this candidate.",
        retryable: true,
      }).success,
    ).toBe(true);
  });

  it("parses mixed analyze responses so item failures stay inside the success body", () => {
    const result = analyzePostsResponseSchema.safeParse({
      items: [
        scoredItem,
        {
          status: "score_failed",
          id: "candidate-2",
          text: "Hot take: unclear drafts are usually missing one concrete tradeoff.",
          reason: "analysis_failed",
          message: "Deterministic analysis failed for this candidate.",
          retryable: true,
        },
      ],
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected mixed deterministic response to parse.");
    }
    expect(result.data.items).toHaveLength(2);
    expect(result.data.items[1]).toMatchObject({
      status: "score_failed",
      id: "candidate-2",
      text: "Hot take: unclear drafts are usually missing one concrete tradeoff.",
      retryable: true,
    });
  });

  it("models missing followers as an explicit disabled prediction state", () => {
    expect(engagementPredictionSchema.safeParse(missingFollowersPrediction).success).toBe(true);
    expect(
      analyzedPostItemSchema.safeParse({
        ...scoredItem,
        prediction: missingFollowersPrediction,
      }).success,
    ).toBe(true);
    expect(
      engagementPredictionSchema.safeParse({
        rangeLow: 120,
        rangeHigh: 280,
        midpoint: 200,
        confidence: "low",
        signals: [],
      }).success,
    ).toBe(false);
  });

  it("rejects an available prediction whose range is not ordered low <= midpoint <= high", () => {
    expect(
      engagementPredictionSchema.safeParse({
        status: "available",
        rangeLow: 420,
        rangeHigh: 180,
        midpoint: 999,
        confidence: "medium",
        signals: [],
      }).success,
    ).toBe(false);
    expect(engagementPredictionSchema.safeParse(availablePrediction).success).toBe(true);
  });

  it("keeps writer source format separate from analyzer detected format", () => {
    expect(deterministicSourceFormatSchema.safeParse("one-liner").success).toBe(true);
    expect(deterministicSourceFormatSchema.safeParse("mini-framework").success).toBe(true);
    expect(deterministicSourceFormatSchema.safeParse("debate-question").success).toBe(true);
    expect(deterministicSourceFormatSchema.safeParse("genuine_question").success).toBe(false);

    expect(detectedPostFormatSchema.safeParse("genuine_question").success).toBe(true);
    expect(detectedPostFormatSchema.safeParse("insight_share").success).toBe(true);
    expect(detectedPostFormatSchema.safeParse("one-liner").success).toBe(false);
  });

  it("accepts the eight new detected post formats", () => {
    const newFormats = [
      "fill_blank_tribal",
      "cta_farm",
      "fantasy_question",
      "binary_choice",
      "nuanced_question",
      "recognition_roast",
      "wisdom_one_liner",
      "milestone",
    ];

    for (const format of newFormats) {
      expect(detectedPostFormatSchema.safeParse(format).success).toBe(true);
    }
  });

  it("keeps the deprecated one_liner and goal_share formats valid for one more release", () => {
    expect(detectedPostFormatSchema.safeParse("one_liner").success).toBe(true);
    expect(detectedPostFormatSchema.safeParse("goal_share").success).toBe(true);
  });

  it("rejects an unknown detected post format value", () => {
    expect(detectedPostFormatSchema.safeParse("essay").success).toBe(false);
  });
});

describe("scoring context schema", () => {
  it("exports the scoring context schemas and inferred types from the shared entrypoint", () => {
    expect(scoringContextSchema).toBeDefined();
    expect(repeatHistoryEntrySchema).toBeDefined();
    expect(judgeSignalsSchema).toBeDefined();

    expectTypeOf<ScoringContext>().toMatchTypeOf<
      ReturnType<typeof scoringContextSchema.parse>
    >();
    expectTypeOf<RepeatHistoryEntry>().toMatchTypeOf<
      ReturnType<typeof repeatHistoryEntrySchema.parse>
    >();
    expectTypeOf<JudgeSignals>().toMatchTypeOf<
      ReturnType<typeof judgeSignalsSchema.parse>
    >();
  });

  it("applies repeatHistory and willAttachMedia defaults to a legacy followers-only context", () => {
    const parsed = scoringContextSchema.parse({ followers: 2400 });

    expect(parsed.followers).toBe(2400);
    expect(parsed.repeatHistory).toEqual([]);
    expect(parsed.willAttachMedia).toBe(false);
    expect(parsed.trailingMedianImpressions).toBeUndefined();
    expect(parsed.plannedHourUtc).toBeUndefined();
    expect(parsed.accountAgeYears).toBeUndefined();
    expect(parsed.judgeSignals).toBeUndefined();
  });

  it("parses a fully populated pass-2 scoring context with judge signals", () => {
    const parsed = scoringContextSchema.parse({
      followers: 5000,
      trailingMedianImpressions: 0,
      repeatHistory: [
        {
          format: "hot_take",
          lastPostedAt: "2026-06-10T09:00:00.000Z",
          countLast7d: 3,
        },
      ],
      plannedHourUtc: 14,
      willAttachMedia: true,
      accountAgeYears: 4,
      judgeSignals: { impressions: 60, replies: 40 },
    });

    expect(parsed.trailingMedianImpressions).toBe(0);
    expect(parsed.willAttachMedia).toBe(true);
    expect(parsed.judgeSignals).toEqual({ impressions: 60, replies: 40 });
    expect(parsed.repeatHistory).toHaveLength(1);
  });

  it("treats trailingMedianImpressions of zero as a present value rather than absent", () => {
    const parsed = scoringContextSchema.parse({ trailingMedianImpressions: 0 });

    expect(parsed.trailingMedianImpressions).toBe(0);
  });

  it("accepts a scoring context without judge signals as a valid pass-1 context", () => {
    const result = scoringContextSchema.safeParse({ followers: 1200 });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected pass-1 scoring context without judge signals to parse.");
    }
    expect(result.data.judgeSignals).toBeUndefined();
  });

  it("rejects judge signal scores above the 0..100 range", () => {
    expect(
      scoringContextSchema.safeParse({
        judgeSignals: { impressions: 101, replies: 40 },
      }).success,
    ).toBe(false);
    expect(
      scoringContextSchema.safeParse({
        judgeSignals: { impressions: 50, replies: -1 },
      }).success,
    ).toBe(false);
  });

  it("accepts judge signal scores at the 0 and 100 boundaries", () => {
    expect(
      judgeSignalsSchema.safeParse({ impressions: 0, replies: 100 }).success,
    ).toBe(true);
    expect(
      judgeSignalsSchema.safeParse({ impressions: 100, replies: 0 }).success,
    ).toBe(true);
  });

  it("accepts up to forty repeat-history entries and rejects forty-one", () => {
    const entry = {
      format: "ab_choice",
      lastPostedAt: "2026-06-09T12:00:00.000Z",
      countLast7d: 2,
    };
    const fortyEntries = Array.from({ length: 40 }, () => entry);
    const fortyOneEntries = Array.from({ length: 41 }, () => entry);

    expect(scoringContextSchema.safeParse({ repeatHistory: fortyEntries }).success).toBe(true);
    expect(scoringContextSchema.safeParse({ repeatHistory: fortyOneEntries }).success).toBe(false);
  });

  it("parses a repeat-history entry keyed by a detected post format", () => {
    const result = repeatHistoryEntrySchema.safeParse({
      format: "nuanced_question",
      lastPostedAt: "2026-06-11T08:30:00.000Z",
      countLast7d: 5,
    });

    expect(result.success).toBe(true);
  });

  it("rejects a repeat-history entry with a non-format string or non-ISO timestamp", () => {
    expect(
      repeatHistoryEntrySchema.safeParse({
        format: "not_a_format",
        lastPostedAt: "2026-06-11T08:30:00.000Z",
        countLast7d: 5,
      }).success,
    ).toBe(false);
    expect(
      repeatHistoryEntrySchema.safeParse({
        format: "hot_take",
        lastPostedAt: "2026-06-11",
        countLast7d: 5,
      }).success,
    ).toBe(false);
  });

  it("rejects a repeat-history entry whose weekly count exceeds one hundred", () => {
    expect(
      repeatHistoryEntrySchema.safeParse({
        format: "hot_take",
        lastPostedAt: "2026-06-11T08:30:00.000Z",
        countLast7d: 101,
      }).success,
    ).toBe(false);
  });

  it("rejects a planned hour outside the 0..23 utc range", () => {
    expect(scoringContextSchema.safeParse({ plannedHourUtc: 24 }).success).toBe(false);
    expect(scoringContextSchema.safeParse({ plannedHourUtc: -1 }).success).toBe(false);
    expect(scoringContextSchema.safeParse({ plannedHourUtc: 0 }).success).toBe(true);
    expect(scoringContextSchema.safeParse({ plannedHourUtc: 23 }).success).toBe(true);
  });

  it("wires the scoring context schema into the analyze request with defaults applied", () => {
    const parsed = analyzePostsRequestSchema.parse({
      items: [
        {
          id: "candidate-1",
          text: "Ship the smaller version that creates proof.",
        },
      ],
      scoringContext: { followers: 2400 },
      presentation: {},
    });

    expect(parsed.scoringContext).toMatchObject({
      followers: 2400,
      repeatHistory: [],
      willAttachMedia: false,
    });
  });
});

describe("reach range schema", () => {
  it("exports the reach range schema and inferred type from the shared entrypoint", () => {
    expect(reachRangeSchema).toBeDefined();
    expectTypeOf<ReachRange>().toMatchTypeOf<ReturnType<typeof reachRangeSchema.parse>>();
  });

  it("accepts a range where low is less than or equal to high", () => {
    expect(reachRangeSchema.safeParse({ low: 10, high: 900 }).success).toBe(true);
    expect(reachRangeSchema.safeParse({ low: 200, high: 200 }).success).toBe(true);
  });

  it("rejects a range where low is greater than high", () => {
    expect(reachRangeSchema.safeParse({ low: 900, high: 10 }).success).toBe(false);
  });

  it("rejects a range with a negative bound", () => {
    expect(reachRangeSchema.safeParse({ low: -1, high: 10 }).success).toBe(false);
  });
});

describe("available engagement prediction four-regime fields", () => {
  it("parses an available prediction carrying the new reach-model fields alongside legacy ranges", () => {
    const result = engagementPredictionSchema.safeParse(availablePrediction);

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected an available prediction with reach-model fields to parse.");
    }
    expect(result.data).toMatchObject({
      status: "available",
      predictedMidImpressions: 300,
      stallRange: { low: 180, high: 260 },
      escapeRange: { low: 320, high: 420 },
      escapeProbability: 0.35,
      expectedReplies: 4.2,
      baseImpressions: 240,
      baseSource: "trailing_median",
      qualityBasis: "static",
      reachModelVersion: "reach-v2",
    });
  });

  it("passes the legacy ordering refine for an available prediction with ordered ranges and midpoint", () => {
    const result = engagementPredictionSchema.safeParse({
      ...availablePrediction,
      rangeLow: 10,
      rangeHigh: 900,
      midpoint: 120,
      stallRange: { low: 10, high: 110 },
      escapeRange: { low: 130, high: 900 },
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected an ordered available prediction with reach ranges to parse.");
    }
    expect(result.data).toMatchObject({
      status: "available",
      rangeLow: 10,
      rangeHigh: 900,
      midpoint: 120,
      stallRange: { low: 10, high: 110 },
      escapeRange: { low: 130, high: 900 },
    });
  });

  it("rejects an available prediction missing a four-regime field", () => {
    const { qualityBasis: _qualityBasis, ...withoutQualityBasis } = availablePrediction;

    expect(engagementPredictionSchema.safeParse(withoutQualityBasis).success).toBe(false);
  });

  it("accepts both static and judge as the prediction quality basis", () => {
    const staticBasis = engagementPredictionSchema.parse({
      ...availablePrediction,
      qualityBasis: "static",
    });
    const judgeBasis = engagementPredictionSchema.parse({
      ...availablePrediction,
      qualityBasis: "judge",
    });

    expect(staticBasis).toMatchObject({ qualityBasis: "static" });
    expect(judgeBasis).toMatchObject({ qualityBasis: "judge" });
  });

  it("rejects an unknown quality basis or base source value", () => {
    expect(
      engagementPredictionSchema.safeParse({ ...availablePrediction, qualityBasis: "heuristic" }).success,
    ).toBe(false);
    expect(
      engagementPredictionSchema.safeParse({ ...availablePrediction, baseSource: "guess" }).success,
    ).toBe(false);
  });

  it("accepts both trailing_median and follower_estimate as the base source", () => {
    const trailingMedian = engagementPredictionSchema.parse({
      ...availablePrediction,
      baseSource: "trailing_median",
    });
    const followerEstimate = engagementPredictionSchema.parse({
      ...availablePrediction,
      baseSource: "follower_estimate",
    });

    expect(trailingMedian).toMatchObject({ baseSource: "trailing_median" });
    expect(followerEstimate).toMatchObject({ baseSource: "follower_estimate" });
  });

  it("rejects an escape probability outside the 0..1 range and a non-empty reach model version", () => {
    expect(
      engagementPredictionSchema.safeParse({ ...availablePrediction, escapeProbability: 1.5 }).success,
    ).toBe(false);
    expect(
      engagementPredictionSchema.safeParse({ ...availablePrediction, escapeProbability: -0.1 }).success,
    ).toBe(false);
    expect(
      engagementPredictionSchema.safeParse({ ...availablePrediction, reachModelVersion: "" }).success,
    ).toBe(false);
  });

  it("rejects an available prediction whose stall range is internally unordered", () => {
    expect(
      engagementPredictionSchema.safeParse({
        ...availablePrediction,
        stallRange: { low: 260, high: 180 },
      }).success,
    ).toBe(false);
  });
});
