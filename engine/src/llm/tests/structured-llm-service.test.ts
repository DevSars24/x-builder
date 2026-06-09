import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type {
  LlmProvider,
  StructuredLlmProviderResult,
  StructuredLlmRequest,
  StructuredLlmService as StructuredLlmServiceType,
} from "../structured-llm-service.js";

type DraftOutput = {
  draft: string;
  score: number;
};

type StructuredLlmServiceConstructor = new (options: {
  providers: Array<LlmProvider<unknown>>;
}) => StructuredLlmServiceType;

type FakeProvider = LlmProvider<unknown> & {
  generateStructured: ReturnType<typeof vi.fn>;
};

const draftOutputSchema = z.object({
  draft: z.string(),
  score: z.number(),
});

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["draft", "score"],
  properties: {
    draft: { type: "string" },
    score: { type: "number" },
  },
} as const;

async function loadStructuredLlmService(): Promise<StructuredLlmServiceConstructor> {
  const module = (await import("../structured-llm-service.js")) as {
    StructuredLlmService: StructuredLlmServiceConstructor;
  };

  return module.StructuredLlmService;
}

async function createService(provider: FakeProvider): Promise<StructuredLlmServiceType> {
  const StructuredLlmService = await loadStructuredLlmService();

  return new StructuredLlmService({
    providers: [provider],
  });
}

function request(
  overrides: Partial<StructuredLlmRequest<DraftOutput>> = {},
): StructuredLlmRequest<DraftOutput> {
  return {
    provider: "codex-cli",
    purpose: "writer_first_pass",
    instructions: "Return a structured draft quality summary.",
    turns: [
      {
        role: "system",
        content: "You evaluate draft quality.",
      },
      {
        role: "user",
        content: "Score this draft.",
      },
      {
        role: "assistant",
        content: "Ready for the draft.",
      },
    ],
    structuredOutput: {
      name: "draft_quality",
      schema: jsonSchema,
      parser: (value: unknown) => draftOutputSchema.parse(value),
    },
    ...overrides,
  };
}

function successResult(output: unknown): StructuredLlmProviderResult<unknown> {
  return {
    status: "success",
    provider: "codex-cli",
    requestId: "provider-request-1",
    output,
    durationMs: 12,
    completedAt: "2026-06-09T10:00:00.000Z",
    usage: {
      inputTokens: 12,
      outputTokens: 8,
    },
    rawText: JSON.stringify(output),
  };
}

function failedResult(
  code: string,
  retryable: boolean,
): StructuredLlmProviderResult<unknown> {
  return {
    status: "failed",
    provider: "codex-cli",
    requestId: "provider-request-1",
    code,
    message: "Provider failed safely.",
    retryable,
    durationMs: 9,
    completedAt: "2026-06-09T10:00:00.000Z",
    details: {
      stage: "fake-provider",
    },
  };
}

function fakeProvider(
  generateStructured: FakeProvider["generateStructured"] = vi.fn(async () =>
    successResult({
      draft: "Specific proof beats generic claims.",
      score: 91,
    }),
  ),
): FakeProvider {
  return {
    id: "codex-cli",
    checkReadiness: vi.fn(async () => ({
      state: "ready",
      label: "Codex CLI",
      retryable: false,
      details: {
        adapter: "codex-cli",
      },
      checkedAt: "2026-06-09T10:00:00.000Z",
    })),
    generateStructured,
  } as FakeProvider;
}

describe("structured LLM service", () => {
  it("returns typed output for a valid request and successful fake provider", async () => {
    const provider = fakeProvider();
    const service = await createService(provider);

    const result = await service.generateStructured(request());

    expect(result).toMatchObject({
      status: "success",
      provider: "codex-cli",
      output: {
        draft: "Specific proof beats generic claims.",
        score: 91,
      },
      requestId: expect.any(String),
      durationMs: expect.any(Number),
      completedAt: expect.any(String),
      usage: {
        inputTokens: 12,
        outputTokens: 8,
      },
    });
    expect(provider.generateStructured).toHaveBeenCalledOnce();
    expect(provider.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "codex-cli",
        purpose: "writer_first_pass",
        options: {
          timeoutMs: 60_000,
          outputByteLimit: 500_000,
          attempts: 1,
        },
        structuredOutput: expect.objectContaining({
          name: "draft_quality",
          strict: true,
        }),
      }),
    );
  });

  it("retries a retryable provider failure at most once when two attempts are requested", async () => {
    const generateStructured = vi
      .fn()
      .mockResolvedValueOnce(failedResult("provider_unavailable", true))
      .mockResolvedValueOnce(
        successResult({
          draft: "The retry returned valid structured output.",
          score: 77,
        }),
      );
    const provider = fakeProvider(generateStructured);
    const service = await createService(provider);

    const result = await service.generateStructured(
      request({
        options: {
          attempts: 2,
        },
      }),
    );

    expect(result).toMatchObject({
      status: "success",
      output: {
        draft: "The retry returned valid structured output.",
        score: 77,
      },
    });
    expect(generateStructured).toHaveBeenCalledTimes(2);
  });

  it("returns structured_output_invalid without retrying when provider output fails the parser", async () => {
    const generateStructured = vi.fn(async () =>
      successResult({
        draft: 404,
        score: "invalid",
      }),
    );
    const provider = fakeProvider(generateStructured);
    const service = await createService(provider);

    const result = await service.generateStructured(
      request({
        options: {
          attempts: 2,
        },
      }),
    );

    expect(result).toMatchObject({
      status: "failed",
      provider: "codex-cli",
      code: "structured_output_invalid",
      retryable: false,
      message: expect.any(String),
      requestId: expect.any(String),
      durationMs: expect.any(Number),
      completedAt: expect.any(String),
    });
    expect(generateStructured).toHaveBeenCalledOnce();
  });

  it("returns provider_unconfigured for an unsupported provider id", async () => {
    const provider = fakeProvider();
    const service = await createService(provider);

    const result = await service.generateStructured(
      request({
        provider: "openai-responses",
      } as Partial<StructuredLlmRequest<DraftOutput>>),
    );

    expect(result).toMatchObject({
      status: "failed",
      code: "provider_unconfigured",
      retryable: false,
      provider: "openai-responses",
      message: expect.any(String),
    });
    expect(provider.generateStructured).not.toHaveBeenCalled();
  });

  it("returns unsafe_request for invalid execution bounds before calling a provider", async () => {
    const provider = fakeProvider();
    const service = await createService(provider);

    const result = await service.generateStructured(
      request({
        options: {
          attempts: 3,
          timeoutMs: 180_001,
          outputByteLimit: 2_000_001,
        },
      }),
    );

    expect(result).toMatchObject({
      status: "failed",
      provider: "codex-cli",
      code: "unsafe_request",
      retryable: false,
      message: expect.any(String),
    });
    expect(provider.generateStructured).not.toHaveBeenCalled();
  });

  it("resolves expected provider failures as failed results instead of throwing", async () => {
    const provider = fakeProvider(vi.fn(async () => failedResult("process_failed", false)));
    const service = await createService(provider);

    await expect(service.generateStructured(request())).resolves.toMatchObject({
      status: "failed",
      provider: "codex-cli",
      code: "process_failed",
      retryable: false,
      message: "Provider failed safely.",
    });
    expect(provider.generateStructured).toHaveBeenCalledOnce();
  });
});
