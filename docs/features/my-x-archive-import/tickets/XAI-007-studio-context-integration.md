---
status: todo
---

# XAI-007: Integrate active archive context with Studio and judge

## Implementation Details

Add server-side active archive context resolution for `/posts/analyze` and compact judge hint composition for `/drafts/judge`. The client may load active context only to show an indicator in Studio. Studio should not send raw archive context or raw history in analysis requests.

Merge rule: explicit request fields win over archive-derived fields. `followers`, manual `trailingMedianImpressions`, planned hour, media flag, and account age remain user-controlled. Archive-derived `repeatHistory` may fill in only when the request does not provide a conflicting manual field. Archive favorites/retweets must never become `trailingMedianImpressions`.

## Data Models

- `StudioContextResolver`: loads active archive context and returns compact scoring patch and judge hints.
- `ArchiveContextIndicatorModel`: active status, activated timestamp, import counts, confidence, provenance label, included fields.
- Judge context composition: existing account profile plus compact archive hints, without overwriting user settings.

## Integration Point

Users activate context in `/library`, then see the active context indicator in `/writer`. Existing Studio scoring calls `/posts/analyze`; existing judge calls `/drafts/judge`.

## Scope Boundaries / Out of Scope

May change server analysis/judge route wiring, writer route loading, Studio indicator UI, and related tests. Must not add raw post history to client requests, change deterministic scoring contracts beyond shared schemas already approved, create generation features, or overwrite settings account profile.

## Test Strategy & Fixture Ownership

Engine route tests own context merge behavior. Writer tests own indicator rendering and request behavior. Dependency categories: in-process server tests and client component tests with fake API.

## Definition of Done

- Active context is merged server-side for analysis.
- Manual advanced fields override archive-derived fields.
- Judge receives compact hints without raw tweets and without overwriting account profile.
- Writer shows active context status and can navigate back to Library.
- Tests prove archive weak metrics do not become impressions.

## Acceptance Criteria

- Given active archive context with repeat history, When `/posts/analyze` receives no manual repeat history, Then analysis uses archive repeat history.
- Given manual repeat history in the request, When `/posts/analyze` runs, Then manual repeat history wins.
- Given archive favorite/retweet summaries, When `/posts/analyze` runs, Then `trailingMedianImpressions` remains absent unless explicitly supplied by the user.
- Given active archive context, When Studio loads, Then an indicator shows source, confidence, and active status without raw post text.
- Given settings account profile exists, When judge runs, Then compact archive hints are composed without overwriting the profile.

## Visual AC

Place `ArchiveContextIndicator` near existing Studio context controls. Keep it compact: source label, confidence, included fields, and an action to open Library. It should not look like a warning unless context is stale or partial.

## Edge Cases

- Active context is deleted or invalid.
- Library activation changes while Writer is open.
- Judge provider unavailable.
- Manual fields are invalid and dropped by existing schema validation.
- Stale archive history should not claim current cooldown certainty.

## Pipeline Log

- 2026-06-16: Created from arch-recon synthesis.
