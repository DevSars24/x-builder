import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ApiError, JudgeDraftResponse, JudgeVerdict } from "@x-builder/shared";

import {
  createInitialModel,
  runJudgeDraft,
  type WriterApiClient,
  type WriterPageModel,
} from "../writer-workflow";
import { JudgePanel } from "../writer-page";

const verdict: JudgeVerdict = {
  verdict: "slight_rework",
  confidence: "medium",
  scores: {
    overall: 78,
    replies: 80,
    profileClicks: 72,
    impressions: 65,
    bookmarkValue: 60,
    dwellProxy: 70,
    voiceMatch: 85,
    negativeRisk: 10,
  },
  headline: "Strong hook, weak closer.",
  strengths: ["Concrete claim up front"],
  improvements: ["Trim the middle paragraph"],
};

const judgedResponse: JudgeDraftResponse = {
  status: "judged",
  verdict,
  model: "codex-cli",
  judgedAt: "2026-06-10T12:00:00.000Z",
};

const buildApiClient = (judgeDraft: WriterApiClient["judgeDraft"]): WriterApiClient => ({
  analyzePosts: vi.fn() as unknown as WriterApiClient["analyzePosts"],
  generateIdea: vi.fn() as unknown as WriterApiClient["generateIdea"],
  judgeDraft,
});

const draftModel = (idea: string): WriterPageModel => ({ ...createInitialModel(), idea });

// Mirror WriterPage.publishModel: apply functional updates against running state.
const runWithPublish = (apiClient: WriterApiClient, model: WriterPageModel) => {
  let current = model;
  const publish = (
    update: WriterPageModel | ((value: WriterPageModel) => WriterPageModel),
  ): void => {
    current = typeof update === "function" ? update(current) : update;
  };

  return runJudgeDraft(apiClient, model, publish);
};

describe("runJudgeDraft", () => {
  it("sets a ready verdict on success and sends the trimmed draft", async () => {
    const judgeDraft = vi.fn(async () => judgedResponse);

    const next = await runWithPublish(buildApiClient(judgeDraft), draftModel("  a real draft  "));

    expect(judgeDraft).toHaveBeenCalledWith({ text: "a real draft" });
    expect(next.judge).toEqual({ status: "ready", verdict });
  });

  it("does not call the judge for an empty draft", async () => {
    const judgeDraft = vi.fn();

    const next = await runWithPublish(buildApiClient(judgeDraft), draftModel("   "));

    expect(judgeDraft).not.toHaveBeenCalled();
    expect(next.judge.status).toBe("idle");
  });

  it("captures a failed verdict with the normalized api error", async () => {
    const apiError: ApiError = {
      code: "judge_failed",
      message: "Codex unavailable.",
      scope: "judge",
      retryable: true,
      status: 503,
    };
    const judgeDraft = vi.fn(async () => {
      throw Object.assign(new Error(apiError.message), { apiError });
    });

    const next = await runWithPublish(buildApiClient(judgeDraft), draftModel("a draft"));

    expect(next.judge.status).toBe("failed");
    if (next.judge.status === "failed") {
      expect(next.judge.error.code).toBe("judge_failed");
    }
  });
});

describe("JudgePanel", () => {
  it("renders the verdict band, confidence, dimension scores, and critique", () => {
    const html = renderToStaticMarkup(
      <JudgePanel judge={{ status: "ready", verdict }} onJudge={() => {}} judgeReady draftReady />,
    );

    expect(html).toContain("Slight rework");
    expect(html).toContain("Confidence: medium");
    // All eight scoring dimensions must render.
    for (const label of [
      "Overall",
      "Replies",
      "Profile clicks",
      "Impressions",
      "Bookmark value",
      "Dwell",
      "Voice match",
      "Negative risk",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("78");
    expect(html).toContain("Strong hook, weak closer.");
    expect(html).toContain("Concrete claim up front");
    expect(html).toContain("Trim the middle paragraph");
  });

  it("disables the judge button with a hint when the judge is not ready", () => {
    const html = renderToStaticMarkup(
      <JudgePanel judge={{ status: "idle" }} onJudge={() => {}} judgeReady={false} draftReady />,
    );

    expect(html).toContain("disabled");
    expect(html.toLowerCase()).toContain("codex");
  });

  it("enables the judge button when the judge is ready and a draft is present", () => {
    const html = renderToStaticMarkup(
      <JudgePanel judge={{ status: "idle" }} onJudge={() => {}} judgeReady draftReady />,
    );

    // The judge readiness gate reads the renamed judgeReady prop; with both gates
    // satisfied the button must be interactive rather than disabled.
    expect(html).toContain("Judge draft");
    expect(html).not.toContain("disabled");
  });

  it("disables the judge button for an empty draft", () => {
    const html = renderToStaticMarkup(
      <JudgePanel judge={{ status: "idle" }} onJudge={() => {}} judgeReady draftReady={false} />,
    );

    expect(html).toContain("disabled");
  });

  it("shows a loading affordance and disables the button while judging", () => {
    const html = renderToStaticMarkup(
      <JudgePanel judge={{ status: "loading" }} onJudge={() => {}} judgeReady draftReady />,
    );

    expect(html).toContain("Judging");
    expect(html).toContain("disabled");
    expect(html).toContain('aria-busy="true"');
  });

  it("labels the button Retry judge after a failure", () => {
    const html = renderToStaticMarkup(
      <JudgePanel
        judge={{
          status: "failed",
          error: {
            code: "judge_failed",
            message: "Codex unavailable.",
            scope: "judge",
            retryable: true,
            status: 503,
          },
        }}
        onJudge={() => {}}
        judgeReady
        draftReady
      />,
    );

    expect(html).toContain("Retry judge");
  });

  it("renders a verdict with empty strengths and improvements", () => {
    const html = renderToStaticMarkup(
      <JudgePanel
        judge={{ status: "ready", verdict: { ...verdict, strengths: [], improvements: [] } }}
        onJudge={() => {}}
        judgeReady
        draftReady
      />,
    );

    expect(html).toContain("Strong hook, weak closer.");
    expect(html).not.toContain("Strengths");
    expect(html).not.toContain("Improvements");
  });

  it("renders the error message when judging failed", () => {
    const html = renderToStaticMarkup(
      <JudgePanel
        judge={{
          status: "failed",
          error: {
            code: "judge_failed",
            message: "Codex unavailable.",
            scope: "judge",
            retryable: true,
            status: 503,
          },
        }}
        onJudge={() => {}}
        judgeReady
        draftReady
      />,
    );

    expect(html).toContain("Codex unavailable.");
  });
});
