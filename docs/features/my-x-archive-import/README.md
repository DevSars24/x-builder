---
status: todo
---

# My X Archive Import

Purpose: import a user's exported X `tweets.js` archive file into local app data so the product can learn from historical posts, replies, timing, and weak engagement signals without requiring paid API access.

## Boundary

This feature is the local, one-time or occasional historical import path. In v1, the user extracts the X archive themselves and selects the relevant JavaScript data file, starting with `tweets.js`. The engine normalizes that file into app-owned data structures that later features can use.

It should stay account-generic and open-source friendly. The engine must not assume a specific creator, handle, niche, or personal strategy.

## Primary Inputs

- Extracted `data/tweets.js` selected by the user.
- Post fields inside `tweets.js`, including post IDs, text, reply references, created time, language, entities, favorite count, and retweet count when present.

## Expected Outputs

- Historical post library with original posts, replies/comments, repost references, timestamps, language, link/entity flags, and source provenance.
- Voice corpus split by post type, with replies/comments prioritized for voice because standalone posts may include generated or polished content.
- Weak historical engagement metrics from archive fields such as favorites/likes received and reposts/retweets.
- Cadence and rotation signals: posting frequency, reply/original ratio, repeated topics, repeated structures, and likely cooldown windows.
- Active Studio context snapshot after user confirmation: recent history, weak metric baseline, voice hints, niche/profile hints, and rotation memory.
- Import quality report: files found, files missing, records imported, records skipped, private/sensitive categories detected, and confidence level for derived outputs.

## Metrics Boundary

The archive may include `favorite_count` and `retweet_count` on archived tweets. In the inspected archive, normal post impressions, profile clicks, link clicks, bookmarks, quote counts, and received reply counts were not present in `tweets.js`.

Archive metrics should be treated as partial historical signal. They are useful for ranking relative post history, but not enough for full reach prediction calibration.

## Consumers

- `voice-profile`: build editable voice, tone, phrasing, structure, emotional angle, and reply style from historical posts and comments.
- `my-feedback-loop`: seed historical outcomes and calibration rows where enough metrics exist.
- `deterministic-engine`: consume cadence, repeat-history, topic fatigue, profile context, and weak baseline signals.
- `llm-judge`: consume voice/profile context for semantic fit, audience fit, and voice-preserving rewrites.
- Future generation features: avoid repeating the same rubric, topic, or emotional angle too soon.

## Non-Goals

- No X API calls.
- No OAuth.
- No daily sync.
- No claim of true X account health or ranking eligibility.
- No definitive ranking-algorithm certainty.
- No folder or zip extraction in v1; the user extracts the archive and selects the relevant JavaScript file.
- No private-message import.
- No media import in v1.
- No deleted tweet import in v1.
- No external account scraping.

## UX Notes

- The user should understand that archive export and extraction are manual, but free.
- The app should show exactly what was found and what was not found.
- Private categories such as DMs, contacts, IP audit, device tokens, and account security files should be excluded by default.
- The import should be repeatable without duplicating posts from the selected file.
- Derived voice/profile/rotation outputs should be reviewable before they affect generation, then activatable as Studio context after user confirmation.

## Open Research Questions

- Which `tweets.js` shapes are stable across different X export versions?
- Should later versions add folder or zip extraction after the v1 file-only path?
- How should we safely parse `window.YTD.*` JavaScript assignment files without executing them?
- Should later versions support note tweets, community tweets, or graph/profile files?
- What is the minimum imported history needed before voice/profile outputs are trustworthy?
- How should emotional angle rotation be derived from historical posts without overfitting?

## Architecture Context

V1 imports one extracted X archive file, `data/tweets.js`, through the local Library route. The client reads the selected file and sends JSON request bodies to the engine; the engine parses the archive text without executing JavaScript, normalizes records into app-owned canonical own-post history, and persists only normalized records plus import summaries and derived context.

Storage is local JSON under the configured engine storage path, behind a repository interface with atomic writes and an import-level serialization guard. Do not introduce SQLite or another database in this epic. The repository model must be canonical, not archive-specific: future X API sync will upsert into the same own-post records and metric snapshot structures.

Studio consumes only a compact activated archive context. Raw archive content and raw post history must never be sent into Studio analysis or LLM judge calls. The engine merges active archive context server-side for `/posts/analyze`; explicit user-provided scoring fields win over archive-derived fields. Archive `favorite_count` and `retweet_count` are weak historical signals only and must not be mapped into `trailingMedianImpressions`.

The feature must stay faceless and open-source friendly. No creator handle, personal niche, private strategy, or account-specific assumption belongs in code, schemas, prompts, fixtures, labels, or defaults.

## API Endpoints

- `POST /archive/tweets/validate` - validate a JSON payload containing selected `tweets.js` file metadata and contents; return safe counts, warnings, duplicate preview, and invalid/partial status without persisting posts.
- `POST /archive/tweets/import` - re-parse the supplied `tweets.js` contents, normalize records, upsert canonical own-post history, persist an import run, and return summary plus derived context preview.
- `GET /archive/imports/latest` - return latest import summary, active context status, and route overview data.
- `GET /archive/posts?cursor=&limit=&kind=` - return paginated imported canonical posts for Library preview.
- `GET /archive/insights/latest` - return latest deterministic derived insights for review.
- `POST /archive/context/activate` - activate a compact Studio context for a completed import.
- `POST /archive/context/deactivate` - deactivate the current archive-derived Studio context.
- `GET /archive/context/active` - return the active compact context, or empty status.

## Component Breakdown

- `TweetsJsParser` - safely extracts and parses supported `window.YTD.tweets` assignment payloads without `eval`, `Function`, dynamic import, or VM execution.
- `ArchiveTweetNormalizer` - maps raw archive tweet entries into canonical own-post upsert inputs and skip reasons.
- `PostLibraryRepository` - owns local JSON persistence, schema validation, atomic writes, duplicate upserts, and future sync migration boundary.
- `ArchiveImportService` - coordinates validation, import, duplicate handling, persistence, and import summaries.
- `ArchiveDerivedInsightsService` - derives cadence, reply/original mix, repeat structures, emotional angle rotation, weak favorite/retweet history, and activation eligibility.
- `ArchiveStudioContextService` - activates, deactivates, and loads compact archive context for Studio and judge consumers.
- `LibraryRoute` - owns the `/library` import workflow with route-local reducer state.
- `ArchiveContextIndicator` - shows active historical context in Studio without exposing raw history.

## Dependencies

- Existing shared Zod contract pattern.
- Existing Fastify `buildServer` route pattern and response contract validation.
- Existing `EngineApiClient` JSON request/response validation pattern.
- Existing writer scoring context and judge routes.
- Existing local settings storage path.

No external X API, OAuth, database, file watcher, scraper, zip reader, media processor, or MCP integration is introduced by this epic.

## Sub-Tickets Overview

- `XAI-001: [FND] Define archive import contracts and error surface` - shared request/response schemas, error codes, and contract tests.
- `XAI-002: [FND] Add canonical post library repository` - local JSON store, atomic writes, canonical post model, and upsert semantics.
- `XAI-003: Implement safe tweets.js parsing and normalization` - parser and normalizer for selected archive file.
- `XAI-004: Add archive validate and import engine routes` - Fastify routes over parser, repository, and import service.
- `XAI-005: Add derived insights and active archive context services` - deterministic insights, activation threshold, and context persistence.
- `XAI-006: Build Library archive import workflow` - `/library` UI for select, validate, review, import, summary, and activation.
- `XAI-007: Integrate active archive context with Studio and judge` - server-side scoring merge, Studio indicator, and judge hint composition.
- `XAI-008: [INT] Cover archive import and Studio context integration` - integration tests across engine, client API, and writer flow.
- `XAI-009: [E2E] Verify import-to-Studio activation flow` - end-to-end user flow coverage.
- `XAI-010: [DOC] Document archive import boundaries and local data behavior` - user-facing and feature docs refresh.
