---
status: todo
---

# XAI-006: Build Library archive import workflow

## Implementation Details

Replace the `/library` placeholder with the route-owned archive import workflow. Use route-local reducer state for selected file, validation result, boundary review, duplicate decision, import progress, summary, derived insights, active context, errors, retries, and focus targets.

The user flow is: select extracted `tweets.js`, validate, review boundaries and unavailable metrics, confirm merge policy, import, review summary and derived insights, then activate or deactivate Studio context.

## Data Models

Client state should mirror shared response contracts rather than inventing separate API shapes:

- `LibraryRouteState`
- `FilePickerState`
- `ArchiveValidationStepState`
- `ArchiveImportStepState`
- `DerivedInsightsStepState`
- `ActiveContextStepState`

## Integration Point

The user reaches this feature through the existing `/library` navigation item. The workflow calls `EngineApiClient` archive methods and links to `/writer` after activation.

## Scope Boundaries / Out of Scope

May add Library route components, reducer, public test driver, styling using existing tokens, and API method usage. Must not add backend routes, parser logic, Studio merge logic, X API sync, OAuth, folder/zip picker, media preview, deleted tweet import, or private-message import.

## Test Strategy & Fixture Ownership

Client component and reducer tests own route state transitions. Use existing client testing style and public drivers. Dependency category: in-process component tests with fake `EngineApiClient`.

## Definition of Done

- `/library` no longer renders placeholder copy.
- Native file input accepts `.js` and keeps filename visible through errors.
- Validation, boundary review, import summary, derived insights, activate, and deactivate states render.
- Partial success is supported without losing imported posts.
- Warnings are text-labeled and accessible.

## Acceptance Criteria

- Given no imports, When the user opens `/library`, Then the empty import workspace is shown.
- Given a selected `tweets.js`, When validation succeeds, Then boundary review shows counts, unavailable metrics, and duplicate summary.
- Given duplicate records, When the user confirms merge policy, Then import can proceed.
- Given import success, When derived insights load, Then the user can activate Studio context.
- Given active context, When the user deactivates it, Then Studio handoff is removed.

## Visual AC

Use existing shell and UI tokens. Keep the workflow dense and operational, not a landing page. Use native file input, buttons for commands, badges for status, alerts for warnings/errors, fieldset/radio for duplicate policy, and compact list preview rather than a heavy table in v1.

All async transitions should move focus to the next section heading and use polite live regions for validation/import/activation status.

## Edge Cases

- Wrong file selected.
- Validation partial with skipped records.
- Import route fails after validation succeeds.
- Existing active context while a new import is running.
- Long file names and source ids on narrow screens.

## Pipeline Log

- 2026-06-16: Created from arch-recon synthesis.
