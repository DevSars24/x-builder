---
status: todo
---

# CAD-013: Provider-Neutral Judge Surface With Verdict Attribution

## Implementation Details

Ordering assumption: CAD-008 has landed (`judgeReady` prop name, `status.llm`).

- `JudgePanel`: aria-label "Draft judge", h2 "Draft Judge", unavailable hint "The judge is unavailable right now. Check the provider in Settings.", failed-state button "Try judging again" (defensively exits the banned `/judge retry|retry judge/` regex family), and an attribution span in the ready-state verdict summary: "Judged by {provider label}".
- `JudgeState` ready variant gains `model: string`; `runJudgeDraft` stores the judge response's `model` (today it drops it — the model field never reaches the panel).
- `providerLabelFor(modelId)` — writer-page module helper reading the **shared static label catalog** from the shared package (the same constant CAD-012 consumes), with a raw-id fallback for ids outside the closed enum. No catalog-from-status threading, no new props from the app shell — the writer page's props are unchanged beyond what CAD-008 already renamed.
- `normalizeJudgeError` fallback message updated to the generalized copy, **byte-identical to the server's** `judgeFailedError` string ("The judge could not score this draft. Try again."). Copy-lag note: the server string was generalized in CAD-007; between CAD-007 and this ticket the stale client fallback only renders when the server error payload is unparseable — accepted, and closed here.
- New CSS class for the attribution caption: `--text-muted` + `--type-caption`, inline in the verdict summary row after the confidence span.

## Data Models

The judge response's `model` field (existing shared schema, provider id string) → `JudgeState.ready.model` → attribution. The shared provider label catalog (owner CAD-007).

## Integration Point

Producer: `runJudgeDraft`. Consumer: the `JudgePanel` verdict block. User entry: Studio → "Judge draft". Terminal outcome: a verdict that names its producer — "Judged by Claude judge" — which can legitimately differ from the currently selected provider after a settings change.

## Scope Boundaries / Out of Scope

Zero trace: no judge request/response schema changes; no per-verdict provider picker; no attribution on loading/failed states; no auto-judge; no settings or status-bar changes.

## Test Strategy & Fixture Ownership

- Client Vitest, SSR harness, judge suite: hint assertions updated (no longer contain "codex"); ready-state fixtures gain `model`; new attribution render test including the raw-id fallback for an unknown model id; failed-state button label test.
- Writer workflow tests: `runJudgeDraft` propagates the response `model` into `JudgeState.ready` (in-process pure functions).
- Fallback-copy test: an unparseable error → message equals the server's generalized string, asserted as byte equality against a single shared expectation (not a retyped literal) so drift fails loudly.
- **Stale-verdict edge is unit-level, not e2e**: render `JudgePanel` with a ready `JudgeState` whose `model` is provider A's id while `judgeReady` is false (the newly selected provider is unavailable) → attribution still names A. This proves attribution binds to the verdict's producer; it is not a CAD-015 flow (drafts do not survive route navigation, so the e2e variant is unconstructable by design).
- The foundation suite's test-internal "Repair local engine, Codex, and storage readiness." fixture copy is updated opportunistically here (it asserts no product code; the cleanup keeps repo-wide codex greps meaningful).
- E2E judge-flow spec updates owned here: region name → "Draft judge", attribution visible with the stubbed `model`, hint copy. (Status fixture key/label renames were already done by CAD-008.)
- Dependency categories: all in-process (the shared catalog is real code); e2e via the existing route stubs.

## Definition of Done

Neutral naming live on the writer surface; attribution renders from `JudgeState.model` via the shared catalog; the fallback copy is byte-identical to the server string; all listed unit/e2e updates green; typecheck/lint/test/test:e2e green.

## Acceptance Criteria

- Given a ready provider and a non-empty draft, When the user judges, Then the panel (region "Draft judge") renders the verdict, confidence, and "Judged by {label}" where the label maps from the response `model` via the shared catalog.
- Given a response `model` outside the catalog enum, When the verdict renders, Then the raw id renders as the attribution (no crash, no blank).
- Given the provider is not ready, When the panel renders, Then the button is disabled with the neutral hint and no "Codex" string appears anywhere on the writer surface.
- Given a ready verdict from provider A and a subsequent provider change reflected in the panel props, When the panel re-renders, Then the attribution still names A (unit-level, SSR harness).
- Given a judge failure with an unparseable error, When the fallback renders, Then its message is byte-identical to the server's generalized judge_failed copy.

## Visual AC

Attribution: `--text-muted` + `--type-caption`, inline in the verdict summary after the confidence span (`--space-2` flex gap, existing wrap). Hint: `--text-secondary` + `--type-body-small` (existing class). All other panel visuals untouched. States: idle / loading (Skeleton) / failed (danger Alert + "Try judging again") / ready (with attribution) / unready (hint). No new tokens.

## Edge Cases

Stale verdict attribution (unit-level, per AC). Empty strengths/improvements with the attribution present. A `model` string at the schema max length (120 chars) wraps without breaking the summary row (inherited flex-wrap).

## Pipeline Log

- 2026-06-11 — Created by arch-recon (multi-provider epic extension; validated APPROVE_WITH_CONCERNS, cycle 2).
