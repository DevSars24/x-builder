# CAD-002: [FND] Safe Process Execution Boundary

## Goal

Create a safe local process execution boundary that Codex CLI can use without shell interpolation, unbounded output, or hanging requests.

## Context

- The Codex adapter must call `codex exec` day one.
- Process execution is security-sensitive and should be isolated from provider-specific prompt shaping.
- Tests must not rely on a real Codex install.

## In Scope

- `ProcessRunner` interface.
- Node process runner implementation.
- Process result and error metadata types.
- Timeout handling.
- stdout/stderr byte caps.
- Non-zero exit capture.
- Unit tests for safe execution behavior.

## Out Of Scope

- Codex-specific command construction.
- Prompt building.
- JSON parsing of model output.
- Readiness probe integration.
- Any public HTTP endpoint.

## Requirements

- `ProcessRunner.run(command, args, options)` accepts:
  - command string
  - readonly args array
  - cwd
  - timeoutMs
  - maxStdoutBytes
  - maxStderrBytes
  - env allowlist or explicit env object
- Runtime cwd must come from adapter runtime configuration, not from request payloads.
- The default runtime cwd is the startup-resolved workspace root. Resolve it once from the engine process start directory by walking upward to the nearest `.git` directory; fail readiness as unavailable if no workspace root can be resolved.
- Tests may inject a temp workspace root explicitly.
- The day-one environment allowlist is:
  - `PATH`
  - `HOME`
  - `CODEX_HOME`
  - `CODEX_SQLITE_HOME`
  - `CODEX_API_KEY`
  - `CODEX_ACCESS_TOKEN`
  - `CODEX_CA_CERTIFICATE`
  - `SSL_CERT_FILE`
  - `RUST_LOG`
  - `TMPDIR`
  - `TMP`
  - `TEMP`
- Do not pass `OPENAI_API_KEY`, cloud provider keys, arbitrary `*_TOKEN` variables, proxy variables, or the full `process.env` in this slice.
- The implementation must spawn processes with `shell: false`.
- The implementation must never accept a full shell command string with interpolated args.
- Timeout must terminate the process and return a timeout-shaped result.
- stdout and stderr must be capped independently.
- Oversized output must terminate the process and return an `output_too_large`-compatible result.
- Timeout and output-cap termination must not rely on cooperative child shutdown. If a child ignores `SIGTERM`, the runner must escalate termination, such as with `SIGKILL` after a short grace period, and settle the request within a bounded time.
- Non-zero exit must return exit code, signal, duration, and bounded output metadata.
- The runner must not redact on its own by guessing. It should return bounded process data to the provider, and the provider decides what is safe to expose.

## Integration Point

- Producer: `ProcessRunner`.
- Current consumer: process runner unit tests.
- Known downstream consumers: `CodexCliProvider` and `CodexReadinessProbe`.
- User entry point: none in this ticket. The public test surface is the runner interface.
- Terminal outcome: bounded process result for success, timeout, non-zero exit, or oversized output.

## Acceptance Criteria

- Given command and args, when the process starts, then it is launched without a shell.
- Given runtime cwd is provided, then the process runs in that cwd and request input cannot override it.
- Given environment variables outside the allowlist exist in the parent process, then they are not passed to the child process.
- Given a process exits with code `0`, then stdout, stderr, exit code, signal, duration, and byte counts are returned.
- Given a process exits non-zero, then the runner returns non-zero metadata without throwing for normal exit failure.
- Given a process exceeds timeout, then it is terminated and returns a timeout result.
- Given a process ignores timeout termination, then the runner escalates termination and still returns a timeout result within a bounded time.
- Given stdout exceeds its byte cap, then the process is terminated and returns an output-too-large result.
- Given stderr exceeds its byte cap, then the process is terminated and returns an output-too-large result.
- Given a process ignores output-cap termination, then the runner escalates termination and still returns an output-too-large result within a bounded time.
- Given an impossible command, then the runner returns a process-start failure shape without leaking stack traces.

## Test Strategy

- Suite: engine Vitest unit tests.
- Fixture strategy: tiny local Node fixtures or test-owned child commands that print, sleep, exit with controlled codes, and deliberately ignore `SIGTERM` for termination-hardening coverage.
- Dependency category: local-substitutable process fixtures.
- Isolation: no Codex CLI, no network, no shell-specific behavior required.

## Dependencies

- CAD-001 for shared adapter error code naming.
