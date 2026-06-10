import {
  deriveJudgeVerdict,
  judgeVerdictSchema,
  type JudgeDraftResponse,
  type JudgeVerdict,
} from "@x-builder/shared";

import type {
  StructuredLlmProviderResult,
  StructuredLlmRequest,
} from "./structured-llm-service.js";

const judgeProviderId = "codex-cli";

// The verdict label is derived from scores.overall, so the model produces every
// field except the verdict.
const judgeModelOutputSchema = judgeVerdictSchema.omit({ verdict: true });

const judgeInstructions = [
  "You are a demanding editor judging a single draft post for X (Twitter),",
  "optimizing for replies and profile clicks while preserving an authentic human voice.",
  "Score each dimension from 0 to 100:",
  "- replies: how likely the right people are to reply (clear, answerable reply path).",
  "- profileClicks: how much it makes a reader want to check the author, without pitching.",
  "- impressions: broad-enough hook, timely and clear, low friction.",
  "- bookmarkValue: reusable insight, framework, or test worth saving.",
  "- dwellProxy: read-through quality (strong first line, scannable, one idea).",
  "- voiceMatch: reads as an authentic human voice, NOT generic AI-slop or corporate",
  "  polish. Do not assume any specific person's style.",
  "- negativeRisk: risk of negative signals (ragebait, misleading or overclaimed,",
  "  spammy engagement bait, generic AI hype). Higher means more risk.",
  "- overall: your holistic 0-100 judgment, accounting for the dimensions and the",
  "  negative risk.",
  "Penalize hashtag/emoji spam, em dashes, engagement bait, vague 'thoughts?' endings,",
  "unsupported absolutes, and no clear audience.",
  "Also set confidence (low, medium, or high), a one-line headline verdict, up to five",
  "concrete strengths, and up to five concrete improvements. Return only JSON matching",
  "the output schema.",
].join(" ");

const scoreProperty = { type: "integer", minimum: 0, maximum: 100 };

const verdictOutputSchema: Record<string, unknown> = {
  type: "object",
  required: ["scores", "confidence", "headline", "strengths", "improvements"],
  properties: {
    scores: {
      type: "object",
      required: [
        "overall",
        "replies",
        "profileClicks",
        "impressions",
        "bookmarkValue",
        "dwellProxy",
        "voiceMatch",
        "negativeRisk",
      ],
      properties: {
        overall: scoreProperty,
        replies: scoreProperty,
        profileClicks: scoreProperty,
        impressions: scoreProperty,
        bookmarkValue: scoreProperty,
        dwellProxy: scoreProperty,
        voiceMatch: scoreProperty,
        negativeRisk: scoreProperty,
      },
    },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    headline: { type: "string", minLength: 1, maxLength: 160 },
    strengths: {
      type: "array",
      maxItems: 5,
      items: { type: "string", minLength: 1, maxLength: 240 },
    },
    improvements: {
      type: "array",
      maxItems: 5,
      items: { type: "string", minLength: 1, maxLength: 240 },
    },
  },
};

const toVerdict = (value: unknown): JudgeVerdict => {
  const output = judgeModelOutputSchema.parse(value);

  // Explicit verdict key LAST so the derived band always wins, regardless of what
  // the model returned (the omit() already strips any model-supplied verdict).
  return {
    ...output,
    verdict: deriveJudgeVerdict(output.scores.overall),
  };
};

/**
 * Narrow, judge-specialized view of StructuredLlmService so the service can be
 * unit-tested with an in-process fake (no codex, no child process).
 */
export interface JudgeLlmGateway {
  generateStructured(
    request: StructuredLlmRequest<JudgeVerdict>,
  ): Promise<StructuredLlmProviderResult<JudgeVerdict>>;
}

export type JudgeDraftOutcome =
  | { status: "judged"; response: JudgeDraftResponse }
  | { status: "failed"; retryable: boolean; code: string; message: string };

export interface JudgeDraft {
  judge(text: string): Promise<JudgeDraftOutcome>;
}

export class JudgeDraftService implements JudgeDraft {
  constructor(
    private readonly llm: JudgeLlmGateway,
    private readonly providerId: string = judgeProviderId,
  ) {}

  async judge(text: string): Promise<JudgeDraftOutcome> {
    const result = await this.llm.generateStructured({
      provider: this.providerId,
      purpose: "candidate_judge",
      instructions: judgeInstructions,
      turns: [{ role: "user", content: text }],
      structuredOutput: {
        name: "draft_judge_verdict",
        schema: verdictOutputSchema,
        parser: toVerdict,
      },
    });

    if (result.status === "success") {
      return {
        status: "judged",
        response: {
          status: "judged",
          verdict: result.output,
          model: result.provider,
          judgedAt: result.completedAt,
        },
      };
    }

    return {
      status: "failed",
      retryable: result.retryable,
      code: result.code,
      message: result.message,
    };
  }
}
