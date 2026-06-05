import { z } from "zod";
import { postFormatSchema } from "./posts";

export const scoreBandSchema = z.enum(["strong", "good", "usable", "needs_rewrite"]);

export const deterministicScoresSchema = z.object({
  reach: z.number().min(0).max(100),
  engagement: z.number().min(0).max(100),
  impressions: z.number().min(0).max(100),
  voiceMatch: z.number().min(0).max(100),
  overall: z.number().min(0).max(100),
  band: scoreBandSchema
});

export const candidateSchema = z.object({
  id: z.string(),
  ideaId: z.string(),
  format: postFormatSchema.exclude(["unknown"]),
  text: z.string().min(1),
  deterministicScores: deterministicScoresSchema,
  reasons: z.array(z.string()),
  risks: z.array(z.string())
});

export const generateIdeaRequestSchema = z.object({
  idea: z.string().min(1),
  voiceProfileId: z.string().optional(),
  useKnownPostIds: z.array(z.string()).default([])
});

export const generateIdeaResponseSchema = z.object({
  ideaId: z.string(),
  candidates: z.array(candidateSchema).length(3)
});

export const expandCandidateRequestSchema = z.object({
  ideaId: z.string(),
  candidateId: z.string(),
  count: z.number().int().min(1).max(5).default(3)
});

export const expandCandidateResponseSchema = z.object({
  variants: z.array(candidateSchema)
});

export type DeterministicScores = z.infer<typeof deterministicScoresSchema>;
export type Candidate = z.infer<typeof candidateSchema>;
export type GenerateIdeaRequest = z.infer<typeof generateIdeaRequestSchema>;
export type GenerateIdeaResponse = z.infer<typeof generateIdeaResponseSchema>;
export type ExpandCandidateRequest = z.infer<typeof expandCandidateRequestSchema>;
export type ExpandCandidateResponse = z.infer<typeof expandCandidateResponseSchema>;
