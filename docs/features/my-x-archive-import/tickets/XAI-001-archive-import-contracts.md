---
status: todo
---

# XAI-001: [FND] Define archive import contracts and error surface

## Implementation Details

Add shared Zod schemas for archive import API contracts and canonical DTOs. Export them from the shared package and wire client/server imports through the existing shared contract pattern.

Contracts must cover archive validation, import, latest overview, paginated posts, latest insights, active context activation/deactivation, and active context lookup. Extend the closed API error contract with archive/library scoped errors while preserving existing error shapes.

Use JSON request bodies for v1. `tweets.js` contents are supplied as text in the request body, with `fileName` and `fileSizeBytes` metadata. Do not introduce multipart, staged file ids, or local file path contracts.

## Data Models

- `archiveTweetsValidateRequestSchema`: `fileName`, `fileSizeBytes`, `contents`.
- `archiveTweetsValidateResponseSchema`: discriminated status `valid | partial | invalid`, safe file facts, field availability, counts, duplicate preview, warnings, source hash when valid or partial.
- `archiveTweetsImportRequestSchema`: `fileName`, `fileSizeBytes`, `contents`, `duplicatePolicy: "merge_update"`.
- `archiveImportRunSchema`: import id, source hash, assignment path, status, counts, duplicate counts, warnings, created/completed timestamps.
- `archivePostPreviewSchema`: canonical post id, platform post id, kind, text preview, created time, entity flags, weak archive metrics.
- `archiveDerivedInsightsSchema`: cadence, reply/original mix, repeat structures, emotional angle rotation, weak favorite/retweet summary, confidence.
- `activeArchiveContextSchema`: status `empty | active`, compact scoring context patch, compact judge hints, provenance, confidence, counts.
- `archivePostsPageSchema`: cursor pagination with `items`, `nextCursor`, and `limit`.
- Error scope/code additions for archive validation, import, storage, activation, and not-found cases.

## Integration Point

The user reaches these contracts through `/library` archive import UI actions. The engine consumes them in archive routes, and `EngineApiClient` consumes them when validating responses.

## Scope Boundaries / Out of Scope

May change shared schemas and tests, plus client/server imports needed to compile. Must not implement parser, repository, routes, UI, database, X API, OAuth, zip/folder import, media import, or future sync placeholders.

Do not add fields for impressions, profile clicks, bookmarks, link clicks, quote count, or received reply count as archive-derived metrics in v1.

## Test Strategy & Fixture Ownership

Shared schema unit tests own valid and invalid contract examples. External boundary category: in-process shared schemas. Include tests proving unknown future-only metric keys are stripped or rejected according to the repo's existing Zod semantics and do not survive response parsing.

## Definition of Done

- Shared archive schemas are exported.
- API error contract accepts new archive codes/scopes.
- Contract tests cover all response variants.
- Typecheck for shared consumers passes.

## Acceptance Criteria

- Given a valid archive validation response, When parsed by the shared schema, Then it preserves status, counts, warnings, and source hash.
- Given an archive response containing `impressionCount` derived from `favorite_count`, When parsed, Then that field does not survive the contract boundary.
- Given an invalid file validation response, When parsed, Then it does not require source hash or post previews.
- Given a malformed duplicate policy, When parsed, Then the import request is rejected.

## Edge Cases

- Oversized `contents` strings.
- Empty file name.
- Invalid cursor values.
- Unknown archive warning codes.
- Existing API client/server tests expecting closed error enums.

## Pipeline Log

- 2026-06-16: Created from arch-recon synthesis.
