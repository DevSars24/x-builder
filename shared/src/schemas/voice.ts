import { z } from "zod";

export const voiceProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  tone: z.array(z.string()),
  sentenceShape: z.array(z.string()),
  commonMoves: z.array(z.string()),
  topics: z.array(z.string()),
  phrasesToAvoid: z.array(z.string()),
  examplePostIds: z.array(z.string()),
  enabled: z.boolean().default(true),
  updatedAt: z.string().datetime()
});

export const extractVoiceRequestSchema = z.object({
  postIds: z.array(z.string()).default([]),
  pastedPosts: z.array(z.string()).default([])
});

export const extractVoiceResponseSchema = z.object({
  voiceProfile: voiceProfileSchema
});

export type VoiceProfile = z.infer<typeof voiceProfileSchema>;
export type ExtractVoiceRequest = z.infer<typeof extractVoiceRequestSchema>;
export type ExtractVoiceResponse = z.infer<typeof extractVoiceResponseSchema>;
