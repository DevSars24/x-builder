# Codex Adapter Tickets

These are local ticket specs produced by arch-recon. They are not Linear issues.

## Build Order

1. [CAD-001 - Provider-Neutral LLM Contract And Service Boundary](./CAD-001-provider-neutral-llm-contract-and-service-boundary.md)
2. [CAD-002 - Safe Process Execution Boundary](./CAD-002-safe-process-execution-boundary.md)
3. [CAD-003 - Codex CLI Provider Implementation](./CAD-003-codex-cli-provider-implementation.md)
4. [CAD-004 - Codex Readiness Probe Integration](./CAD-004-codex-readiness-probe-integration.md)
5. [CAD-005 - Backend Contract Integration Coverage](./CAD-005-backend-contract-integration-coverage.md)
6. [CAD-006 - E2E Shell Readiness Smoke](./CAD-006-e2e-shell-readiness-smoke.md)

## Notes

- The adapter is an engine-internal boundary, not a public raw LLM HTTP API.
- Day one provider is `codex exec`; future OpenAI-compatible providers should map behind the same internal contract.
- LLM judge UI, judge retry actions, and writer LLM generation wiring are explicitly out of scope for this feature slice.
- Day-one structured Codex output uses non-JSONL `codex exec --output-schema` and parses the final stdout JSON object. `codex exec --json` event-stream parsing is out of scope.
- Codex readiness does not read app settings in this slice. It reports provider availability only.
- Runtime Codex execution uses a fixed startup-resolved workspace root and a small environment allowlist; request payloads cannot choose cwd or env.
