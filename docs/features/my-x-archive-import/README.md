---
status: implemented
---

# My X Archive Import

Purpose: import a user's exported X `tweets.js` archive into the local corpus so the product learns from historical posts without paid API access.

This is **one of two independent corpus enrichment sources**. The default is passive live capture (the runner reads your posts as you browse — see [x-overlay-browser](../x-overlay-browser/)); archive import is the optional **fast-start** that loads your full history at once, so the reach baseline and voice are deep on day one. The two merge, deduped by post id, into the same `post-library.json`.

## Boundary

A local, one-time (or occasional) import. The user extracts their X archive and selects `data/tweets.js`; the engine parses it **without executing JavaScript** and normalizes records into the canonical post library. The corpus is **per account** — it is built for the logged-in user's own profile, and calibration (reach baseline, voice, audience hints) is theirs alone. No creator handle, niche, or strategy is baked into code, schemas, or prompts.

## Where it lives in the product

Archive import is surfaced in the **overlay Settings panel** (`overlay/src/settings/archive-upload-section.tsx` → `active-context-toggle.tsx`), not a standalone studio route. (The legacy `/library` SPA route this feature originally shipped against was removed in the overlay pivot.) The flow: select `tweets.js` → validate (counts, skips, duplicate preview) → import → review derived insights → **activate** the derived scoring context. Without activation, scoring stays generic; activation is what turns on the personalized reach baseline (`scoringContext`) and the judge's audience hints.

## Inputs & outputs

- **In:** `data/tweets.js` — post IDs, text, reply references, created time, language, entities, and `favorite_count` / `retweet_count` when present.
- **Out:** canonical own-post history (deduped against live-captured posts), a voice corpus, weak historical engagement signals, cadence/rotation signals, an activatable compact scoring context, and an import-quality report.

## Metrics boundary

`tweets.js` carries only `favorite_count` and `retweet_count` — not impressions, profile clicks, link clicks, bookmarks, quotes, or received replies. Archive metrics are **weak historical proxies** and are never mapped into `trailingMedianImpressions`. (Live capture is what supplies real reach signal.)

## Consumers

- **Voice** — generation grounds drafts in your real posts.
- **Reach baseline** — calibrates the deterministic reach prediction to your account.
- **Cooldowns** — format repetition over the rolling window.
- **Judge** — audience/voice hints for audience-match and voice-preserving rewrites.

## Non-goals

No X API, OAuth, daily sync, or database (local JSON only). No zip/folder extraction, DM/media/deleted-tweet import, or external scraping. No claim of true account health or ranking certainty.

## API endpoints (engine)

- `POST /archive/tweets/validate` — validate selected `tweets.js` contents; safe counts, warnings, duplicate preview; no persistence.
- `POST /archive/tweets/import` — normalize and upsert canonical own-post history; persist an import run.
- `GET /archive/imports/latest` — latest import summary + active-context status.
- `GET /archive/posts?cursor=&limit=` — paginated imported posts.
- `GET /archive/insights/latest` — latest derived insights.
- `POST /archive/context/activate` · `POST /archive/context/deactivate` · `GET /archive/context/active` — manage the compact derived scoring context.

## Component breakdown (engine)

- `TweetsJsParser` — safe parse of `window.YTD.tweets` payloads (no `eval`/`Function`/VM).
- `ArchiveTweetNormalizer` — raw entries → canonical upsert inputs + skip reasons.
- `PostLibraryRepository` — local JSON persistence, atomic writes, duplicate upserts (shared with live capture).
- `ArchiveImportService` — coordinates validate/import/persist + summaries.
- `ArchiveDerivedContextService` — derives cadence, reply/original mix, repeat structures, weak history, activation eligibility.
- `ArchiveStudioContextResolver` — loads the compact active context and merges scoring patches server-side for `/posts/analyze` (explicit user fields win over archive-derived ones).
- Overlay: `archive-upload-section.tsx` + `active-context-toggle.tsx` in the Settings panel.

## Open questions

- Which `tweets.js` shapes are stable across X export versions?
- Should later versions add zip/folder extraction, note tweets, or community tweets?
- Minimum imported history before voice/baseline outputs are trustworthy?
