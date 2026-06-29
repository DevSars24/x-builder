import { z } from "zod";
import { judgeVerdictSchema } from "./judge.js";
import { replyComposerContextSchema } from "./reply-composer-context.js";

export const applyJudgeSuggestionsRequestSchema = z.object({
  text: z.string().trim().min(1).max(8_000),
  replyContext: replyComposerContextSchema.optional(),
});

export const applyJudgeSuggestionsResponseSchema = z.object({
  text: z.string().min(1).max(8_000),
  verdict: judgeVerdictSchema,
  approved: z.boolean(),
  improvedOverOriginal: z.boolean(),
});

export type ApplyJudgeSuggestionsRequest = z.infer<typeof applyJudgeSuggestionsRequestSchema>;
export type ApplyJudgeSuggestionsResponse = z.infer<typeof applyJudgeSuggestionsResponseSchema>;
