import { z } from "zod";

export const postSourceSchema = z.enum(["self", "external", "manual", "generated"]);

export const postFormatSchema = z.enum([
  "one_liner",
  "mini_framework",
  "debate_question",
  "unknown"
]);

export const knownPostSchema = z.object({
  id: z.string(),
  source: postSourceSchema,
  authorHandle: z.string().optional(),
  text: z.string().min(1),
  url: z.string().url().optional(),
  postedAt: z.string().datetime().optional(),
  format: postFormatSchema.default("unknown"),
  topic: z.string().optional(),
  hookType: z.string().optional(),
  metrics: z.record(z.number()).default({}),
  usedForVoice: z.boolean().default(false),
  usedForSignal: z.boolean().default(false),
  usedInGeneration: z.boolean().default(false),
  excluded: z.boolean().default(false),
  importedAt: z.string().datetime()
});

export const importPostsRequestSchema = z.object({
  posts: z.array(knownPostSchema.omit({ id: true, importedAt: true }).extend({
    id: z.string().optional(),
    importedAt: z.string().datetime().optional()
  }))
});

export type PostSource = z.infer<typeof postSourceSchema>;
export type PostFormat = z.infer<typeof postFormatSchema>;
export type KnownPost = z.infer<typeof knownPostSchema>;
export type ImportPostsRequest = z.infer<typeof importPostsRequestSchema>;
