import { describe, expect, it } from "vitest";

import {
  analyzePost,
  createVarietyCheck,
  derivePostCoachCard,
  detectFormat,
  getPostCoachBadge,
  predictEngagement,
  recordPostHistory,
  runVoiceChecks,
  streakForFormat,
  type PostHistoryItem,
  type VoiceCheck,
} from "../post-analyzer";

describe("deterministic post analyzer", () => {
  it("detects the supported post formats from observable text structure", () => {
    expect(detectFormat("Hot take: most dashboards are just procrastination")).toBe("hot_take");
    expect(detectFormat("genuine question: why do agents fail at handoffs?")).toBe("genuine_question");
    expect(detectFormat("Founders, what changed your onboarding?")).toBe("audience_question");
    expect(detectFormat("My goal is to ship 3 experiments by end of June")).toBe("goal_share");
    expect(detectFormat("Ship the uncomfortable version")).toBe("one_liner");
  });

  it("scores voice quality, learnings, and engageability deterministically", () => {
    const result = analyzePost(
      "genuine question: why do agents fail at handoffs?",
      { followers: 1000 },
    );

    expect(result).toMatchObject({
      format: "genuine_question",
      score: {
        engageability: {
          engageable: true,
        },
      },
    });
    expect(result.score.checks.find((check) => check.id === "quality_hook")).toMatchObject({
      status: "pass",
    });
    expect(result.score.learnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relevance: "matched",
          text: expect.stringContaining("genuine question"),
        }),
      ]),
    );
  });

  it("keeps the engagement prediction card math stable", () => {
    const prediction = predictEngagement({
      text: "Clear writing compounds when the point is specific.",
      score: 66,
      format: "insight_share",
      followers: 1000,
    });

    expect(prediction).toEqual({
      rangeLow: 160,
      rangeHigh: 372,
      midpoint: 266,
      confidence: "medium",
      signals: [
        {
          signal_key: "quality_voice",
          label: "Voice score 66 (-30%)",
          multiplier: 0.7,
        },
        {
          signal_key: "format_insight_share",
          label: "Insight format -5%",
          multiplier: 0.95,
        },
      ],
    });
  });

  it("supports disabled checks and an injected variety check for future engine composition", () => {
    const varietyCheck: VoiceCheck = {
      id: "variety_recent_format",
      label: "Recent format variety",
      status: "warn",
    };
    const score = runVoiceChecks("Hot take: specific beats clever every time", {
      enabled: {
        hashtags: false,
      },
      varietyCheck,
    });

    expect(score.checks.some((check) => check.id === "hashtags")).toBe(false);
    expect(score.checks).toEqual(expect.arrayContaining([varietyCheck]));
  });

  it("derives a variety check from recent post history without browser storage", () => {
    const history: PostHistoryItem[] = [
      { format: "insight_share", at: "2026-06-07T09:00:00.000Z" },
      { format: "insight_share", at: "2026-06-06T09:00:00.000Z" },
      { format: "hot_take", at: "2026-06-05T09:00:00.000Z" },
    ];
    const insightDraft =
      "Specificity creates trust when you show proof from launch week instead of asking people to believe your roadmap";

    expect(createVarietyCheck(insightDraft, [])).toEqual({
      id: "variety",
      label: "Format mix (insight share)",
      status: "pass",
    });
    expect(createVarietyCheck(insightDraft, history)).toEqual({
      id: "variety",
      label: "3 insight shares in a row - mix it up",
      status: "fail",
    });
    expect(streakForFormat(history, "insight_share")).toBe(2);
  });

  it("records bounded post history in newest-first order", () => {
    const history = Array.from({ length: 10 }, (_, index): PostHistoryItem => ({
      format: index % 2 === 0 ? "story" : "hot_take",
      at: `2026-06-${String(index + 1).padStart(2, "0")}T09:00:00.000Z`,
    }));
    const next = recordPostHistory(
      history,
      {
        format: "genuine_question",
        kind: "published",
      },
      new Date("2026-06-07T12:00:00.000Z"),
    );

    expect(next).toHaveLength(10);
    expect(next[0]).toEqual({
      format: "genuine_question",
      kind: "published",
      at: "2026-06-07T12:00:00.000Z",
    });
    expect(next).not.toContain(history[9]);
  });

  it("derives the empty Post Coach card state before the user writes", () => {
    expect(derivePostCoachCard({ hasText: false, score: null })).toEqual({
      state: "empty",
      title: "Post Coach",
      message:
        "Start typing to see how the draft scores against your voice rules plus learnings from your last 30 days.",
    });
  });

  it("derives the expanded Post Coach card sections from voice checks", () => {
    const score = runVoiceChecks(
      [
        "everyone should log launches",
        "",
        "we got 42 replies last week",
        "",
        "proof creates trust",
      ].join("\n"),
      {
        varietyCheck: {
          id: "variety_format_mix",
          label: "Format mix (insight share)",
          status: "pass",
        },
      },
    );
    const card = derivePostCoachCard({
      expanded: true,
      hasText: true,
      score,
    });

    expect(card).toMatchObject({
      state: "ready",
      title: "Post Coach",
      value: 66,
      target: 60,
      badge: {
        label: "Ship it",
        tone: "ship",
      },
      counts: {
        flagged: 4,
        nudges: 1,
        onPoint: 16,
      },
      expanded: true,
      previewMode: false,
      hiddenChecks: 0,
    });

    if (card.state !== "ready") {
      throw new Error("Expected ready card.");
    }

    expect(card.engageability).toEqual({
      engageable: false,
      reason:
        'No clear engagement hook. Add a "hot take:" / "genuine question:" prefix, end on a question, share a milestone moment, or call out an audience.',
    });
    expect(card.sections.map((section) => section.title)).toEqual([
      "Worth a look",
      "Nudges",
      "On point",
    ]);
    expect(card.sections[0]?.items.map((check) => check.id)).toEqual([
      "quality_hook",
      "quality_tension",
      "quality_quotable",
      "quality_question",
    ]);
    expect(card.sections[1]?.items.map((check) => check.id)).toEqual([
      "direct_opener",
    ]);
    expect(card.learnings).toEqual([
      {
        text: "Posts with 3+ lines get 3.2x more impressions in your data.",
        relevance: "matched",
      },
    ]);
    expect(card.helperText).toContain("Signals, not verdicts.");
    expect(card.footerText).toContain("These are static rule checks");
  });

  it("derives Post Coach preview samples without learnings", () => {
    const score = runVoiceChecks("everyone should log launches");
    const card = derivePostCoachCard({
      hasText: true,
      previewMode: true,
      score,
    });

    expect(card).toMatchObject({
      state: "ready",
      expanded: false,
      previewMode: true,
      learnings: [],
      sections: [
        {
          title: "Sample",
        },
      ],
      hiddenChecks: score.checks.length - 2,
    });
  });

  it("labels Post Coach score bands for card badges", () => {
    expect(getPostCoachBadge(90)).toMatchObject({ label: "Top tier", tone: "top" });
    expect(getPostCoachBadge(60)).toMatchObject({ label: "Ship it", tone: "ship" });
    expect(getPostCoachBadge(45)).toMatchObject({ label: "Almost there", tone: "almost" });
    expect(getPostCoachBadge(20)).toMatchObject({ label: "Rework", tone: "rework" });
  });
});
