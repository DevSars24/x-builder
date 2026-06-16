---
status: todo
---

# XAI-008: [INT] Cover archive import and Studio context integration

## User Flows to Verify

- Given valid `tweets.js` contents, When validation and import run through the engine API, Then canonical posts, import run, and derived preview persist.
- Given an imported archive, When context is activated, Then active context is returned by lookup and can be merged into Studio analysis.
- Given active archive weak metrics, When analysis runs, Then no fabricated impression baseline is present.
- Given duplicate imported posts, When import runs again, Then posts are merged without duplication.
- Given malformed archive content, When validation runs, Then no posts persist and a safe invalid response is returned.

## Architectural Invariants

- Archive parsing never executes JavaScript.
- Raw archive contents are not persisted.
- Studio analysis consumes compact active context only.
- Future sync remains possible because canonical posts are keyed by platform and platform post id, not archive file row position.
- Archive favorites/retweets never populate `trailingMedianImpressions`.

## Modules Under Test

- Shared archive schemas.
- `TweetsJsParser`.
- `ArchiveTweetNormalizer`.
- `PostLibraryRepository`.
- `ArchiveImportService`.
- `ArchiveDerivedInsightsService`.
- `ArchiveStudioContextService`.
- Fastify archive routes.
- `EngineApiClient` archive methods.
- `/posts/analyze` context merge.
- `/drafts/judge` compact hint composition.

## Pipeline Log

- 2026-06-16: Created from arch-recon synthesis.
