---
status: todo
---

# CAD-012: Settings Judge Provider Selection

## Implementation Details

Ordering assumption: CAD-007 and CAD-008 have landed (`judgeProvider` exists in the settings schema; the dead fields are gone everywhere; the shared label catalog exists; `status.llm` / `judgeReady` are in place).

- `SelectSettingsFieldName` — `Extract<keyof AppSettings, "judgeProvider">`, the third field-name union alongside the existing text and switch unions.
- `renderSelectField` — settings-internal render helper mirroring `renderTextField`/`renderSwitch`: label association via the existing `fieldId` helper, a native `<select>`, options derived from the shared provider label catalog (closed provider-id enum → `{ value: id, label }`), helper line "Save, then run Test readiness to verify the provider.".
- `updateSelectField` — same shape as `updateSwitchField` (clears error/success/pending-navigation state).
- `settingsEqual` — add the `judgeProvider` comparison.
- `defaultSettings` — add `judgeProvider` with the shared schema's default.
- The settings route public driver gains `updateSelect(field, value)` mirroring `updateSwitch`.
- foundation.css: extend the settings text-input selector group (and its `:focus-visible` twin) with `select`. No new tokens, no new visual language, no component library additions — a native select is the same pattern as the existing native text/checkbox controls and keeps the SSR-string test harness working.

## Data Models

`AppSettings.judgeProvider` (owner CAD-007, consumed here); the shared provider label catalog (owner CAD-007; consumers: this select's options, CAD-013's attribution mapping, the engine registry). No status-shape consumption beyond what the existing selected-slot readiness items already do.

## Integration Point

- Producer: the shared settings schema + label catalog; the engine API client's existing `getSettings`/`saveSettings` (signatures unchanged).
- Consumer: the settings route form grid — field positioned after "Storage path", before the switches block.
- User entry: sidebar → Settings, or the status-bar "Open Settings" affordance.
- Terminal outcome: provider saved; the existing save → getStatus → publish chain updates the top status bar in the same interaction; selected-slot readiness badges refresh.

## Scope Boundaries / Out of Scope

Zero trace:
- No removal of the dead Codex-era fields anywhere — CAD-007 owns all traces; this ticket does not touch field removal.
- No per-provider readiness row, display, or "test connection" affordance — future scope, zero code. Selected-slot readiness items + Test readiness cover the need this epic.
- No status-bar, writer-surface, or judge-panel changes.
- No new shared schema definitions (consumed only); no provider config inputs (paths, flags, models); no auto-judge.

## Test Strategy & Fixture Ownership

- Client Vitest, SSR-string driver harness in the existing settings suite pattern: select renders the saved value; `updateSelect` dirties the model and gates Test readiness; save issues PATCH with `judgeProvider`; save failure preserves the draft selection. Fake api client fixtures shaped by the real shared schemas (in-process; engine = remote-owned via fakes).
- E2E (shell-recovery smoke spec, owned edits here, narrow): add the "Judge provider" field visibility assertion on the Settings page; the **negative jargon-regex assertion is retained unchanged** — "Judge provider", "Provider", and the catalog display names must not match it (asserted in AC). Dead-field expectation removals were CAD-007's, not here.
- Isolation: the existing Playwright engine route stubs; no real CLIs.

## Definition of Done

Select field saves via the existing PATCH flow; dirty guard covers it; the driver exposes `updateSelect`; select styling matches text inputs; unit + e2e additions green; typecheck/lint/test/test:e2e green; zero per-provider-readiness or field-removal code in the diff.

## Acceptance Criteria

- Given persisted settings with the default provider, When Settings loads, Then "Judge provider" renders with the default selected and one option per catalog entry, labeled from the shared catalog.
- Given the user picks a different provider, When they have not saved, Then "Unsaved changes" shows and Test readiness is disabled with the existing "Save settings before testing readiness." helper.
- Given a dirty provider change, When Save succeeds, Then the PATCH carries the new provider id, "Settings saved" shows, and the refreshed status is published (status bar reflects it without reload).
- Given save fails, When the error renders, Then the draft selection is preserved and "Retry save" re-issues it.
- Given a dirty provider change and an attempted navigation, When the unsaved-changes guard fires, Then Stay/Discard behave exactly as for existing fields.
- Given the Settings page with the selector and status bar rendered, When scanned for the banned-jargon regex, Then zero matches.

## Visual AC

- Select styled identically to text inputs: `--density-input-height`, `--space-3` padding-inline, `--border-width-thin` + `--border-default`, `--radius-md`, `--surface-panel`, `--text-primary`; focus ring `--focus-ring-width/-color/-offset`.
- Label: `--text-heading` + `--type-label`; helper: `--text-secondary` + `--type-caption` (existing helper class).
- States: ideal (saved value selected), dirty (existing warning "Unsaved changes" badge), loading (form `aria-busy`, existing), error (existing danger Alert + retry), hover/active per native select with the existing focus tokens. No new tokens.

## Edge Cases

- Persisted `judgeProvider` value not in the catalog: render it as a raw-id option so the saved value is never silently swapped (the schema enum makes this unreachable in practice — assert no crash).
- Rapid select-then-save: a single PATCH, the draft wins.
- Select changed then changed back to the saved value: dirty state clears via `settingsEqual`.

## Pipeline Log

- 2026-06-11 — Created by arch-recon (multi-provider epic extension; validated APPROVE_WITH_CONCERNS, cycle 2).
