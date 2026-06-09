# CAD-003: [FND] Codex CLI Provider Implementation

## Goal

Implement the day-one `codex-cli` provider that maps the provider-neutral LLM request to `codex exec`, enforces read-only execution, parses structured output, and returns normalized internal results.

## Context

- The provider is an implementation detail behind `StructuredLlmService`.
- Writer and judge code must not construct Codex CLI args directly.
- The exact Codex CLI output protocol should be isolated behind fixtures and parser tests.

## In Scope

- `CodexCliProvider`.
- `CodexCommandBuilder`.
- `CodexCliOutputParser`.
- Prompt/envelope builder for structured JSON output.
- Temporary JSON Schema file handling for `codex exec --output-schema`.
- Provider-level redaction and safe failure details.
- Fake-runner tests for success and failure paths.
- Small checked-in parser fixtures for final stdout JSON output.

## Out Of Scope

- Real `codex exec` integration in default test runs.
- LLM judge UI or judge endpoint.
- Writer LLM generation wiring.
- OpenAI SDK or remote provider support.
- User-editable Codex command settings.
- `codex exec --json` JSONL event-stream parsing.

## Requirements

- `CodexCliProvider` implements `LlmProvider`.
- `CodexCommandBuilder` constructs `codex exec` arguments in one place.
- Day-one execution uses non-JSONL `codex exec` output:
  - include `exec`
  - include `--ephemeral`
  - include `--sandbox read-only`
  - include `--cd <workspaceRoot>`
  - include `--output-schema <schemaFile>`
  - include `--color never`
  - read prompt from stdin using `-`
- Day-one supported output shape is a single final JSON object on stdout that conforms to the supplied output schema.
- The parser must not support JSONL event streams in this ticket.
- The parser must trim surrounding whitespace before JSON parsing.
- The parser must reject stdout that contains more than one JSON value or non-whitespace prose outside the JSON object.
- All execution uses read-only sandbox settings.
- Request payload must not choose cwd.
- The provider must pass only the CAD-002 environment allowlist to `ProcessRunner`.
- The provider must include structured output instructions derived from the caller's output contract.
- The parser must reject invalid JSON as `invalid_provider_response`.
- The provider must reject schema-invalid JSON as `structured_output_invalid`.
- Timeout, non-zero exit, process start failure, and output-too-large results must map to adapter failure codes.
- Failure messages returned to callers must not include raw stderr, home paths, auth file paths, prompt text, or stack traces.
- Safe details may include provider id, duration, exit code, signal, stdout byte count, stderr byte count, and parser failure category.

## Integration Point

- Producer: `CodexCliProvider`.
- Upstream caller: `StructuredLlmService`.
- Downstream dependency: `ProcessRunner`.
- User entry point: none in this ticket. Future writer/judge actions will call the service.
- Terminal outcome: typed structured success or safe adapter failure result.

## Acceptance Criteria

- Given a valid request and fake runner output containing valid structured JSON, when the provider runs, then it returns `status: "success"` with typed output.
- Given command construction runs for a structured request, then args include `exec`, `--ephemeral`, `--sandbox read-only`, `--cd <workspaceRoot>`, `--output-schema <schemaFile>`, `--color never`, and `-`.
- Given fake runner output containing invalid JSON, then the provider returns `invalid_provider_response`.
- Given fake runner stdout contains prose before or after a JSON object, then the provider returns `invalid_provider_response`.
- Given fake runner stdout contains JSONL events, then the provider returns `invalid_provider_response`.
- Given fake runner output containing JSON that fails the caller parser, then the provider returns `structured_output_invalid`.
- Given fake runner returns a timeout result, then the provider returns `request_timeout` and marks it retryable.
- Given fake runner returns non-zero exit, then the provider returns `nonzero_exit` without raw stderr in the public failure message.
- Given fake runner returns oversized output, then the provider returns `output_too_large`.
- Given request text includes shell metacharacters, then command and args remain separated and no shell command string is produced.

## Test Strategy

- Suite: engine Vitest unit tests.
- Fixture strategy:
  - fake `ProcessRunner` for provider behavior
  - small parser fixtures for valid final stdout JSON, invalid JSON, mixed prose plus JSON, and JSONL event stream rejection
  - inline Zod parser for typed output validation
- Dependency category: in-process fakes for default tests.
- Optional external smoke: real `codex exec` only behind an explicit environment flag in a later integration ticket.

## Dependencies

- CAD-001.
- CAD-002.
