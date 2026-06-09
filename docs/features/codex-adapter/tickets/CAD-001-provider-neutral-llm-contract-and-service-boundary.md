# CAD-001: [FND] Provider-Neutral LLM Contract And Service Boundary

## Goal

Create an engine-local LLM service boundary that writer and judge features can consume later without depending on Codex CLI or OpenAI-compatible protocol shapes.

## Context

- Day one provider is `codex exec`.
- Future providers may map to OpenAI Responses, OpenAI-compatible Chat Completions, OpenRouter, Gemini, Groq, Nvidia, Ollama, or other adapters.
- The internal contract should be task-oriented: purpose, instructions, input turns, structured output contract, execution options, and metadata.
- This ticket creates the boundary and test harness only. It does not call Codex.

## In Scope

- Engine-local LLM provider and service types.
- Engine-local Zod schemas or validators for request/result shapes.
- `StructuredLlmService` that validates requests, selects a registered provider, applies bounded retry rules, and returns a discriminated result.
- `LlmProvider` interface with readiness and structured generation methods.
- Fake-provider tests that prove the service is usable without a real process or network call.

## Out Of Scope

- Public HTTP endpoint for raw LLM execution.
- OpenAI SDK or API key handling.
- Codex process execution.
- LLM judge result schema.
- Writer or judge feature wiring.
- Provider settings UI.

## Requirements

- Define provider id support for day one as `codex-cli`.
- Define purpose values for known future consumers:
  - `writer_first_pass`
  - `writer_variants`
  - `candidate_judge`
- Define input turns with `system`, `user`, and `assistant` roles.
- Define a structured output contract with:
  - `name`
  - JSON Schema object
  - `strict`, defaulting to true
  - runtime parser function for the actual typed result
- Define execution options with bounded defaults:
  - timeout default `60000`, max `180000`
  - output byte cap default `500000`, hard max `2000000`
  - attempts default `1`, max `2`
- Define result as a discriminated union:
  - `status: "success"` with typed output, provider, request id, duration, completion time, optional usage, and optional raw text
  - `status: "failed"` with provider, request id, error code, safe message, retryable flag, duration, completion time, and bounded safe details
- Expected adapter error codes:
  - `provider_unavailable`
  - `provider_unconfigured`
  - `request_timeout`
  - `process_failed`
  - `nonzero_exit`
  - `output_too_large`
  - `invalid_provider_response`
  - `structured_output_invalid`
  - `unsafe_request`
- `StructuredLlmService` must not throw for expected provider failures.
- `StructuredLlmService` must not log prompts, full input text, raw stdout, or raw stderr.

## Integration Point

- Producer: `StructuredLlmService`.
- Current consumer: test fakes only.
- Known future consumers: writer logic service and LLM judge service.
- User entry point: none in this ticket. The public test surface is the service contract itself.
- Terminal outcome: a validated success or failed result from a fake provider.

## Acceptance Criteria

- Given a valid request and fake successful provider, when `generateStructured` runs, then it returns `status: "success"` with typed output.
- Given a provider returns a retryable failure and attempts are set to `2`, then the service retries at most once.
- Given a provider returns schema-invalid structured output, then the service returns `structured_output_invalid` and does not retry.
- Given an unsupported provider id, then the service returns `provider_unconfigured`.
- Given an oversized or invalid request, then the service returns `unsafe_request` before calling a provider.
- Given any expected provider failure, then the service resolves to `status: "failed"` rather than throwing.

## Test Strategy

- Suite: engine Vitest unit tests.
- Fixture strategy: inline small fake provider results and small Zod parser fixtures.
- Dependency category: in-process fakes only.
- Isolation: no child process, no network, no developer-local Codex config.

## Dependencies

- Existing engine TypeScript test harness.

