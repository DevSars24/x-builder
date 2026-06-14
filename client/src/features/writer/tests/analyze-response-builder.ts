import type {
  AnalyzedPostItem,
  AnalyzePostsRequest,
  AnalyzePostsResponse,
  EngagementPrediction,
  PostCoachViewModel,
} from "@x-builder/shared";

// Test-owned response builder for the analyze boundary. The engine `analyzePosts`
// route is remote-owned and schema-shaped, so the writer suites mock it and feed
// it through this builder. Shared by the advanced-context model/panel suites and
// the regime/two-pass suites that follow, so a single coherent fixture keeps the
// reach fields (legacy mirror + four-regime additions) internally ordered.

type ScoredAnalyzedPostItem = Extract<AnalyzedPostItem, { status: "scored" }>;
type ScoreFailedAnalyzedPostItem = Extract<
  AnalyzedPostItem,
  { status: "score_failed" }
>;
type ReadyPostCoachViewModel = Extract<PostCoachViewModel, { state: "ready" }>;
type AvailableEngagementPrediction = Extract<
  EngagementPrediction,
  { status: "available" }
>;
type DisabledEngagementPrediction = Extract<
  EngagementPrediction,
  { status: "disabled" }
>;

const learningCaveat =
  "Static rule check. Imported performance data is not connected yet.";

export function readyPostCoach(
  overrides: Partial<ReadyPostCoachViewModel> = {},
): ReadyPostCoachViewModel {
  const failedCheck = {
    id: "specificity",
    label: "Needs one concrete proof",
    status: "fail" as const,
  };
  const warnedCheck = {
    id: "ending_question",
    label: "Question could be sharper",
    status: "warn" as const,
  };
  const passedCheck = {
    id: "plain_language",
    label: "Plain language",
    status: "pass" as const,
  };

  return {
    state: "ready",
    title: "Post Coach",
    value: 74,
    badge: {
      label: "Ship it",
      tone: "ship",
      tooltip: "Solid post. Ship it; higher scores are a bonus.",
    },
    target: 60,
    engageability: {
      engageable: true,
      reason: "Ends with a concrete question.",
    },
    failed: [failedCheck],
    warned: [warnedCheck],
    passed: [passedCheck],
    counts: {
      flagged: 1,
      nudges: 1,
      onPoint: 1,
    },
    expanded: false,
    previewMode: true,
    sections: [
      {
        title: "Worth a look",
        items: [failedCheck],
      },
      {
        title: "Nudges",
        items: [warnedCheck],
      },
      {
        title: "On point",
        items: [passedCheck],
      },
    ],
    learnings: [
      {
        text: "Static rule evidence: concrete examples make posts easier to evaluate.",
        relevance: "general",
      },
    ],
    learningCaveat,
    hiddenChecks: 0,
    helperText: "Signals, not verdicts.",
    footerText: "Static heuristic checks only.",
    ...overrides,
  };
}

export function availablePrediction(
  overrides: Partial<AvailableEngagementPrediction> = {},
): AvailableEngagementPrediction {
  const legacy = {
    status: "available" as const,
    rangeLow: 120,
    rangeHigh: 280,
    midpoint: 200,
    confidence: "medium" as const,
    signals: [
      {
        signal_key: "voice_score",
        label: "Static score 74",
        multiplier: 0.9,
      },
    ],
    ...overrides,
  };

  return {
    ...legacy,
    predictedMidImpressions: legacy.midpoint,
    stallRange: { low: legacy.rangeLow, high: legacy.midpoint },
    escapeRange: { low: legacy.midpoint, high: legacy.rangeHigh },
    escapeProbability: 0.1,
    expectedReplies: 4,
    baseImpressions: legacy.midpoint,
    baseSource: "follower_estimate",
    qualityBasis: "static",
    reachModelVersion: "reach-v1",
    ...overrides,
  };
}

export function disabledMissingFollowersPrediction(): DisabledEngagementPrediction {
  return {
    status: "disabled",
    reason: "missing_followers",
    message: "Prediction needs follower count.",
  };
}

type ScoredItemSeed = {
  id: string;
  text: string;
  sourceFormat?: ScoredAnalyzedPostItem["sourceFormat"];
};

export function scoredItem(
  seed: ScoredItemSeed,
  overrides: Partial<ScoredAnalyzedPostItem> = {},
): ScoredAnalyzedPostItem {
  return {
    status: "scored",
    id: seed.id,
    text: seed.text,
    sourceFormat: seed.sourceFormat,
    detectedFormat: "insight_share",
    score: {
      value: 74,
      checks: [
        {
          id: "plain_language",
          label: "Plain language",
          status: "pass",
        },
      ],
      learnings: [
        {
          text: "Static rule evidence: concrete examples make posts easier to evaluate.",
          relevance: "general",
        },
      ],
      engageability: {
        engageable: true,
        reason: "Ends with a concrete question.",
      },
    },
    postCoach: readyPostCoach(),
    prediction: disabledMissingFollowersPrediction(),
    heuristicLabel: "Heuristic rank, not prediction.",
    analyzedAt: "2026-06-07T12:00:00.000Z",
    analyzerVersion: "deterministic-v1",
    ...overrides,
  };
}

export function scoreFailedItem(
  seed: ScoredItemSeed,
  overrides: Partial<ScoreFailedAnalyzedPostItem> = {},
): ScoreFailedAnalyzedPostItem {
  return {
    status: "score_failed",
    id: seed.id,
    text: seed.text,
    sourceFormat: seed.sourceFormat,
    reason: "analysis_failed",
    message: "Deterministic analysis failed for this candidate.",
    retryable: true,
    ...overrides,
  };
}

// Builds a schema-shaped analyze response from the items present in a request.
// Every request item gets a scored item back unless an override map supplies a
// specific item for that id. This mirrors how the engine echoes back the posted
// drafts and lets a test drive prediction state per id without re-listing text.
export function buildAnalyzeResponse(
  request: AnalyzePostsRequest,
  itemsById: Record<string, AnalyzedPostItem> = {},
): AnalyzePostsResponse {
  return {
    items: request.items.map(
      (item) =>
        itemsById[item.id] ??
        scoredItem({
          id: item.id,
          text: item.text,
          sourceFormat: item.sourceFormat,
        }),
    ),
  };
}
