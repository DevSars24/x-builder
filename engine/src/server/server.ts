import Fastify, { type FastifyInstance } from "fastify";
import { apiErrorSchema, type ApiError } from "@x-builder/shared";
import { z } from "zod";

const generateIdeaRequestSchema = z.object({
  idea: z
    .string()
    .trim()
    .min(1, "Idea is required.")
    .max(4_000, "Idea must be 4,000 characters or fewer."),
});

export type GenerateIdeaRequest = z.infer<typeof generateIdeaRequestSchema>;

export type GenerateCandidates = (input: GenerateIdeaRequest) => Promise<unknown> | unknown;

export interface BuildServerOptions {
  generateCandidates?: GenerateCandidates;
}

class NormalizedApiError extends Error {
  constructor(public readonly apiError: ApiError) {
    super(apiError.code);
  }
}

const normalize = (apiError: ApiError): ApiError => apiErrorSchema.parse(apiError);

const fieldErrorsFromZod = (error: z.ZodError): Record<string, string[]> => {
  const fieldErrors: Record<string, string[]> = {};

  for (const [field, messages] of Object.entries(error.flatten().fieldErrors)) {
    if (messages?.length) {
      fieldErrors[field] = messages;
    }
  }

  return fieldErrors;
};

const validationError = (error: z.ZodError): ApiError =>
  normalize({
    code: "validation_failed",
    message: "The request is invalid.",
    scope: "field",
    retryable: false,
    status: 400,
    fieldErrors: fieldErrorsFromZod(error),
  });

const notFoundError = (): ApiError =>
  normalize({
    code: "not_found",
    message: "The requested route was not found.",
    scope: "route",
    retryable: false,
    status: 404,
  });

const generationError = (): ApiError =>
  normalize({
    code: "generation_failed",
    message: "Idea generation failed. Try again.",
    scope: "writer",
    retryable: true,
    status: 500,
  });

const internalError = (): ApiError =>
  normalize({
    code: "internal_error",
    message: "The engine could not complete the request.",
    scope: "app",
    retryable: true,
    status: 500,
  });

const defaultGenerateCandidates: GenerateCandidates = ({ idea }) => ({
  candidates: [
    {
      id: "one-liner",
      format: "one-liner",
      text: idea,
    },
    {
      id: "mini-framework",
      format: "mini-framework",
      text: `${idea}\n\n1. Name the constraint.\n2. Show the tradeoff.\n3. Make the decision.`,
    },
    {
      id: "debate-question",
      format: "debate-question",
      text: `${idea}\n\nWhat would change your mind?`,
    },
  ],
});

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const generateCandidates = options.generateCandidates ?? defaultGenerateCandidates;

  app.setNotFoundHandler((_request, reply) => {
    const apiError = notFoundError();

    return reply.code(apiError.status ?? 404).send(apiError);
  });

  app.setErrorHandler((error, _request, reply) => {
    const apiError =
      error instanceof NormalizedApiError
        ? error.apiError
        : error instanceof z.ZodError
          ? validationError(error)
          : internalError();

    return reply.code(apiError.status ?? 500).send(apiError);
  });

  app.post("/ideas/generate", async (request, reply) => {
    const input = generateIdeaRequestSchema.parse(request.body);

    try {
      const result = await generateCandidates(input);

      return reply.send(result);
    } catch {
      throw new NormalizedApiError(generationError());
    }
  });

  return app;
}
