---
status: todo
---

# XAI-004: Add archive validate and import engine routes

## Implementation Details

Add Fastify routes for archive validation, import, latest overview, and paginated post preview using the existing server route pattern: shared Zod request parsing, service injection through `buildServer`, normalized API errors, and response contract validation.

Validation should parse and normalize without persisting posts. Import should re-parse the supplied contents, normalize, upsert canonical posts, persist a completed import run, and return import summary plus initial derived preview data.

## Data Models

Use the shared contracts from `XAI-001` and repository models from `XAI-002`. The import route accepts only `duplicatePolicy: "merge_update"` in v1.

## Integration Point

The `/library` UI calls these routes through `EngineApiClient`. The routes call `ArchiveImportService`, `TweetsJsParser`, `ArchiveTweetNormalizer`, and `PostLibraryRepository`.

## Scope Boundaries / Out of Scope

May add engine routes, service wiring, API client methods, and route tests. Must not add Studio context merging, Library workflow UI, LLM extraction, multipart upload, staged file cache, local path handoff, X API sync, or database storage.

## Test Strategy & Fixture Ownership

Engine integration tests use Fastify `app.inject`, injected services, and temp storage roots. Client API tests validate response parsing and error mapping. Dependency categories: in-process server and local-substitutable filesystem.

## Definition of Done

- `POST /archive/tweets/validate` returns valid, partial, and invalid variants.
- `POST /archive/tweets/import` persists canonical posts and an import run.
- `GET /archive/imports/latest` returns route overview data.
- `GET /archive/posts` returns cursor-paginated canonical post previews.
- `EngineApiClient` exposes typed JSON methods for these routes.

## Acceptance Criteria

- Given valid `tweets.js` contents, When validation runs, Then the response includes safe counts and unavailable metric facts.
- Given the same valid contents, When import runs twice with merge policy, Then posts are not duplicated.
- Given invalid archive text, When validation runs, Then the response is invalid without persisting posts.
- Given a storage failure during import, When the route handles it, Then a normalized archive storage error is returned.

## Edge Cases

- Oversized request body.
- Empty `contents`.
- Duplicate posts already present.
- Partial imports with skipped records.
- Pagination cursor past the end.

## Pipeline Log

- 2026-06-16: Created from arch-recon synthesis.
