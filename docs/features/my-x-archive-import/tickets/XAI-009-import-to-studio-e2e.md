---
status: todo
---

# XAI-009: [E2E] Verify import-to-Studio activation flow

## User Flows to Verify

- Given the app is running with empty local library data, When the user opens `/library`, selects a fixture `tweets.js`, validates, imports, reviews derived insights, activates context, and opens `/writer`, Then Studio shows active archive context.
- Given an active archive context, When the user scores a draft in Studio, Then the analysis request behavior reflects compact context use and does not include raw post history.
- Given an active context, When the user returns to Library and deactivates it, Then Studio no longer shows active archive context.
- Given validation returns partial warnings, When the user proceeds with import, Then partial import completes and warnings remain visible.

## Architectural Invariants

- The flow starts from `/library`, not settings or a hidden route.
- The UI never claims X API sync, OAuth, zip/folder import, media import, deleted tweet import, or real impression calibration is available in v1.
- The active context visible in Studio is the same context activated from Library.
- Long filenames and warning text do not overlap or hide primary actions.

## Modules Under Test

- App shell routing.
- Library route workflow.
- Engine API client boundary.
- Archive route fakes or local test engine.
- Writer route active context indicator.
- Studio analyze action.

## Pipeline Log

- 2026-06-16: Created from arch-recon synthesis.
