import { z } from "zod";

export const llmJudgeVerdictSchema = z.enum([
  "publish_best",
  "rewrite_first",
  "needs_new_angle",
  "do_not_publish"
]);

export const llmJudgeCandidateResultSchema = z.object({
  candidateId: z.string(),
  rank: z.number().int().min(1),
  verdict: llmJudgeVerdictSchema,
  summary: z.string(),
  strengths: z.array(z.string()),
  risks: z.array(z.string()),
  suggestedRewrite: z.string().optional()
});

export const llmJudgeResponseSchema = z.object({
  recommendedCandidateId: z.string(),
  results: z.array(llmJudgeCandidateResultSchema),
  overallNotes: z.array(z.string())
});

export type LlmJudgeVerdict = z.infer<typeof llmJudgeVerdictSchema>;
export type LlmJudgeCandidateResult = z.infer<typeof llmJudgeCandidateResultSchema>;
export type LlmJudgeResponse = z.infer<typeof llmJudgeResponseSchema>;
