import { baseProcessEnvAllowlist } from "./process-runner.js";
import type { ProcessRunner, ProcessRunResult } from "./process-runner.js";
import type {
  KnownLlmProviderErrorCode,
  LlmProvider,
  LlmProviderId,
  NormalizedStructuredLlmRequest,
  StructuredLlmProviderResult,
  StructuredLlmUsage,
} from "./structured-llm-service.js";

const providerId = "claude-cli";

// The largest combined size of the inline JSON Schema and the system prompt the
// claude CLI can safely accept as argv values. A request beyond this is rejected
// before any spawn rather than handed to a process that would hang on it.
const maxInlineRequestSize = 100_000;

// The claude CLI run inherits the provider-agnostic base allowlist plus the
// claude-specific environment variables it needs at exec time. ANTHROPIC_API_KEY
// is the key path; USER is required for the keychain OAuth path. Composing from
// the base keeps the shared names in one place so they cannot drift.
export const claudeCliProcessEnvAllowlist = [
  ...baseProcessEnvAllowlist,
  "ANTHROPIC_API_KEY",
  "USER",
] as const;

export type ClaudeCommandBuilderOptions = {
  workspaceRoot: string;
  schema: string;
  instructions: string;
  model?: string;
};

export type ClaudeCliProviderOptions = {
  runner: ProcessRunner;
  workspaceRoot: string;
  commandBuilder?: ClaudeCommandBuilder;
};

export type ClaudeCliParserFailureCategory =
  | "empty_stdout"
  | "invalid_json"
  | "provider_reported_error"
  | "missing_result"
  | "result_not_object";

export type ClaudeCliParseResult =
  | {
      status: "success";
      value: Record<string, unknown>;
      usage?: StructuredLlmUsage;
      rawText: string;
    }
  | {
      status: "failed";
      category: ClaudeCliParserFailureCategory;
    };

export class ClaudeCommandBuilder {
  build(options: ClaudeCommandBuilderOptions): readonly string[] {
    const args = [
      "-p",
      "--output-format",
      "json",
      "--json-schema",
      options.schema,
      "--system-prompt",
      options.instructions,
      "--tools",
      "",
      "--no-session-persistence",
      "--setting-sources",
      "",
    ];

    // Only the active provider's configured model is appended; an empty or absent
    // model leaves the argv byte-identical to the base command.
    if (options.model !== undefined && options.model.length > 0) {
      args.push("--model", options.model);
    }

    return args;
  }
}

export class ClaudeCliOutputParser {
  parse(stdout: string): ClaudeCliParseResult {
    const trimmed = stdout.trim();

    if (trimmed.length === 0) {
      return {
        status: "failed",
        category: "empty_stdout",
      };
    }

    let envelope: unknown;

    try {
      envelope = JSON.parse(trimmed);
    } catch {
      return {
        status: "failed",
        category: "invalid_json",
      };
    }

    if (!isJsonObject(envelope)) {
      return {
        status: "failed",
        category: "provider_reported_error",
      };
    }

    if (envelope.is_error === true || envelope.subtype !== "success") {
      return {
        status: "failed",
        category: "provider_reported_error",
      };
    }

    const candidate = extractResultCandidate(envelope);

    if (candidate.kind === "missing") {
      return {
        status: "failed",
        category: "missing_result",
      };
    }

    if (candidate.kind === "invalid") {
      return {
        status: "failed",
        category: "result_not_object",
      };
    }

    const usage = extractUsage(envelope);

    return {
      status: "success",
      value: candidate.value,
      ...(usage ? { usage } : {}),
      rawText: trimmed,
    };
  }
}

export class ClaudeCliProvider<TProviderOutput = unknown> implements LlmProvider<TProviderOutput> {
  readonly id: LlmProviderId = providerId;

  private readonly runner: ProcessRunner;
  private readonly workspaceRoot: string;
  private readonly commandBuilder: ClaudeCommandBuilder;
  private readonly outputParser = new ClaudeCliOutputParser();

  constructor(options: ClaudeCliProviderOptions) {
    this.runner = options.runner;
    this.workspaceRoot = options.workspaceRoot;
    this.commandBuilder = options.commandBuilder ?? new ClaudeCommandBuilder();
  }

  async generateStructured<TOutput>(
    request: NormalizedStructuredLlmRequest<TOutput>,
  ): Promise<StructuredLlmProviderResult<TProviderOutput>> {
    const startedAt = Date.now();
    const schema = JSON.stringify(request.structuredOutput.schema);

    // Fail fast before spawning: a schema-plus-instructions payload past the
    // inline bound would hang the claude CLI, so it is rejected as unsafe.
    if (schema.length + request.instructions.length > maxInlineRequestSize) {
      return failure(
        "unsafe_request",
        "Claude CLI cannot accept a structured output request this large.",
        false,
        startedAt,
      );
    }

    try {
      const args = this.commandBuilder.build({
        workspaceRoot: this.workspaceRoot,
        schema,
        instructions: request.instructions,
        model: request.options.model,
      });
      const result = await this.runner.run("claude", args, {
        cwd: this.workspaceRoot,
        timeoutMs: request.options.timeoutMs,
        maxStdoutBytes: request.options.outputByteLimit,
        maxStderrBytes: request.options.outputByteLimit,
        stdin: buildPrompt(request),
        envAllowlist: [...claudeCliProcessEnvAllowlist],
      });

      if (result.status === "failed") {
        return processFailure(result, startedAt);
      }

      const parsed = this.outputParser.parse(result.stdout);

      if (parsed.status === "failed") {
        return failure(
          "invalid_provider_response",
          "Claude CLI returned malformed structured output.",
          false,
          startedAt,
          {
            durationMs: result.durationMs,
            stdoutBytes: result.stdoutBytes,
            stderrBytes: result.stderrBytes,
            parserFailureCategory: parsed.category,
          },
        );
      }

      let output: TOutput;

      try {
        output = request.structuredOutput.parser(parsed.value);
      } catch {
        return failure(
          "structured_output_invalid",
          "Claude CLI output did not match the requested structured output contract.",
          false,
          startedAt,
          {
            durationMs: result.durationMs,
            stdoutBytes: result.stdoutBytes,
            stderrBytes: result.stderrBytes,
            parserFailureCategory: "caller_parser_rejected",
          },
        );
      }

      return {
        status: "success",
        provider: providerId,
        requestId: crypto.randomUUID(),
        output: output as unknown as TProviderOutput,
        durationMs: elapsedMs(startedAt),
        completedAt: nowIso(),
        ...(parsed.usage ? { usage: parsed.usage } : {}),
        rawText: parsed.rawText,
      };
    } catch {
      return failure(
        "process_failed",
        "Claude CLI process failed before returning structured output.",
        false,
        startedAt,
      );
    }
  }
}

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

type ResultCandidate =
  | { kind: "object"; value: Record<string, unknown> }
  | { kind: "missing" }
  | { kind: "invalid" };

const extractResultCandidate = (envelope: Record<string, unknown>): ResultCandidate => {
  // structured_output wins: a success envelope can carry the object there while
  // result is an empty string.
  if ("structured_output" in envelope) {
    const structured = envelope.structured_output;

    if (isJsonObject(structured)) {
      return { kind: "object", value: structured };
    }
  }

  if ("result" in envelope) {
    const result = envelope.result;

    if (isJsonObject(result)) {
      return { kind: "object", value: result };
    }

    if (typeof result === "string") {
      const parsed = parseStringResult(result);

      return parsed === undefined
        ? { kind: "invalid" }
        : isJsonObject(parsed)
          ? { kind: "object", value: parsed }
          : { kind: "invalid" };
    }
  }

  return { kind: "missing" };
};

const parseStringResult = (result: string): unknown => {
  const stripped = stripJsonFence(result.trim());

  try {
    return JSON.parse(stripped);
  } catch {
    return undefined;
  }
};

const stripJsonFence = (value: string): string => {
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/.exec(value);

  return fenced ? (fenced[1] as string).trim() : value;
};

const extractUsage = (envelope: Record<string, unknown>): StructuredLlmUsage | undefined => {
  const usage = envelope.usage;

  if (!isJsonObject(usage)) {
    return undefined;
  }

  const mapped: StructuredLlmUsage = {};

  if (typeof usage.input_tokens === "number") {
    mapped.inputTokens = usage.input_tokens;
  }

  if (typeof usage.output_tokens === "number") {
    mapped.outputTokens = usage.output_tokens;
  }

  return mapped.inputTokens === undefined && mapped.outputTokens === undefined ? undefined : mapped;
};

const buildPrompt = <TOutput>(request: NormalizedStructuredLlmRequest<TOutput>): string =>
  request.turns.map((turn) => `[${turn.role}]\n${turn.content}`).join("\n\n");

const nowIso = (): string => new Date().toISOString();

const elapsedMs = (startedAt: number): number => Math.max(0, Date.now() - startedAt);

const processFailure = <TProviderOutput>(
  result: ProcessRunResult,
  startedAt: number,
): StructuredLlmProviderResult<TProviderOutput> => {
  const code = toProviderFailureCode(result.code);

  return failure(
    code,
    messageForFailureCode(code),
    result.retryable ?? code === "request_timeout",
    startedAt,
    {
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      signal: result.signal,
      stdoutBytes: result.stdoutBytes,
      stderrBytes: result.stderrBytes,
      ...(result.timedOut ? { timedOut: true } : {}),
      ...(result.stream ? { stream: result.stream } : {}),
    },
  );
};

const toProviderFailureCode = (code: ProcessRunResult["code"]): KnownLlmProviderErrorCode => {
  if (
    code === "request_timeout" ||
    code === "process_failed" ||
    code === "nonzero_exit" ||
    code === "output_too_large"
  ) {
    return code;
  }

  return "process_failed";
};

const messageForFailureCode = (code: KnownLlmProviderErrorCode): string => {
  switch (code) {
    case "request_timeout":
      return "Claude CLI request timed out.";
    case "nonzero_exit":
      return "Claude CLI exited with a non-zero status.";
    case "output_too_large":
      return "Claude CLI output exceeded the configured byte limit.";
    case "process_failed":
      return "Claude CLI process failed before returning structured output.";
    default:
      return "Claude CLI request failed.";
  }
};

const failure = <TProviderOutput>(
  code: KnownLlmProviderErrorCode,
  message: string,
  retryable: boolean,
  startedAt: number,
  details: Record<string, unknown> = {},
): StructuredLlmProviderResult<TProviderOutput> => ({
  status: "failed",
  provider: providerId,
  requestId: crypto.randomUUID(),
  code,
  message,
  retryable,
  durationMs: elapsedMs(startedAt),
  completedAt: nowIso(),
  details: {
    provider: providerId,
    ...details,
  },
});
