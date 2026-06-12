# Codex Adapter Tickets

These are local ticket specs produced by arch-recon. They are not Linear issues.

## Build Order

### Shipped (first slice: Codex CLI provider)

1. [CAD-001 - Provider-Neutral LLM Contract And Service Boundary](./CAD-001-provider-neutral-llm-contract-and-service-boundary.md)
2. [CAD-002 - Safe Process Execution Boundary](./CAD-002-safe-process-execution-boundary.md)
3. [CAD-003 - Codex CLI Provider Implementation](./CAD-003-codex-cli-provider-implementation.md)
4. [CAD-004 - Codex Readiness Probe Integration](./CAD-004-codex-readiness-probe-integration.md)
5. [CAD-005 - Backend Contract Integration Coverage](./CAD-005-backend-contract-integration-coverage.md)
6. [CAD-006 - E2E Shell Readiness Smoke](./CAD-006-e2e-shell-readiness-smoke.md)

### Extension (multi-provider: Claude Code CLI + Cursor CLI) — shipped

7. [CAD-007 - [FND] Judge Provider Selection Contract and Resolver](./CAD-007-judge-provider-selection-contract-and-resolver.md)
8. [CAD-008 - [FND] Provider-Neutral Readiness and Status Contract](./CAD-008-provider-neutral-readiness-and-status-contract.md)
9. [CAD-009 - [RFR] Relocate Provider Env Allowlists](./CAD-009-relocate-provider-env-allowlists.md)
10. [CAD-010 - Claude CLI Provider](./CAD-010-claude-cli-provider.md)
11. [CAD-011 - Cursor CLI Provider](./CAD-011-cursor-cli-provider.md)
12. [CAD-012 - Settings Judge Provider Selection](./CAD-012-settings-judge-provider-selection.md)
13. [CAD-013 - Provider-Neutral Judge Surface With Verdict Attribution](./CAD-013-provider-neutral-judge-surface-with-verdict-attribution.md)
14. [CAD-014 - [INT] Multi-Provider Backend Integration Coverage](./CAD-014-multi-provider-backend-integration-coverage.md)
15. [CAD-015 - [E2E] Provider Selection and Judge Flow](./CAD-015-provider-selection-and-judge-flow-e2e.md)
16. [CAD-016 - [DOC] Judge Provider Documentation](./CAD-016-judge-provider-documentation.md)

## User documentation

- [How to choose a judge provider](../../../how-to/choose-judge-provider.md)

## Notes

- The adapter is an engine-internal boundary, not a public raw LLM HTTP API.
- Three CLI providers map behind the same internal contract: `codex exec` (day one), Claude Code CLI (`claude -p`, native JSON-schema output), Cursor CLI (`cursor-agent -p`, prompt-envelope + lenient extraction).
- Provider selection is **settings-only** (`judgeProvider`, default `codex-cli`): request payloads cannot choose a provider, cwd, or env. Switching takes effect on the next judge call / status poll, no engine restart.
- Per-provider model selection is optional via `codexModel` / `claudeModel` / `cursorModel` (empty = the provider's default). Naming is per CLI: Codex uses the `gpt-5.x-codex` family (e.g. `gpt-5.2-codex`); Claude accepts the `haiku` / `sonnet` / `opus` aliases or full Anthropic ids; Cursor uses its own catalog (`cursor-agent --list-models`, e.g. `auto`, `gpt-5.3-codex`). Invalid model names are not validated in-app — the CLI rejects them at judge time.
- Readiness is **version-only** for all providers, uniformly: "ready" means the CLI binary is present and responsive within the 750ms probe budget — never auth state. Auth failures surface at judge time as retryable failures. Never invoke the Cursor auth/status subcommands in the readiness path (multi-second network round-trip).
- The status payload carries one selected-provider `llm` slot (renamed from `codex` in CAD-007+); `overall: partial` answers "can I use what I configured", not "are all three CLIs installed".
- Provider display labels have a single source: the shared `judgeProviderLabels` catalog. The engine and the client both consume it; neither declares its own label strings.
- Privacy/trust note: selecting Claude or Cursor sends judged drafts to those third-party services — the same trust class as Codex, chosen explicitly by the user's setting. `ANTHROPIC_API_KEY` / `CURSOR_API_KEY` pass through per-provider env allowlists.
- Retired in the extension: `codexCommandLabel` and `runCodexJudgeAfterGeneration` settings (dead fields, removed without successors); the dead `LlmProvider.checkReadiness` contract surface. Prior-epic docs mentioning them are historical records.
- Day-one structured Codex output uses non-JSONL `codex exec --output-schema` and parses the final stdout JSON object. `codex exec --json` event-stream parsing remains out of scope.
- Runtime CLI execution uses a fixed startup-resolved workspace root and small per-provider environment allowlists.
