# CAD-005: [INT] Backend Contract Integration Coverage

## Goal

Verify the Codex adapter boundary integrates with existing backend contracts without breaking shell readiness, settings, health, or normalized error behavior.

## Context

- The adapter should deepen the existing `codex` readiness subsystem, not create a second status model.
- The feature must preserve no-leak error behavior and local-only API assumptions.

## In Scope

- Integration coverage for `/health`.
- Integration coverage for `/status`.
- Integration coverage for `/settings`.
- Readiness details shape and boundedness.
- No-leak assertions for Codex readiness failures.
- Schema parsing of all relevant responses.

## Out Of Scope

- Real `codex exec` in default tests.
- LLM judge panel tests.
- Writer LLM generation tests.
- OpenAI-compatible remote provider tests.

## Requirements

- `/health` still returns only `{ ok: true }`.
- `/status` responses parse with `appStatusSchema`.
- `/settings` responses parse with `appSettingsResponseSchema`.
- Codex ready and unavailable states preserve existing overall aggregation rules.
- Codex readiness details do not include `autoJudgeEnabled` in this slice.
- Codex failures do not expose raw stderr, stack traces, full home paths, auth file paths, prompt text, or raw model output.
- Existing deterministic and storage readiness behavior remains covered.

## Integration Point

- Producer: backend server contract.
- Upstream caller: `EngineApiClient` and shell status/settings routes.
- User entry points:
  - app boot
  - status refresh
  - settings load
  - settings readiness test
- Terminal outcome: shell can consume status/settings safely with Codex readiness included.

## Acceptance Criteria

- Given the server is built with fake ready Codex process behavior, when `GET /status` is called, then the response parses and includes bounded Codex ready details.
- Given fake Codex process behavior fails with sensitive stderr, when `GET /status` is called, then the response parses, marks Codex unavailable, and does not include sensitive text.
- Given Codex is unavailable but deterministic and storage are ready, then `overall` is `partial`.
- Given settings include `runCodexJudgeAfterGeneration`, then `/status` still reports only provider readiness and does not include `autoJudgeEnabled`.
- Given `/health` is called, then it does not include readiness details.
- Given `/settings` is called, then existing settings response shape remains unchanged.

## Test Strategy

- Suite: engine Vitest integration tests with Fastify `app.inject`.
- Fixture strategy: fake process runner/readiness probe states and existing settings repository fakes.
- Dependency category: in-process fakes.
- Isolation: no real Codex CLI, no network, no developer-local config.

## Dependencies

- CAD-001.
- CAD-002.
- CAD-003.
- CAD-004.
