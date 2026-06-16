# My X Archive Import Flow Map Validation Report

Date: 2026-06-16

Scope: 5 flows, 13 canonical screens/regions, 18 feature inventory items.

## Summary

- Features covered: 18/18 at breadboard level.
- Flows complete: 5/5.
- Screen naming issues: 0.
- Dead ends: 0 known.
- Orphan screens: 2 existing placeholders are intentional handoffs.
- Cross-flow issues: 4 open handoff/semantics decisions.
- Strategic coverage gaps: 7.
- Open questions: 14 total.

## Feature Coverage

### Covered

| Feature | Covered by Flow | Steps |
|---|---|---|
| Archive import entry | Select and Validate | Post Library entry and empty state |
| `tweets.js` file selection | Select and Validate | selected file picker |
| Archive file scan | Select and Validate | file-shape scan and validation |
| Required-file validation | Select and Validate, Repair | unsupported/malformed `tweets.js` recovery |
| File-only boundary notice | Privacy and Preview | folder/zip/media/deleted/private categories out of v1 |
| Metric-field preview | Privacy and Preview | favorites/retweets/timestamps available from `tweets.js` |
| Import preview | Privacy and Preview | counts, duplicates, metrics limits |
| Safe archive parser | Run Import | parse selected files as data |
| Normalized post library seed | Run Import | normalize and persist imported posts |
| Weak metric import | Run Import, Derived Review | favorites/retweets summary and limitation |
| LLM extraction handoff | Run Import, Derived Review | reduced deterministic output sent to LLM extraction when needed |
| Voice corpus seed | Derived Review | standalone vs reply/comment corpus summary |
| Timing/window seed | Derived Review | timestamps for cadence and future cooldown checks |
| Rotation baseline seed | Derived Review | cadence, repeat, topic/emotional angle candidates |
| Import summary | Run Import | imported/skipped/excluded/warning counts |
| Duplicate/re-run handling | Privacy and Preview, Repair | duplicate decision and merge/update path |
| Partial import repair | Repair | missing, malformed, storage, cancel, route error paths |
| Activate archive context in Studio | Derived Review | activate reviewed context for Studio |

### Not Covered Yet

| Feature | Status | Why Missing |
|---|---|---|
| Browse imported library as a long-term workspace | Important follow-up | Needs product-flow-spec or separate Post Library flow. |
| Full accept/edit generated voice profile | Deferred to `voice-profile` | Archive Import activates bounded context, but does not own full voice editor UX. |
| API metric sync and impressions | Separate feature | Belongs to `my-x-api-sync`. |

## Flow Completeness

| Flow | Entry Points | Happy Path | Decisions Complete | Errors Documented | Edge Cases |
|---|---|---|---|---|---|
| Select and validate X archive | Yes | Yes | Yes | Yes | Yes |
| Review privacy and import preview | Yes | Yes | Yes | Yes | Yes |
| Run import and review summary | Yes | Yes | Yes | Yes | Yes |
| Review derived profile, voice, and rotation signals | Yes | Yes | Yes | Yes | Yes |
| Repair incomplete or duplicate import | Yes | Yes | Yes | Yes | Yes |

## Screen Consistency

Canonical screen names are consistent across all flows:

- Post Library Archive Import Workspace
- Tweets File Picker
- Archive Validation Preview
- Import Boundary Review
- Import Preview
- Import Progress Panel
- Import Summary
- Imported Posts Review Table
- Derived Insights Review
- Route Error Banner
- Settings Route
- Voice Route
- Studio Route

## Dead Ends And Orphans

No mapped dead ends were found. Every failure state has a recovery route: choose a different file, acknowledge the file-only boundary, merge/update, retry, open Settings, cancel, or return to Library.

Existing intentional placeholders:

- `/voice` is referenced only as a future handoff for editable voice profile work.
- `/library` is currently a placeholder in code, but this feature owns replacing that placeholder with an import workspace.

## Cross-Flow Integrity

| From Flow | Exit Step | To Flow | Entry Point | Context Preserved? | Gap |
|---|---|---|---|---|---|
| Select and Validate | Validation passed | Privacy and Preview | Archive validated | Yes | Need manifest schema. |
| Privacy and Preview | Confirmed import | Run Import | Import confirmed | Yes | Need selected-source representation. |
| Run Import | Summary available | Derived Review | Import summary available | Yes | Need persisted import-run id. |
| Any flow | Failure/duplicate/cancel | Repair | Issue detected | Partial | Need error taxonomy and selected-file import transaction semantics. |
| Repair | Open Settings | Settings Route | Storage repair | Partial | Need return-to-Library context. |
| Derived Review | Open Voice | Voice Route | Future handoff | Partial | Voice route is placeholder today. |
| Derived Review | Activate context / Open Studio | Studio Route | Active context saved | Partial | Need Studio analysis request to consume archive context. |

## Strategic Coverage

### Metrics

| Metric | Flow Step / Event | Instrumentable? | Gap |
|---|---|---:|---|
| Archive selected | Select archive | Yes | Need source id/hash policy. |
| Archive validation success rate | Manifest scan | Yes | Need validation error taxonomy. |
| Boundary review completion | Import Boundary Review | Yes | Need boundary acknowledgement event decision. |
| Import completion rate | Import summary | Yes | Need import-run status. |
| Skipped/malformed record rate | Parse/normalize | Yes | Need skip reason enum. |
| Derived review engagement | Derived Insights Review | Yes | Need insight section ids. |
| Studio context activation | Derived Insights Review | Yes | Need active context id/source. |
| Later prediction lift | Not in archive flow | No | Requires feedback loop and API/manual outcomes. |

### IA / Content

| Need | Status | Gap |
|---|---|---|
| Post Library as source-material home | Covered | Route placeholder must be replaced. |
| Archive vs API metric boundary | Covered | Exact copy needs review. |
| File-only import boundary | Covered | Need final copy for extraction/manual file selection. |
| Derived outputs as draft/inferred | Covered | Need confidence labels and persistence behavior. |
| Voice/Studio handoffs | Partial | Consumers not implemented yet. |
| Studio context activation | Covered | Need shared context schema and Studio request integration. |

### Service Dependencies

| Dependency | Affected Flow | Visible Wait/Error State | Owner | Gap |
|---|---|---|---|---|
| Selected `tweets.js` transfer | Select and Validate | picker errors, scan progress | client/engine TBD | Browser file inputs do not provide stable engine-readable paths. |
| Safe archive parser | Select, Run | validation errors, parse warnings | archive import | Missing. |
| Storage/import persistence | Run, Repair | progress, storage error | engine/storage | Missing. |
| Duplicate detector | Privacy, Repair | duplicate decision | archive import | Missing. |
| Optional LLM extraction | Run, Derived Review | unavailable/inferred states | archive import + LLM | Missing. |
| Derived insight aggregator | Derived Review | unavailable/inferred states | archive import + future engines | Missing. |
| Active Studio context | Derived Review, Studio | activation confirmation, Studio labels | archive import + Studio | Missing. |
| Settings return path | Repair | Settings then Library | shell/settings | Needs route context support if not already general. |

### Accessibility-Critical Moments

| Flow / State | Risk | Later Test Needed | Gap |
|---|---|---|---|
| Tweets file picker/upload | Keyboard trap or unlabeled control | keyboard + SR | Spec must choose native-first pattern. |
| File/category tables | Poor navigation through dense data | semantic table/list tests | Need table component decision. |
| Boundary notice | Ambiguous copy could imply folder/zip/media import | label/help text review | Need exact copy. |
| Progress updates | Screen reader spam or silence | aria-live behavior | Need phase-level announcements. |
| Repair errors | Focus lost after retry/settings return | focus management | Need route return/focus spec. |

## Implementation Gaps

| Screen / Capability | In Flow Map | In Code | In Design System | Gap |
|---|---:|---:|---:|---|
| Post Library Archive Import Workspace | Yes | No, placeholder only | Partial patterns exist | Full route build needed. |
| Tweets File Picker | Yes | No | Input/Button exist; upload region TBD | Need accessible picker decision. |
| Archive Validation Preview | Yes | No | Badge/Alert/Table patterns partial | Need component spec. |
| Import Boundary Review | Yes | No | Alert/Badge patterns exist | Need boundary copy. |
| Import Progress Panel | Yes | No | Skeleton/Alert available; progress TBD | Need progress component behavior. |
| Import Summary | Yes | No | KeyValueList/Badge available | Need summary schema. |
| Imported Posts Review Table | Yes | No | DataTable not built | Need table/list component decision. |
| Derived Insights Review | Yes | No | Cards/panels possible | Need confidence/inferred labels. |
| Active Studio archive context | Yes | No | N/A | Need schema, persistence, and Studio request integration. |
| Safe archive parser | Yes | No | N/A | Need architecture and parser tests. |
| Optional LLM extraction over reduced data | Yes | No | N/A | Need architecture and prompt/output contract later. |
| Archive persistence | Yes | No | N/A | Need storage architecture. |

## Consolidated Open Questions

### Must answer before product-flow-spec

1. Should the client upload selected `tweets.js` contents to the engine, or should the user provide a local path for the engine to read?
2. What duplicate merge/update semantics should re-import use?
3. Which derived fields should become active Studio context in v1?
4. Which LLM-derived insights, if any, run during import vs after summary review?

### Should answer before building

5. Should unsupported folder/zip selections be detected in the UI or only through validation failure?
6. What final boundary labels should explain extraction, no media, no deleted tweets, and no private archive categories?
7. What confidence threshold is needed before showing voice/profile/rotation insights?
8. How should emotional angle labels be derived before a dedicated classifier exists?
9. Should active import block navigation or continue in background?
10. Should note tweets/community tweets/profile/graph files stay deferred entirely or become later separate file imports?

### Can answer during building

11. Exact copy for archive metric limitations.
12. Exact first table filters for imported posts.

## Recommended Next Actions

1. Decide selected-file transfer mechanics: upload file contents to engine vs user-provided local path.
2. Decide the minimal active Studio context shape for v1.
3. Run product-flow-spec for the five Archive Import flows, with special attention to file-only boundary, import summary, activation, and repair states.
4. Then run arch recon using the accepted flow spec to decide parser, schemas, storage, transaction, and route integration.
5. Keep `my-x-api-sync` out of this spec until Archive Import has its own accepted product shape.
