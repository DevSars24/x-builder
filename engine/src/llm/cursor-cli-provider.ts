import { baseProcessEnvAllowlist } from "./process-runner.js";
import type { ProcessRunner, ProcessRunResult } from "./process-runner.js";
import { buildStructuredPromptEnvelope } from "./structured-prompt-envelope.js";
import type {
  KnownLlmProviderErrorCode,
  LlmProvider,
  LlmProviderId,
  NormalizedStructuredLlmRequest,
  StructuredLlmProviderResult,
  StructuredLlmUsage,
} from "./structured-llm-service.js";

const providerId = "cursor-cli";

// The largest prompt envelope the cursor CLI can safely accept as an inline argv
// value. A request beyond this is rejected before any spawn rather than handed to
// a process that would hang on it.
const maxInlineRequestSize = 100_000;

// The cursor CLI run inherits the provider-agnostic base allowlist plus the one
// cursor-specific environment variable it needs at exec time. CURSOR_API_KEY is
// the optional key path; cursor's primary auth is its file-based ~/.cursor config.
// Composing from the base keeps the shared names in one place so they cannot drift.
export const cursorCliProcessEnvAllowlist = [...baseProcessEnvAllowlist, "CURSOR_API_KEY"] as const;

export type CursorCommandBuilderOptions = {
  workspaceRoot: string;
  prompt: string;
  model?: string;
};

export type CursorCliProviderOptions = {
  runner: ProcessRunner;
  workspaceRoot: string;
  commandBuilder?: CursorCommandBuilder;
};

export type CursorCliParserFailureCategory =
  | "empty_stdout"
  | "provider_reported_error"
  | "no_json_object";

export type CursorCliParseResult =
  | {
      status: "success";
      value: Record<string, unknown>;
      usage?: StructuredLlmUsage;
      rawText: string;
    }
  | {
      status: "failed";
      category: CursorCliParserFailureCategory;
    };

export class CursorCommandBuilder {
  build(options: CursorCommandBuilderOptions): readonly string[] {
    const args = [
      "-p",
      "--output-format",
      "json",
      "--mode",
      "ask",
      "--sandbox",
      "enabled",
      "--trust",
      "--workspace",
      options.workspaceRoot,
    ];

    // Only the active provider's configured model is appended; an empty or absent
    // model leaves the argv byte-identical to the base command. The model flag is
    // placed before the positional prompt so the envelope stays the final arg.
    if (options.model !== undefined && options.model.length > 0) {
      args.push("--model", options.model);
    }

    args.push(options.prompt);

    return args;
  }
}

export class CursorCliOutputParser {
  parse(stdout: string): CursorCliParseResult {
    const trimmed = stdout.trim();

    if (trimmed.length === 0) {
      return {
        status: "failed",
        category: "empty_stdout",
      };
    }

    const direct = tryParseJson(trimmed);

    if (direct !== undefined && isJsonObject(direct)) {
      // Tier 1: a parsed result envelope. A reported error short-circuits before
      // any extraction.
      if (looksLikeResultEnvelope(direct)) {
        if (direct.is_error === true || (hasSubtype(direct) && direct.subtype !== "success")) {
          return {
            status: "failed",
            category: "provider_reported_error",
          };
        }

        const extracted = extractEnvelopePayload(direct);

        if (extracted !== undefined) {
          const usage = extractUsage(direct);

          return {
            status: "success",
            value: extracted,
            ...(usage ? { usage } : {}),
            rawText: trimmed,
          };
        }

        return {
          status: "failed",
          category: "no_json_object",
        };
      }

      // Tier 2: the whole stdout parsed directly to a plain schema-shaped object
      // with no envelope wrapper — use it as-is.
      return {
        status: "success",
        value: direct,
        rawText: trimmed,
      };
    }

    // Tier 3: scan the stdout for the last balanced top-level JSON object.
    const scanned = scanLastBalancedJsonObject(trimmed);

    if (scanned !== undefined) {
      return {
        status: "success",
        value: scanned,
        rawText: trimmed,
      };
    }

    // Tier 4: no JSON object anywhere.
    return {
      status: "failed",
      category: "no_json_object",
    };
  }
}

export class CursorCliProvider<TProviderOutput = unknown> implements LlmProvider<TProviderOutput> {
  readonly id: LlmProviderId = providerId;

  private readonly runner: ProcessRunner;
  private readonly workspaceRoot: string;
  private readonly commandBuilder: CursorCommandBuilder;
  private readonly outputParser = new CursorCliOutputParser();

  constructor(options: CursorCliProviderOptions) {
    this.runner = options.runner;
    this.workspaceRoot = options.workspaceRoot;
    this.commandBuilder = options.commandBuilder ?? new CursorCommandBuilder();
  }

  async generateStructured<TOutput>(
    request: NormalizedStructuredLlmRequest<TOutput>,
  ): Promise<StructuredLlmProviderResult<TProviderOutput>> {
    const startedAt = Date.now();
    const prompt = buildStructuredPromptEnvelope(request);

    // Fail fast before spawning: a prompt envelope past the inline bound would hang
    // the cursor CLI, so it is rejected as unsafe.
    if (prompt.length > maxInlineRequestSize) {
      return failure(
        "unsafe_request",
        "Cursor CLI cannot accept a structured output request this large.",
        false,
        startedAt,
      );
    }

    try {
      const args = this.commandBuilder.build({
        workspaceRoot: this.workspaceRoot,
        prompt,
        model: request.options.model,
      });
      const result = await this.runner.run("cursor-agent", args, {
        cwd: this.workspaceRoot,
        timeoutMs: request.options.timeoutMs,
        maxStdoutBytes: request.options.outputByteLimit,
        maxStderrBytes: request.options.outputByteLimit,
        stdin: "",
        envAllowlist: [...cursorCliProcessEnvAllowlist],
      });

      if (result.status === "failed") {
        return processFailure(result, startedAt);
      }

      const parsed = this.outputParser.parse(result.stdout);

      if (parsed.status === "failed") {
        return failure(
          "invalid_provider_response",
          "Cursor CLI returned malformed structured output.",
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
          "Cursor CLI output did not match the requested structured output contract.",
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
        "Cursor CLI process failed before returning structured output.",
        false,
        startedAt,
      );
    }
  }
}

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const tryParseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const hasSubtype = (envelope: Record<string, unknown>): boolean =>
  "subtype" in envelope && envelope.subtype !== undefined && envelope.subtype !== null;

const envelopePayloadKeys = ["result", "text", "response", "content"] as const;

// A result envelope is recognizable by an error flag, a subtype, or one of the
// payload-carrying keys. A bare schema-shaped object carries none of these and
// flows to tier 2.
const looksLikeResultEnvelope = (envelope: Record<string, unknown>): boolean =>
  "is_error" in envelope ||
  "subtype" in envelope ||
  envelopePayloadKeys.some((key) => key in envelope);

const extractEnvelopePayload = (
  envelope: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  for (const key of envelopePayloadKeys) {
    if (!(key in envelope)) {
      continue;
    }

    const candidate = envelope[key];

    if (isJsonObject(candidate)) {
      return candidate;
    }

    if (typeof candidate === "string") {
      const parsed = parseStringPayload(candidate);

      return parsed !== undefined && isJsonObject(parsed) ? parsed : undefined;
    }
  }

  return undefined;
};

const parseStringPayload = (value: string): unknown => {
  const stripped = stripJsonFence(value.trim());

  return tryParseJson(stripped);
};

const stripJsonFence = (value: string): string => {
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/.exec(value);

  return fenced ? (fenced[1] as string).trim() : value;
};

// Scans the text for top-level balanced { ... } JSON spans (braces inside string
// literals are ignored), parses each, and returns the LAST one that is a plain
// object. Only the outermost objects are considered so a nested object is never
// mistaken for the top-level payload.
const scanLastBalancedJsonObject = (text: string): Record<string, unknown> | undefined => {
  let found: Record<string, unknown> | undefined;
  let depth = 0;
  let spanStart = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      if (depth === 0) {
        spanStart = index;
      }

      depth += 1;
    } else if (char === "}" && depth > 0) {
      depth -= 1;

      if (depth === 0 && spanStart >= 0) {
        const candidate = tryParseJson(text.slice(spanStart, index + 1));

        if (candidate !== undefined && isJsonObject(candidate)) {
          found = candidate;
        }

        spanStart = -1;
      }
    }
  }

  return found;
};

const extractUsage = (envelope: Record<string, unknown>): StructuredLlmUsage | undefined => {
  const usage = envelope.usage;

  if (!isJsonObject(usage)) {
    return undefined;
  }

  const mapped: StructuredLlmUsage = {};

  // Cursor reports usage in camelCase (unlike claude's snake_case).
  if (typeof usage.inputTokens === "number") {
    mapped.inputTokens = usage.inputTokens;
  }

  if (typeof usage.outputTokens === "number") {
    mapped.outputTokens = usage.outputTokens;
  }

  return mapped.inputTokens === undefined && mapped.outputTokens === undefined ? undefined : mapped;
};

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
      return "Cursor CLI request timed out.";
    case "nonzero_exit":
      return "Cursor CLI exited with a non-zero status.";
    case "output_too_large":
      return "Cursor CLI output exceeded the configured byte limit.";
    case "process_failed":
      return "Cursor CLI process failed before returning structured output.";
    default:
      return "Cursor CLI request failed.";
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
