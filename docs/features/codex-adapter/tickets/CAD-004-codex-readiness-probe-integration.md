# CAD-004: [FND] Codex Readiness Probe Integration

## Goal

Replace the placeholder Codex readiness state with a real cheap readiness probe that integrates into existing `/status` behavior without running a writer or judge prompt.

## Context

- The shell already displays Codex readiness through `appStatusSchema.codex`.
- Current default Codex readiness is `unconfigured`.
- `/status` must remain fast and safe.

## In Scope

- `CodexReadinessProbe`.
- Wiring the probe into `ReadinessDependencies.codex`.
- Safe readiness details in `SubsystemStatus.details`.
- Server tests for ready, unavailable, timeout, and no-leak behavior.

## Out Of Scope

- Full Codex judge execution.
- Any LLM prompt execution during `/status`.
- Settings UI changes.
- New provider secrets or model settings.
- OpenAI-compatible remote readiness.

## Requirements

- The readiness probe must run only a cheap command availability/version check.
- The probe must use `ProcessRunner`.
- The probe must fit within existing readiness timeout behavior.
- The probe must not load app settings in this slice.
- If the command is found and version check succeeds, Codex state is `ready`.
- If the command is missing or cannot start, Codex state is `unavailable`.
- If the probe times out, Codex state is `unavailable` and retryable.
- If deterministic and storage are ready while Codex is unavailable, app overall status is `partial`.
- `details` may include:
  - `adapter: "codex-cli"`
  - `command: "codex"`
  - `commandAvailable`
  - `version`
  - `sandbox: "read-only"`
  - `executionTimeoutMs`
- `details` must not include raw stderr, prompts, auth paths, home paths, or full command output.
- `autoJudgeEnabled` is intentionally excluded from Codex readiness details in this slice. The existing `runCodexJudgeAfterGeneration` setting remains settings-owned until LLM judge wiring consumes it.

## Integration Point

- Producer: `CodexReadinessProbe`.
- Upstream caller: `DefaultReadinessService`.
- User entry points:
  - app boot status check
  - Top Status Bar refresh
  - Settings Test readiness
- Terminal outcome: Codex status appears as ready or unavailable while deterministic scoring remains usable.

## Acceptance Criteria

- Given fake process runner reports a successful version command, when `GET /status` is called, then `codex.state` is `ready`.
- Given fake process runner reports command unavailable, then `codex.state` is `unavailable` and `overall` is `partial` when deterministic and storage are ready.
- Given the probe times out, then `codex.state` is `unavailable`, retryable is true, and `/status` still returns within the readiness timeout.
- Given app settings set `runCodexJudgeAfterGeneration`, then Codex readiness output is unchanged by that setting in this slice.
- Given process output contains a local path or stderr detail, then `/status` does not include that raw value.
- Given `/health` is called, then it remains liveness-only and does not include Codex details.

## Test Strategy

- Suite: engine Vitest with Fastify `app.inject`.
- Fixture strategy: fake `ProcessRunner` and existing readiness dependency injection patterns.
- Dependency category: in-process fakes; no real Codex CLI in default tests.
- Isolation: no developer-local config, no actual home directory paths.

## Dependencies

- CAD-002.
