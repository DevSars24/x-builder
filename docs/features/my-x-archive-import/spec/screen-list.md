# My X Archive Import Flow Spec - Screen List

Stage: product-flow-spec / Stage 1 EXTRACT

Status: draft for review

## Inputs

### Flow Map

- [Feature Inventory](../map/01-feature-inventory.md)
- [Flow Index](../map/02-flow-index.md)
- [Select And Validate X Archive](../map/02-flows/select-and-validate-x-archive.md)
- [Review Privacy And Import Preview](../map/02-flows/review-privacy-and-import-preview.md)
- [Run Import And Review Summary](../map/02-flows/run-import-and-review-summary.md)
- [Review Derived Profile, Voice, And Rotation Signals](../map/02-flows/review-derived-profile-voice-and-rotation-signals.md)
- [Repair Incomplete Or Duplicate Import](../map/02-flows/repair-incomplete-or-duplicate-import.md)
- [Flow Map Validation Report](../map/03-validation-report.md)

### Design System

- [UI Uplift Brief](../../../design-system/ui-uplift-brief.md)
- `client/src/ui/foundation.tsx`
- `client/src/shell/app-shell.tsx`
- `client/src/shell/route-registry.ts`

### Backend And Client Code

- `engine/src/server/server.ts`
- `engine/src/server/settings-repository.ts`
- `shared/src/schemas/shell.ts`
- `client/src/api/engine-api-client.ts`
- `client/src/shell/app-shell.tsx`
- `client/src/features/writer/writer-page.tsx`

## Flow-Map Context To Carry Forward

- V1 imports only an extracted `tweets.js` file. The user extracts the X archive outside the app.
- The engine owns deterministic parsing. The client should not execute archive JavaScript.
- Browser file inputs do not reliably provide a local path to the engine; spec assumes selected file contents are sent to the engine unless architecture chooses a path-entry boundary.
- LLM extraction, when used, runs only over reduced deterministic parser output, not raw archive files.
- No media, deleted tweets, DMs, contacts, device/security files, or folder/zip extraction in v1.
- Likes received are `favorite_count` inside `tweets.js`; `like.js` is deferred because it is usually posts the user liked.
- Replies/comments are high-value voice evidence. Standalone posts are useful for structure/cadence but may be generated or polished.
- The import should produce active Studio context after user confirmation: voice hints, niche/profile hints, weak metric baselines, timing windows, repeat history, and rotation memory.

## Screens Found

| # | Screen / Region | Type | Route | Referenced By | Priority |
|---|---|---|---|---|---|
| 1 | Post Library Archive Import Workspace | Page / workspace | `/library` | all archive flows | P0 |
| 2 | Tweets File Picker | Form region | within `/library` | select, repair | P0 |
| 3 | Archive Validation Preview | Panel / summary | within `/library` | select, privacy, repair | P0 |
| 4 | Import Boundary Review And Preview | Review step | within `/library` | privacy, repair | P0 |
| 5 | Import Progress And Summary | Progress + summary region | within `/library` | run, repair | P0 |
| 6 | Derived Insights And Studio Activation | Review + activation region | within `/library` | derived review, Studio handoff | P0 |
| 7 | Route Error Banner | Banner | route-local | repair | P1, reuse shell |
| 8 | Settings Route | Page | `/settings` | storage repair | P1, reuse shell |
| 9 | Studio Route | Page | `/writer` | active context consumer | P1, integration target |
| 10 | Voice Route | Page | `/voice` | future voice editor handoff | P2, referenced only |

## Deduplication Notes

- The first six screens/regions are owned by this feature.
- Route Error Banner and Settings Route should reuse shell-owned specs and components; this feature only specifies the import-specific recovery copy and return path.
- Studio Route is not re-specified here. This feature must define the active archive context badge/summary that Studio consumes.
- Voice Route remains a future handoff. Archive Import does not own the full voice editor.

## Backend Capabilities Discovered

### Existing API Endpoints

| Endpoint | Method | Current Status | Purpose | UI Implication |
|---|---|---|---|---|
| `/status` | GET | implemented | Runtime readiness | Import can reuse storage readiness and route repair patterns. |
| `/settings` | GET/PATCH | implemented | Local settings and storage path | Storage repair routes to Settings. |
| `/posts/analyze` | POST | implemented for Studio | Analyze a draft | Later must accept/use active archive context or server-side active context lookup. |
| `/drafts/judge` | POST | implemented for Studio | LLM judge | Later may use archive-derived voice/profile hints. |
| archive import endpoints | TBD | missing | Validate/import/activate `tweets.js` | Needed by this feature. |

### Existing Data Models

| Model | Key Fields | UI Implication |
|---|---|---|
| `AppStatus` | engine, deterministic, llm, storage | Import can show storage-blocked states. |
| `ApiError` | code, message, scope, retryable, fieldErrors | Import errors should use normalized route/field errors. |
| `AppSettings` | storagePath, accountProfile, judgeProvider, models | Storage repair and future profile handoff. |
| deterministic analysis schemas | context, repeatHistory, trailing metrics | Active archive context should feed existing analysis context rather than invent parallel scoring. |

### Needed Contracts

| Contract | Purpose | UI Implication |
|---|---|---|
| `archiveTweetsValidationRequest` | send selected file contents or file token/path | File picker and validation states. |
| `archiveTweetsValidationResult` | detected assignment, record count, usable fields, warnings | Validation Preview and Import Preview. |
| `archiveImportRequest` | selected file source, duplicate policy, activation intent | Import Progress. |
| `archiveImportRun` | id, status, counts, warnings, source hash/name | Summary, repair, provenance. |
| `archiveDerivedInsights` | voice hints, profile/niche hints, cadence, weak metric baselines, confidence | Derived Insights Review. |
| `activeArchiveContext` | active import id, fields enabled, confidence, createdAt | Studio integration badge and analysis context. |

## Coverage Check

### Screens That Need Backend Data Or Contracts

| Screen / Region | Backend Need | Current Gap |
|---|---|---|
| Tweets File Picker | validation endpoint or upload boundary | missing |
| Archive Validation Preview | file-shape scan result | missing |
| Import Boundary Review And Preview | duplicate detector, metric-field summary | missing |
| Import Progress And Summary | import run lifecycle and counts | missing |
| Derived Insights And Studio Activation | insight aggregation and active context persistence | missing |
| Studio Route | active context consumption | missing |

### Backend Capabilities With No UI Yet

| Capability | Should UI Own It In This Feature? | Notes |
|---|---|---|
| Folder/zip archive extraction | No | Explicitly out of v1. |
| `like.js` interest import | No | Deferred; do not confuse with received likes. |
| Media import | No | Out of v1. |
| Full voice profile editor | No | Belongs to `voice-profile`. |
| API impressions sync | No | Belongs to `my-x-api-sync`. |

## Recommended Spec Order

1. Post Library Archive Import Workspace.
2. Tweets File Picker.
3. Archive Validation Preview.
4. Import Boundary Review And Preview.
5. Import Progress And Summary.
6. Derived Insights And Studio Activation.

## Paths

- Design system: `docs/design-system/`, `client/src/ui/foundation.tsx`
- Component library: `client/src/ui/foundation.tsx`
- Product design outputs: `docs/design-system/ui-uplift-brief.md`
- Flow-map context: `docs/features/my-x-archive-import/map/`
- Backend codebase: `engine/src/server/`, `shared/src/schemas/`, `client/src/api/`

## Stage 1 Review Gate

P0 spec scope is the six Archive Import screens/regions. Shell recovery screens are referenced, not re-specified. Mockups are intentionally deferred until this screen structure is reviewed.
