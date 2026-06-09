# CAD-006: [E2E] Shell Readiness Smoke

## Goal

Verify that Codex readiness appears in the shell without blocking the Writer route or implying that LLM judge UI is implemented.

## Context

- The user needs to know whether Codex is ready while deterministic work remains usable.
- This smoke test should cover shell behavior only.
- LLM judge UI belongs to the later `llm-judge` feature.

## In Scope

- App boot/status readiness smoke.
- Codex ready or unavailable status rendering.
- Writer route remains usable when Codex is unavailable.
- Settings/status refresh path if already supported by existing E2E harness.

## Out Of Scope

- Judge panel.
- Retry judge action.
- Writer LLM generation.
- Real `codex exec`.
- OpenAI-compatible provider behavior.

## Requirements

- E2E test uses controlled backend status or the repo-approved fake backend setup.
- The shell must show Codex ready or unavailable with visible text.
- Writer route must remain reachable when Codex is unavailable.
- The app must not show a global blocking failure when only Codex is unavailable.
- The test must not require a local Codex installation.

## Integration Point

- Producer: implemented shell + backend status contract.
- Upstream caller: browser E2E harness.
- User entry points:
  - app boot
  - Writer route load
  - status visibility
- Terminal outcome: user sees Codex readiness and can still use Writer when Codex is unavailable.

## Acceptance Criteria

- Given backend status reports Codex ready, when the app boots, then the Top Status Bar shows Codex ready text.
- Given backend status reports Codex unavailable and deterministic ready, when the app boots, then the app shows partial readiness and the Writer route remains usable.
- Given only Codex is unavailable, then the app does not show a route-level deterministic engine failure.
- Given the user opens Settings from status recovery, then Settings remains a settings/readiness surface and does not expose raw LLM execution controls.

## Test Strategy

- Suite: repo-approved E2E shell smoke suite.
- Fixture strategy: controlled backend status response or injected fake status service, following existing shell E2E conventions.
- Dependency category: local-substitutable backend; no real Codex CLI.
- Isolation: no developer-local config, no external network.

## Dependencies

- CAD-004.
- CAD-005.
