# My X Archive Import Flow Map - Feature Inventory

Product: X Builder

Stage: product-flow-map / Stage 1 DISCOVER

Status: draft for review

Scan scope:

- `docs/what-we-are-building.md`
- `docs/engine-knowledge-base.md`
- `docs/features/my-x-archive-import/README.md`
- `docs/features/my-x-api-sync/README.md`
- `docs/features/my-x-data-import/README.md`
- `docs/features/post-library-manual-import/README.md`
- `docs/features/voice-profile/README.md`
- `docs/features/my-feedback-loop/README.md`
- `docs/design-system/ui-uplift-brief.md`
- `client/src/shell/route-registry.ts`
- `client/src/shell/app-shell.tsx`
- `shared/src/schemas/shell.ts`
- Local archive sample: `twitter-2026-05-26-673f398a178afcc60086123bc1547110cc50c67e4141a70a22418c83105490d2`
- User decision: v1 imports the extracted `tweets.js` file only; the user handles archive extraction outside the app.

## Problem Frame

- Problem statement: X Builder needs a free, local way to learn from the user's own historical X archive before paid API sync exists, so future voice, profile, cadence, and prediction features have real account history instead of generic assumptions.
- Primary audience: a founder/operator using the local app to improve X posts from their own archive and later sync.
- Success metrics:
  - User can select an extracted `tweets.js` file and see whether it is usable.
  - User can import posts and replies/comments without importing private archive categories.
  - User can review what was imported, skipped, and derived before outputs affect generation.
  - User can build and activate a voice/profile/rotation baseline from archive data while seeing metric limitations clearly.
  - Re-running the same archive does not duplicate posts.
- Guardrails:
  - Do not import DMs, contacts, device tokens, IP audit, account-security files, media files, or deleted tweets in v1.
  - Do not claim archive data contains impressions when only favorites/retweets are present.
  - Do not claim true X account health or ranking eligibility.
  - Do not auto-personalize the open-source engine around one account.
  - Do not call X API, OAuth, scraping, or browser automation from this feature.
- Constraints:
  - Current app routes are Studio, Voice, Post Library, and Settings.
  - Post Library is currently a placeholder, but it is the right home for source material.
  - Settings and storage persistence exist today; archive import persistence is not yet modeled.
  - The archive uses `window.YTD.*` JavaScript assignment files that must be parsed safely without executing them.
  - The inspected `tweets.js` contains posts/replies, timestamps, favorite counts, and retweet counts, but no normal post impressions.
- Decision principles:
  - Local first: archive import should work without X API credentials or paid usage.
  - Review before activate: derived voice/profile/rotation outputs should be visible before they become active Studio context.
  - Preserve provenance: imported and derived data should remember which archive file and import run produced it.
  - Be honest about evidence: distinguish measured archive fields, absent metrics, and inferred signals.

## Personas

### Founder Writer

- Role: author using the app to improve posts and preserve personal voice.
- Goal: turn historical X activity into a better local writing baseline.
- Context: local desktop workflow, repeated use, may not know archive file structure.
- Source: `docs/what-we-are-building.md`, feature README.
- Confidence: high.

### Privacy-Conscious Local Operator

- Role: same user, but focused on avoiding accidental import of sensitive archive files.
- Goal: understand exactly which files are read and what is excluded.
- Context: X archive contains many categories beyond posts.
- Source: archive inspection, feature README non-goals.
- Confidence: high.

### Future Feedback Loop Operator

- Role: user after publishing posts and syncing or entering outcomes.
- Goal: compare historic and future performance to improve recommendations.
- Context: archive import seeds weak baselines; API sync later fills real metrics.
- Source: `docs/features/my-feedback-loop/README.md`, `docs/what-we-are-building.md`.
- Confidence: medium.

### Archive Import Implementer

- Role: developer implementing parsers, schemas, persistence, and UI states.
- Goal: convert the archive `tweets.js` file into stable app-owned records without leaking private data.
- Context: next product-flow-spec and architecture phase.
- Source: feature README, current shared/client routes.
- Confidence: high.

## JTBD Mapping

| JTBD Step | What the user does | Archive feature coverage |
|---|---|---|
| Define | Decide to seed X Builder from an X archive instead of manual examples | Post Library archive import entry, scope explanation |
| Locate | Find extracted `tweets.js` | File picker, file-shape validation |
| Prepare | Review import preview | Detected fields, duplicate check, metric limitations |
| Confirm | Verify records, exclusions, limitations, and storage readiness | Import preview, metrics boundary notice, storage status |
| Execute | Run deterministic import and normalization | Import progress, parsing, extraction, persistence |
| Monitor | Watch progress and warnings | Progress panel, skipped records, malformed files |
| Modify | Adjust exclusions, retry, re-run, or replace previous import | Repair flow, duplicate/merge decisions |
| Conclude | Review summary and activate outputs for Studio | Import summary, derived outputs review, active Studio context CTA |

## IA / Content / Service Notes

### Information Architecture

| Section / Screen | Parent | Primary Nav? | Label Risk | Notes |
|---|---|---|---|---|
| Post Library Archive Import Workspace | App Shell / Post Library | Yes | Low | Source material belongs in Library, not Studio. |
| Archive Validation Preview | Post Library Archive Import Workspace | No | Low | Shows selected file shape and usable fields before import. |
| Import Boundary Review | Post Library Archive Import Workspace | No | Medium | Explains that v1 reads only `tweets.js` and ignores archive extraction/media/deleted files. |
| Import Progress Panel | Post Library Archive Import Workspace | No | Low | Long-running parse/persist process. |
| Import Summary | Post Library Archive Import Workspace | No | Low | Main success endpoint for v1. |
| Derived Insights Review | Post Library Archive Import Workspace | No | Medium | Must label outputs as draft/inferred until later accepted by consumer features. |
| Voice Route | App Shell / Voice | Yes | Low | Future handoff for editable voice profile. |
| Studio Route | App Shell / Studio | Yes | Low | Future handoff for using history in scoring/generation. |
| Settings Route | App Shell / Settings | Yes | Low | Recovery if storage/readiness blocks import. |

### Content Model

| Content Type | Key Fields | Owner | Appears In | Gaps |
|---|---|---|---|---|
| Archive import run | id, source file name, started/completed time, version, status, warnings | Archive import | progress, summary | No schema yet. |
| Archive file manifest | file name, size, detected global name, record count, usable field list | Archive import | validation, boundary review | Need file-shape taxonomy. |
| Imported post | post id, text, created at, type, reply refs, entities, link flags, source file, raw metric fields | Archive import | library, voice, feedback loop | No app schema yet. |
| Archive metric snapshot | post id, favorite count, retweet count, source, captured at/imported at | Archive import | summary, feedback loop | Impressions absent in archive sample. |
| Voice corpus | selected post/reply ids, text samples, reply/original split, confidence | Voice profile | derived insights, Voice route | Extraction belongs to later flow/spec. |
| Rotation baseline | recent topics, formats, emotional angles, cadence, repeat windows | Deterministic engine | derived insights, Studio later | Format/emotion classifiers need arch recon later. |
| Active Studio archive context | import run id, voice hints, niche/profile hints, recent post windows, weak metric percentiles, repeat history | Archive import + Studio | Studio analysis requests | Need shared context schema. |

### Service Dependencies

| User Step | Visible System Response | Backstage Process | Owner | Risk |
|---|---|---|---|---|
| Select file | `tweets.js` file name appears, validation starts | Client passes selected file to engine boundary | client/engine boundary TBD | Browser file inputs do not provide stable engine-readable paths. |
| Validate file | Required assignment shape and usable fields | Safe parse of `window.YTD.*` assignment header | archive parser | Must not execute archive JS. |
| Review boundary | File-only import explanation and metric limitations | Preview aggregator | archive parser/UI | User must understand extraction is manual. |
| Run import | Progress, warnings, cancel state | Deterministic parse, normalize, dedupe, persist, then optional LLM extraction over reduced data | archive import/storage | Large files and malformed records. |
| Review summary | Counts, limitations, derived draft outputs | Aggregation and weak metric derivation | archive import | User may overtrust partial metrics. |
| Activate Studio context | CTA marks reviewed archive outputs as active context | Studio analysis context | archive import + Studio | Requires Studio integration in this feature or immediate follow-up. |

### Accessibility-Critical Moments

| Flow / State | Risk | Later Test Needed | Notes |
|---|---|---|---|
| File picker | Custom upload control can be keyboard-inaccessible | keyboard + screen reader | Use native file input path or accessible wrapper. |
| Validation results | Large file preview can be hard to scan | table/list semantics + headings | Group by required shape, usable fields, and unavailable metrics. |
| Boundary explanation | User may expect the full archive to be extracted automatically | labels + descriptions | Explain user extracts archive, app reads `tweets.js`. |
| Import progress | Long task can leave screen reader users without feedback | aria-live progress | Announce major phases, not every record. |
| Import summary | Counts and warnings can be color-only | text labels | Include explicit found/missing/imported/skipped states. |

## Feature Inventory

| # | Feature | Description | Persona | JTBD Step | Status | Priority | Source |
|---|---|---|---|---|---|---|---|
| 1 | Archive import entry | Add a Post Library entry point for importing an X archive. | Founder Writer | Define | Gap | P0 | route registry, feature README |
| 2 | `tweets.js` file selection | Let the user select an extracted `tweets.js` file. | Founder Writer | Locate | Gap | P0 | user decision |
| 3 | Archive file scan | Detect record count, assignment shape, and usable fields from the selected file. | Archive Import Implementer | Locate | Gap | P0 | archive sample |
| 4 | Required-file validation | Confirm selected file is a parseable `tweets.js` export and explain what can/cannot be derived. | Founder Writer | Confirm | Gap | P0 | archive sample |
| 5 | File-only boundary notice | Explain that archive extraction, folders, zips, media, deleted tweets, and private categories are out of v1. | Privacy-Conscious Local Operator | Prepare | Gap | P0 | user decision |
| 6 | Metric-field preview | Show favorite/retweet counts and timestamps available from `tweets.js`. | Founder Writer | Confirm | Gap | P0 | user decision |
| 7 | Import preview | Show post/reply counts, duplicates, and metric limitations before import. | Founder Writer | Confirm | Gap | P0 | archive sample |
| 8 | Safe archive parser | Parse archive JavaScript assignment files as data without executing them. | Archive Import Implementer | Execute | Gap | P0 | archive sample |
| 9 | Normalized post library seed | Persist posts/replies and provenance into local app-owned records. | Founder Writer | Execute | Gap | P0 | product loop |
| 10 | Weak metric import | Store favorites/retweets from archive as partial historical metrics. | Future Feedback Loop Operator | Execute | Gap | P0 | archive sample |
| 11 | LLM extraction handoff | Run LLM extraction over deterministic parser output, not raw archive data. | Founder Writer | Execute | Gap | P1 | user decision |
| 12 | Voice corpus seed | Split standalone posts and replies/comments, prioritizing replies/comments for voice extraction. | Founder Writer | Conclude | Gap | P0 | user decision |
| 13 | Timing/window seed | Use `created_at` history for cadence, windows, and future repeat/cooldown checks. | Future Feedback Loop Operator | Conclude | Gap | P0 | user decision |
| 14 | Rotation baseline seed | Derive cadence, format/topic repetition, and emotional angle candidates for later scoring. | Future Feedback Loop Operator | Conclude | Gap | P1 | engine knowledge base |
| 15 | Import summary | Show imported/skipped/excluded counts and confidence/limitations. | Founder Writer | Conclude | Gap | P0 | feature README |
| 16 | Duplicate/re-run handling | Re-running the same archive updates existing records without duplication. | Founder Writer | Modify | Gap | P0 | feature README |
| 17 | Partial import repair | Recover from missing files, malformed files, storage errors, or cancelled import. | Founder Writer | Modify | Gap | P0 | storage/settings patterns |
| 18 | Activate archive context in Studio | Let the user confirm that reviewed archive-derived context should influence Studio analysis. | Founder Writer | Conclude | Gap | P0 | user discussion |

## Gaps Identified

### Missing from implementation

- Post Library route is a placeholder, so no archive import workspace exists.
- No shared schemas for archive file scans, import runs, imported posts, voice corpus seeds, timing windows, or archive metric snapshots.
- No archive parser or safe `window.YTD.*` parser exists.
- No storage model for imported posts or import provenance exists.
- No UI for file-only import boundary or metric limitation preview exists.
- No handoff model exists for derived voice/profile/rotation outputs or active Studio context.

### Underspecified

- Whether the client uploads selected file contents to the engine or collects a user-entered local path for the engine to read.
- Whether note tweets/community tweets/profile/graph files are deferred entirely or added in a later importer.
- Which minimum derived fields should become active Studio context in v1.

### Risky if skipped

- If the UI implies folder/zip import, users will expect extraction the app does not own in v1.
- If archive favorites/retweets are presented like full analytics, predictions will look more certain than they are.
- If provenance is not stored, Studio cannot explain which archive import influenced a recommendation.
- If duplicate handling is not defined, re-imports will corrupt cadence and repeat-history calculations.
- If the parser executes archive JS, the import path creates an unnecessary local security risk.

## Recommended Flow List

### Critical - map first

1. Select and validate `tweets.js` - entry, file selection, file-shape scan, required-field validation.
2. Review import preview and metric limits - duplicate and metrics boundary review.
3. Run deterministic import and review summary - parse, normalize, persist, show imported/skipped counts.
4. Review and activate derived voice and rotation signals - inspect draft outputs before enabling them in Studio.
5. Repair incomplete or duplicate import - recover from missing files, malformed files, storage failure, cancellation, and re-run.

### Important - map second

6. Browse imported post library - filter original posts/replies/link posts and inspect source provenance.
7. Select examples for voice extraction - may belong to `voice-profile` flow spec after archive import.
8. Compare archive import with later API sync - belongs to `my-x-api-sync`.

### Deferred

9. Full voice profile extraction and editing.
10. X API metric backfill or daily sync.
11. External account import.
12. True account-health or ranking eligibility diagnosis.

## Open Questions

1. Should the client upload selected `tweets.js` contents to the engine, or should the user paste/type a local path for the engine to read?
2. Should note tweets or community tweets be deferred entirely, or added as separate file imports after `tweets.js`?
3. Which derived fields should be activated in Studio v1: voice hints, niche/profile hints, repeat history, weak metric percentiles, emotional angle rotation?
4. How should emotional angle and format rotation be derived before a dedicated classifier exists?
5. What is the minimum archive history required before the app should offer and activate voice/profile insights?

## Review Gate

Recommended Stage 2 flow-map scope:

1. Select and validate `tweets.js`.
2. Review import preview and metric limits.
3. Run deterministic import and review summary.
4. Review and activate derived voice and rotation signals.
5. Repair incomplete or duplicate import.

These are enough to feed product-flow-spec for Archive Import. X API Sync remains a separate feature and should not enter this flow spec.
