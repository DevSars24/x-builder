---
status: todo
---

# XAI-005: Add derived insights and active archive context services

## Implementation Details

Add deterministic services that derive insights from canonical own-post history and persist an active archive context only after user activation. Derived insights should include cadence, reply/original ratio, repeated structures, repeated topics, emotional angle rotation, weak favorite/retweet history, confidence, and activation eligibility.

Active context must be compact. It may include `repeatHistory` when the history is recent enough to be meaningful. It must not populate `trailingMedianImpressions` from archive favorites or retweets. Judge hints must be short, generic, and derived from reviewed archive context, not raw archive content.

## Data Models

- `ArchiveDerivedInsights`: import id, generated timestamp, counts, confidence, cadence summary, voice corpus summary, topic/structure/emotional angle rotation, weak engagement percentiles.
- `ActiveArchiveContext`: active status, source import id, activated timestamp, compact scoring context patch, compact judge hints, provenance label, confidence, counts.
- `ActivationEligibility`: eligible flag, blocking reasons, warning reasons.

## Integration Point

The Library derived insights panel reads latest insights and activates/deactivates context. `/posts/analyze` and `/drafts/judge` consume active context through the server-side resolver in a later ticket.

## Scope Boundaries / Out of Scope

May add deterministic derivation and active context services, persistence through `PostLibraryRepository`, and related routes:

- `GET /archive/insights/latest`
- `POST /archive/context/activate`
- `POST /archive/context/deactivate`
- `GET /archive/context/active`

Must not add LLM generation, external calls, prompt execution over raw tweets, Studio UI, or real impression calibration.

## Test Strategy & Fixture Ownership

Engine unit and route tests own derived insight fixtures built from canonical posts. Dependency categories: in-process service and local-substitutable repository.

## Definition of Done

- Derived insights are generated from persisted canonical posts.
- Activation is blocked below the minimum threshold.
- Activation and deactivation persist and round-trip through active context route.
- Archive weak metrics remain separate from impressions.

## Acceptance Criteria

- Given at least 20 authored records or 10 replies/comments, When activation runs, Then active context is persisted.
- Given insufficient records, When activation runs, Then a structured blocking reason is returned.
- Given favorite and retweet counts, When insights are generated, Then weak engagement summary is shown but `trailingMedianImpressions` is absent.
- Given repeated structures and emotional angles, When insights are generated, Then rotation signals are included with confidence.

## Edge Cases

- Archive history is stale relative to current date.
- All records are replies.
- No favorite or retweet metrics.
- Import has only repost references.
- Active context points to an import that no longer exists.

## Pipeline Log

- 2026-06-16: Created from arch-recon synthesis.
