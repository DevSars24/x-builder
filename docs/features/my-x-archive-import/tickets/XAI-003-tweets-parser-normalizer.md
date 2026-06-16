---
status: todo
---

# XAI-003: Implement safe tweets.js parsing and normalization

## Implementation Details

Add `TweetsJsParser` and `ArchiveTweetNormalizer`. The parser accepts text and extracts supported `window.YTD.tweets` assignment payloads without executing JavaScript. The normalizer converts raw archive tweet entries into canonical own-post upsert inputs plus structured skip reasons.

The parser must support common `window.YTD.tweets.part0 = [...]` and equivalent tweets assignment shapes by detecting the assignment and parsing the JSON array payload. It must not use `eval`, `Function`, dynamic import, or VM execution.

## Data Models

- `ParsedTweetsArchive`: assignment path, record count, parsed tweet wrappers, warnings.
- `ArchiveTweetNormalizeResult`: canonical post inputs, skipped record summaries, field availability, preview counts.
- `ArchiveSkipReason`: missing id, missing text, missing created time, malformed date, unsupported record shape.
- `ArchiveFieldAvailability`: post ids, text, created times, reply refs, language, entities, favorite count, retweet count.

## Integration Point

`ArchiveImportService` calls the parser and normalizer during validation and import. The repository receives only normalized canonical post inputs, not raw parser records.

## Scope Boundaries / Out of Scope

May add parser, normalizer, fixtures, and unit tests. Must not add routes, repository writes, UI, LLM calls, X API sync, zip/folder extraction, media fetching, deleted tweet import, or private-message import.

Parser and error paths must not log or return raw post text.

## Test Strategy & Fixture Ownership

Engine parser fixtures own minimal representative `tweets.js` text samples. Dependency category: in-process. Include fixtures for valid assignment, malformed assignment, empty array, partial malformed records, replies, repost references, and unsupported wrong file content.

## Definition of Done

- Parser extracts supported assignment payloads safely.
- Normalizer classifies originals, replies, and repost references.
- Normalizer captures entity flags and weak archive metrics.
- Malformed records are skipped with aggregate reasons.
- Tests prove no JS execution strategy is used.

## Acceptance Criteria

- Given `window.YTD.tweets.part0 = [...]`, When parsed, Then records are returned through JSON parsing only.
- Given a record with id, full text, and created time, When normalized, Then it becomes a canonical own-post input.
- Given a reply record, When normalized, Then reply references are preserved.
- Given malformed records mixed with valid records, When normalized, Then valid records remain and skip reasons are counted.
- Given `like.js` or unrelated archive content, When parsed, Then the result is invalid for this feature.

## Edge Cases

- Semicolon and whitespace around assignment.
- Very long post text within schema limits.
- Missing `favorite_count` or `retweet_count`.
- Non-English `lang` values.
- URLs, mentions, hashtags, and archive media references.

## Pipeline Log

- 2026-06-16: Created from arch-recon synthesis.
