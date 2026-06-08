import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  AnalyzedPostItem,
  EngagementPrediction,
  PostCoachViewModel,
} from "@x-builder/shared";

const deterministicComponentsModulePath = "../deterministic/components";
const learningCaveat = "Static rule check. Imported performance data is not connected yet.";

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

type CandidateDeterministicSummaryProps = {
  item: AnalyzedPostItem;
  onRetryScore: (itemId: string) => void;
};

type ManualScoringContextPanelProps = {
  context: {
    followers?: number;
    source: "manual" | "missing";
    skipped: boolean;
  };
  disabled?: boolean;
};

type DeterministicDetailInspectorProps =
  | {
      state: "empty";
      message: string;
    }
  | {
      state: "loading";
      label: string;
    }
  | {
      state: "error";
      message: string;
    }
  | {
      state: "ready";
      item: ScoredAnalyzedPostItem;
      onAddFollowers?: () => void;
      onRetryExpandedPostCoach?: () => void;
    };

type DeterministicComponentsModule = {
  CandidateDeterministicSummary: (
    props: CandidateDeterministicSummaryProps,
  ) => ReactElement;
  DeterministicDetailInspector: (
    props: DeterministicDetailInspectorProps,
  ) => ReactElement;
  EngagementPredictionCard: (props: {
    prediction: EngagementPrediction;
  }) => ReactElement;
  ManualScoringContextPanel: (
    props: ManualScoringContextPanelProps,
  ) => ReactElement;
  PostCoachCard: (props: { postCoach: PostCoachViewModel }) => ReactElement;
};

async function loadDeterministicComponents() {
  return (await import(
    deterministicComponentsModulePath
  )) as DeterministicComponentsModule;
}

function textContent(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function render(element: ReactElement) {
  return renderToStaticMarkup(element);
}

function readyPostCoach(
  overrides: Partial<ReadyPostCoachViewModel> = {},
): ReadyPostCoachViewModel {
  const worthALook = {
    id: "specificity",
    label: "Needs a concrete detail",
    status: "fail" as const,
  };
  const nudge = {
    id: "ending_question",
    label: "Question could be sharper",
    status: "warn" as const,
  };
  const onPoint = {
    id: "plain_language",
    label: "Plain language",
    status: "pass" as const,
  };

  return {
    state: "ready",
    title: "Post Coach",
    value: 73,
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
    failed: [worthALook],
    warned: [nudge],
    passed: [onPoint],
    counts: {
      flagged: 9,
      nudges: 7,
      onPoint: 5,
    },
    expanded: false,
    previewMode: true,
    sections: [
      {
        title: "Worth a look",
        items: [worthALook],
      },
      {
        title: "Nudges",
        items: [nudge],
      },
      {
        title: "On point",
        items: [onPoint],
      },
    ],
    learnings: [
      {
        text: "Static rule evidence: concrete examples make posts easier to evaluate.",
        relevance: "general",
      },
    ],
    learningCaveat,
    hiddenChecks: 4,
    helperText: "Signals, not verdicts.",
    footerText: "Static heuristic checks only.",
    ...overrides,
  };
}

function availablePrediction(
  overrides: Partial<AvailableEngagementPrediction> = {},
): AvailableEngagementPrediction {
  return {
    status: "available",
    rangeLow: 120,
    rangeHigh: 280,
    midpoint: 200,
    confidence: "medium",
    signals: [
      {
        signal_key: "voice_score",
        label: "Voice score 73",
        multiplier: 0.85,
      },
      {
        signal_key: "question_ending",
        label: "Question ending",
        multiplier: 1.15,
      },
    ],
    ...overrides,
  };
}

function missingFollowersPrediction(
  overrides: Partial<DisabledEngagementPrediction> = {},
): DisabledEngagementPrediction {
  return {
    status: "disabled",
    reason: "missing_followers",
    message: "Prediction needs follower count.",
    ...overrides,
  };
}

function scoredItem(
  overrides: Partial<ScoredAnalyzedPostItem> = {},
): ScoredAnalyzedPostItem {
  return {
    status: "scored",
    id: "candidate-1",
    text: "genuine question: what made your onboarding finally click?",
    sourceFormat: "debate-question",
    detectedFormat: "genuine_question",
    score: {
      value: 73,
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
    prediction: availablePrediction(),
    heuristicLabel: "Heuristic rank, not prediction.",
    analyzedAt: "2026-06-07T12:00:00.000Z",
    analyzerVersion: "deterministic-v1",
    ...overrides,
  };
}

function scoreFailedItem(
  overrides: Partial<ScoreFailedAnalyzedPostItem> = {},
): ScoreFailedAnalyzedPostItem {
  return {
    status: "score_failed",
    id: "candidate-2",
    text: "Hot take: unclear drafts are usually missing one concrete tradeoff.",
    sourceFormat: "mini-framework",
    reason: "analyzer_exception",
    message: "Deterministic analysis failed for this candidate.",
    retryable: true,
    ...overrides,
  };
}

describe("CandidateDeterministicSummary", () => {
  it("renders scored API items with separate formats, score, Post Coach, and available prediction state", async () => {
    const { CandidateDeterministicSummary } = await loadDeterministicComponents();

    const html = render(
      <CandidateDeterministicSummary item={scoredItem()} onRetryScore={vi.fn()} />,
    );
    const text = textContent(html);

    expect(text).toContain("genuine question: what made your onboarding finally click?");
    expect(text).toContain("Source format");
    expect(text).toContain("debate-question");
    expect(text).toContain("Detected format");
    expect(text).toContain("genuine_question");
    expect(text).toContain("73");
    expect(text).toContain("Heuristic rank, not prediction.");
    expect(text).toContain("Ship it");
    expect(text).toContain("9");
    expect(text).toContain("7");
    expect(text).toContain("5");
    expect(text).toContain("120");
    expect(text).toContain("280");
    expect(text).toContain("Voice score 73");
  });

  it("renders missing source format gracefully while preserving detected format", async () => {
    const { CandidateDeterministicSummary } = await loadDeterministicComponents();

    const item = scoredItem({
      text: "manual draft: what changed after you stopped optimizing for demos?",
      detectedFormat: "genuine_question",
    });
    delete item.sourceFormat;
    const html = render(
      <CandidateDeterministicSummary item={item} onRetryScore={vi.fn()} />,
    );
    const text = textContent(html);

    expect(text).toContain(
      "manual draft: what changed after you stopped optimizing for demos?",
    );
    expect(text).toContain("Source format");
    expect(text).toContain("Unknown");
    expect(text).toContain("Detected format");
    expect(text).toContain("genuine_question");
  });

  it("renders disabled prediction state from the item without inventing a range", async () => {
    const { CandidateDeterministicSummary } = await loadDeterministicComponents();

    const html = render(
      <CandidateDeterministicSummary
        item={scoredItem({ prediction: missingFollowersPrediction() })}
        onRetryScore={vi.fn()}
      />,
    );
    const text = textContent(html);

    expect(text).toContain("Prediction needs follower count.");
    expect(text).toContain("missing_followers");
    expect(text).not.toContain("120");
    expect(text).not.toContain("280");
  });

  it("preserves score failure item text and exposes a retry score action", async () => {
    const { CandidateDeterministicSummary } = await loadDeterministicComponents();

    const html = render(
      <CandidateDeterministicSummary
        item={scoreFailedItem()}
        onRetryScore={vi.fn()}
      />,
    );
    const text = textContent(html);

    expect(text).toContain(
      "Hot take: unclear drafts are usually missing one concrete tradeoff.",
    );
    expect(text).toContain("Deterministic analysis failed for this candidate.");
    expect(text).toContain("Retry score");
  });
});

describe("PostCoachCard", () => {
  it("renders badge, provided counts, sections, and learning caveat from the view model", async () => {
    const { PostCoachCard } = await loadDeterministicComponents();
    const postCoach = readyPostCoach({
      value: 18,
      badge: {
        label: "Top tier",
        tone: "top",
        tooltip: "Server-selected badge copy that does not match the raw score.",
      },
      counts: {
        flagged: 9,
        nudges: 7,
        onPoint: 5,
      },
      failed: [
        {
          id: "derived-fail",
          label: "Derived failed check should not render",
          status: "fail",
        },
      ],
      warned: [
        {
          id: "derived-warning",
          label: "Derived warning check should not render",
          status: "warn",
        },
      ],
      passed: [
        {
          id: "derived-pass",
          label: "Derived passing check should not render",
          status: "pass",
        },
      ],
      sections: [
        {
          title: "Worth a look",
          items: [
            {
              id: "api-section-worth",
              label: "API section says the hook is specific",
              status: "pass",
            },
          ],
        },
        {
          title: "Nudges",
          items: [
            {
              id: "api-section-nudge",
              label: "API section asks for a tighter final question",
              status: "warn",
            },
          ],
        },
        {
          title: "On point",
          items: [
            {
              id: "api-section-on-point",
              label: "API section praises the plain-language framing",
              status: "fail",
            },
          ],
        },
      ],
    });

    const html = render(<PostCoachCard postCoach={postCoach} />);
    const text = textContent(html);

    expect(text).toContain("Post Coach");
    expect(text).toContain("Top tier");
    expect(text).toContain("Server-selected badge copy that does not match the raw score.");
    expect(text).not.toContain("Rework");
    expect(text).not.toContain("Ship it");
    expect(text).toContain("9");
    expect(text).toContain("7");
    expect(text).toContain("5");
    expect(text).toContain("Worth a look");
    expect(text).toContain("API section says the hook is specific");
    expect(text).toContain("Nudges");
    expect(text).toContain("API section asks for a tighter final question");
    expect(text).toContain("On point");
    expect(text).toContain("API section praises the plain-language framing");
    expect(text).not.toContain("Derived failed check should not render");
    expect(text).not.toContain("Derived warning check should not render");
    expect(text).not.toContain("Derived passing check should not render");
    expect(text).toContain(learningCaveat);
    expect(text).not.toContain("real user performance");
  });
});

describe("EngagementPredictionCard", () => {
  it("renders available prediction range, midpoint, confidence, and signals", async () => {
    const { EngagementPredictionCard } = await loadDeterministicComponents();

    const html = render(
      <EngagementPredictionCard prediction={availablePrediction()} />,
    );
    const text = textContent(html);

    expect(text).toContain("120");
    expect(text).toContain("280");
    expect(text).toContain("200");
    expect(text).toContain("medium");
    expect(text).toContain("Voice score 73");
    expect(text).toContain("0.85");
    expect(text).toContain("Question ending");
    expect(text).toContain("1.15");
  });

  it("renders missing followers as disabled context without a fake range", async () => {
    const { EngagementPredictionCard } = await loadDeterministicComponents();

    const html = render(
      <EngagementPredictionCard prediction={missingFollowersPrediction()} />,
    );
    const text = textContent(html);

    expect(text).toContain("Prediction needs follower count.");
    expect(text).toContain("missing_followers");
    expect(text).not.toContain("120");
    expect(text).not.toContain("280");
  });
});

describe("ManualScoringContextPanel", () => {
  it("renders manual follower input and labels skipped source state without implying persistence", async () => {
    const { ManualScoringContextPanel } = await loadDeterministicComponents();

    const html = render(
      <ManualScoringContextPanel
        context={{
          followers: 2400,
          source: "manual",
          skipped: true,
        }}
        disabled
      />,
    );
    const text = textContent(html);

    expect(text).toContain("Followers");
    expect(html).toContain('value="2400"');
    expect(html).toContain("disabled");
    expect(text).toContain("manual");
    expect(text).toContain("skipped");
    expect(text).not.toContain("saved");
    expect(text).not.toContain("persisted");
  });
});

describe("DeterministicDetailInspector", () => {
  it("renders empty, loading, and error states without fake sample scores", async () => {
    const { DeterministicDetailInspector } = await loadDeterministicComponents();

    const emptyHtml = render(
      <DeterministicDetailInspector
        state="empty"
        message="Select a candidate to inspect deterministic scoring."
      />,
    );
    const loadingHtml = render(
      <DeterministicDetailInspector
        state="loading"
        label="Loading deterministic details"
      />,
    );
    const errorHtml = render(
      <DeterministicDetailInspector
        state="error"
        message="Could not load deterministic details."
      />,
    );

    expect(textContent(emptyHtml)).toContain(
      "Select a candidate to inspect deterministic scoring.",
    );
    expect(textContent(emptyHtml)).not.toContain("Post Coach");
    expect(textContent(emptyHtml)).not.toContain("Heuristic rank");
    expect(textContent(emptyHtml)).not.toContain("Sample");
    expect(loadingHtml).toContain('role="status"');
    expect(textContent(loadingHtml)).toContain("Loading deterministic details");
    expect(textContent(errorHtml)).toContain(
      "Could not load deterministic details.",
    );
  });

  it("renders ready detail content from the scored API item", async () => {
    const { DeterministicDetailInspector } = await loadDeterministicComponents();

    const html = render(
      <DeterministicDetailInspector state="ready" item={scoredItem()} />,
    );
    const text = textContent(html);

    expect(text).toContain("genuine question: what made your onboarding finally click?");
    expect(text).toContain("Post Coach");
    expect(text).toContain("Ship it");
    expect(text).toContain("120");
    expect(text).toContain("280");
    expect(text).toContain("Voice score 73");
  });

  it("renders detail metadata, API Post Coach data, and recovery actions", async () => {
    const { DeterministicDetailInspector } = await loadDeterministicComponents();
    const item = scoredItem({
      score: {
        ...scoredItem().score,
        value: 91,
      },
      postCoach: readyPostCoach({
        value: 18,
        badge: {
          label: "Rework",
          tone: "rework",
          tooltip: "Expanded API copy should be rendered directly.",
        },
        counts: {
          flagged: 4,
          nudges: 3,
          onPoint: 2,
        },
        failed: [
          {
            id: "derived-fail",
            label: "Derived failed check should not appear",
            status: "fail",
          },
        ],
        warned: [],
        passed: [],
        expanded: true,
        previewMode: false,
        sections: [
          {
            title: "Worth a look",
            items: [
              {
                id: "api-expanded-detail",
                label: "API detail says the opener is too abstract",
                status: "warn",
              },
            ],
          },
        ],
        learnings: [
          {
            text: "Expanded detail learning from API data.",
            relevance: "matched",
          },
        ],
        helperText: "Expanded helper text from the API payload.",
        footerText: "Expanded footer text from the API payload.",
      }),
      prediction: missingFollowersPrediction(),
    });

    const html = render(
      <DeterministicDetailInspector
        state="ready"
        item={item}
        onAddFollowers={vi.fn()}
        onRetryExpandedPostCoach={vi.fn()}
      />,
    );
    const text = textContent(html);

    expect(text).toContain("genuine question: what made your onboarding finally click?");
    expect(text).toContain("Deterministic score");
    expect(text).toContain("91");
    expect(text).toContain("Source format");
    expect(text).toContain("debate-question");
    expect(text).toContain("Detected format");
    expect(text).toContain("genuine_question");
    expect(text).toContain("Analyzer");
    expect(text).toContain("deterministic-v1");
    expect(text).toContain("Analyzed at");
    expect(text).toContain("2026-06-07T12:00:00.000Z");
    expect(text).toContain("Post Coach");
    expect(text).toContain("18");
    expect(text).toContain("Rework");
    expect(text).toContain("Expanded API copy should be rendered directly.");
    expect(text).toContain("Expanded helper text from the API payload.");
    expect(text).toContain("Expanded footer text from the API payload.");
    expect(text).toContain("4");
    expect(text).toContain("3");
    expect(text).toContain("2");
    expect(text).toContain("Worth a look");
    expect(text).toContain("API detail says the opener is too abstract");
    expect(text).toContain("Expanded detail learning from API data.");
    expect(text).not.toContain("Derived failed check should not appear");
    expect(text).toContain("Prediction needs follower count.");
    expect(text).toContain("missing_followers");
    expect(text).toContain("Add followers");
    expect(text).toContain("Retry expanded Post Coach");
  });
});
