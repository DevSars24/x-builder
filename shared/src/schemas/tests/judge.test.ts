import { describe, expect, it } from "vitest";

import {
  apiErrorSchema,
  deriveJudgeVerdict,
  judgeDraftRequestSchema,
  judgeDraftResponseSchema,
  judgeScoresSchema,
  judgeVerdictSchema,
} from "../../index.js";

const scores = {
  overall: 78,
  replies: 80,
  profileClicks: 72,
  impressions: 65,
  bookmarkValue: 60,
  dwellProxy: 70,
  voiceMatch: 85,
  negativeRisk: 10,
  answerEffort: 55,
  strangerAnswerability: 62,
  statusDependency: 30,
  replyVsQuoteOrientation: 48,
  audienceMatch: 70,
};

const validVerdict = {
  verdict: "slight_rework",
  confidence: "medium",
  scores,
  headline: "Strong hook, weak closer.",
  strengths: ["Opens with a concrete claim", "Ends on a reply-friendly question"],
  improvements: ["Tighten the middle paragraph"],
};

describe("judge schemas", () => {
  it("parses a valid judge draft request", () => {
    expect(judgeDraftRequestSchema.safeParse({ text: "A draft worth judging." }).success).toBe(true);
  });

  it("rejects an empty or whitespace-only draft request", () => {
    expect(judgeDraftRequestSchema.safeParse({ text: "" }).success).toBe(false);
    expect(judgeDraftRequestSchema.safeParse({ text: "   \n\t " }).success).toBe(false);
  });

  it("rejects a draft longer than 8000 characters", () => {
    expect(judgeDraftRequestSchema.safeParse({ text: "a".repeat(8_001) }).success).toBe(false);
  });

  it("parses a valid multi-dimensional verdict and a full judged response", () => {
    expect(judgeVerdictSchema.safeParse(validVerdict).success).toBe(true);
    expect(
      judgeDraftResponseSchema.safeParse({
        status: "judged",
        verdict: validVerdict,
        model: "codex",
        judgedAt: "2026-06-10T12:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("rejects a score outside 0..100 or non-integer", () => {
    expect(judgeVerdictSchema.safeParse({ ...validVerdict, scores: { ...scores, replies: 101 } }).success).toBe(false);
    expect(judgeVerdictSchema.safeParse({ ...validVerdict, scores: { ...scores, replies: -1 } }).success).toBe(false);
    expect(judgeVerdictSchema.safeParse({ ...validVerdict, scores: { ...scores, replies: 80.5 } }).success).toBe(false);
  });

  it("rejects a verdict that is missing a score dimension", () => {
    const { voiceMatch: _voiceMatch, ...partialScores } = scores;
    expect(judgeVerdictSchema.safeParse({ ...validVerdict, scores: partialScores }).success).toBe(false);
  });

  it("rejects an unknown verdict label or confidence level", () => {
    expect(judgeVerdictSchema.safeParse({ ...validVerdict, verdict: "ship_it" }).success).toBe(false);
    expect(judgeVerdictSchema.safeParse({ ...validVerdict, confidence: "certain" }).success).toBe(false);
  });

  it("rejects an empty or over-long headline and over-long critique items", () => {
    expect(judgeVerdictSchema.safeParse({ ...validVerdict, headline: "" }).success).toBe(false);
    expect(judgeVerdictSchema.safeParse({ ...validVerdict, strengths: ["a".repeat(241)] }).success).toBe(false);
    expect(
      judgeVerdictSchema.safeParse({ ...validVerdict, improvements: ["a", "b", "c", "d", "e", "f"] }).success,
    ).toBe(false);
  });

  it("accepts a verdict with empty strengths and improvements arrays", () => {
    expect(
      judgeVerdictSchema.safeParse({ ...validVerdict, strengths: [], improvements: [] }).success,
    ).toBe(true);
  });

  it("rejects a response with a wrong status literal, blank model, or non-ISO judgedAt", () => {
    const base = {
      status: "judged",
      verdict: validVerdict,
      model: "codex",
      judgedAt: "2026-06-10T12:00:00.000Z",
    };
    expect(judgeDraftResponseSchema.safeParse({ ...base, status: "done" }).success).toBe(false);
    expect(judgeDraftResponseSchema.safeParse({ ...base, model: "" }).success).toBe(false);
    expect(judgeDraftResponseSchema.safeParse({ ...base, judgedAt: "2026-06-10" }).success).toBe(false);
  });

  it("derives the verdict band from the overall score", () => {
    expect(deriveJudgeVerdict(90)).toBe("post_now");
    expect(deriveJudgeVerdict(85)).toBe("post_now");
    expect(deriveJudgeVerdict(84)).toBe("slight_rework");
    expect(deriveJudgeVerdict(70)).toBe("slight_rework");
    expect(deriveJudgeVerdict(69)).toBe("major_rework");
    expect(deriveJudgeVerdict(40)).toBe("major_rework");
    expect(deriveJudgeVerdict(39)).toBe("do_not_post");
    expect(deriveJudgeVerdict(0)).toBe("do_not_post");
  });

  it("accepts the judge_failed api error code with the judge scope", () => {
    const result = apiErrorSchema.safeParse({
      code: "judge_failed",
      message: "The Codex judge could not score this draft.",
      scope: "judge",
      retryable: true,
      status: 503,
    });

    expect(result.success).toBe(true);
  });

  it("keeps pre-existing api error codes and scopes valid", () => {
    const result = apiErrorSchema.safeParse({
      code: "generation_failed",
      message: "Idea generation failed. Try again.",
      scope: "writer",
      retryable: true,
      status: 500,
    });

    expect(result.success).toBe(true);
  });

  it("parses judge scores carrying the four new numeric dimensions", () => {
    const result = judgeScoresSchema.safeParse(scores);

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected judge scores with the new dimensions to parse.");
    }
    expect(result.data).toMatchObject({
      answerEffort: 55,
      strangerAnswerability: 62,
      statusDependency: 30,
      replyVsQuoteOrientation: 48,
    });
  });

  it("rejects judge scores missing one of the new numeric dimensions", () => {
    const { answerEffort: _answerEffort, ...withoutAnswerEffort } = scores;

    expect(judgeScoresSchema.safeParse(withoutAnswerEffort).success).toBe(false);
  });

  it("rejects a new numeric dimension outside 0..100 or non-integer", () => {
    expect(judgeScoresSchema.safeParse({ ...scores, statusDependency: 101 }).success).toBe(false);
    expect(judgeScoresSchema.safeParse({ ...scores, statusDependency: -1 }).success).toBe(false);
    expect(judgeScoresSchema.safeParse({ ...scores, answerEffort: 50.5 }).success).toBe(false);
  });

  it("parses judge scores with an explicit null audience match", () => {
    const result = judgeScoresSchema.safeParse({ ...scores, audienceMatch: null });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected judge scores with a null audience match to parse.");
    }
    expect(result.data.audienceMatch).toBeNull();
  });

  it("parses judge scores with a numeric audience match", () => {
    const result = judgeScoresSchema.safeParse({ ...scores, audienceMatch: 70 });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected judge scores with a numeric audience match to parse.");
    }
    expect(result.data.audienceMatch).toBe(70);
  });

  it("rejects judge scores that omit audience match entirely because it is nullable, not optional", () => {
    const { audienceMatch: _audienceMatch, ...withoutAudienceMatch } = scores;

    expect(judgeScoresSchema.safeParse(withoutAudienceMatch).success).toBe(false);
  });

  it("rejects a numeric audience match outside 0..100", () => {
    expect(judgeScoresSchema.safeParse({ ...scores, audienceMatch: 101 }).success).toBe(false);
    expect(judgeScoresSchema.safeParse({ ...scores, audienceMatch: -1 }).success).toBe(false);
  });

  it("parses a judge draft request carrying an optional account profile", () => {
    const result = judgeDraftRequestSchema.safeParse({
      text: "A draft worth judging.",
      accountProfile: "Builds developer tools; audience is backend engineers.",
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected judge draft request with an account profile to parse.");
    }
    expect(result.data.accountProfile).toBe(
      "Builds developer tools; audience is backend engineers.",
    );
  });

  it("parses a judge draft request with the account profile omitted", () => {
    const result = judgeDraftRequestSchema.safeParse({ text: "A draft worth judging." });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected judge draft request without an account profile to parse.");
    }
    expect(result.data.accountProfile).toBeUndefined();
  });

  it("rejects a whitespace-only account profile and trims surrounding whitespace", () => {
    expect(
      judgeDraftRequestSchema.safeParse({
        text: "A draft worth judging.",
        accountProfile: "   \n\t ",
      }).success,
    ).toBe(false);

    const result = judgeDraftRequestSchema.safeParse({
      text: "A draft worth judging.",
      accountProfile: "  Indie hacker.  ",
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected a trimmable account profile to parse.");
    }
    expect(result.data.accountProfile).toBe("Indie hacker.");
  });

  it("rejects a judge draft account profile longer than 600 characters", () => {
    expect(
      judgeDraftRequestSchema.safeParse({
        text: "A draft worth judging.",
        accountProfile: "a".repeat(601),
      }).success,
    ).toBe(false);
    expect(
      judgeDraftRequestSchema.safeParse({
        text: "A draft worth judging.",
        accountProfile: "a".repeat(600),
      }).success,
    ).toBe(true);
  });
});
