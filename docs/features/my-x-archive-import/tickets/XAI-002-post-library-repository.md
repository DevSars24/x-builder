---
status: todo
---

# XAI-002: [FND] Add canonical post library repository

## Implementation Details

Add a local `PostLibraryRepository` backed by JSON under the configured engine storage path. Model the persistence style after the existing JSON settings repository: validate loaded data, recover safely from missing files, write through temp file plus rename, and expose an interface that future X API sync can reuse.

The repository stores canonical own-post history, import runs, derived insight snapshots, and active archive context. Add an import-level serialization guard so concurrent imports cannot lose updates.

## Data Models

- `PostLibraryStore`: schema version, updated timestamp, posts, import runs, derived insights, active context.
- `CanonicalOwnPost`: app id, platform `x`, platform post id, text, created timestamp, kind `original | reply | repost_reference | unknown`, language, reply references, entity flags, weak archive metrics, metric snapshots, source refs, updated timestamp.
- `ArchiveMetricSnapshot`: source `archive_tweets_js`, observed/imported timestamp, favorite count, retweet count.
- `SourceRef`: source, import run id, raw id, source hash.
- `PostLibraryWriteResult`: inserted count, updated count, unchanged count, duplicate count.

## Integration Point

Archive import services write to this repository after parser/normalizer success. Future X API sync must be able to upsert through the same canonical post model instead of creating a parallel store.

## Scope Boundaries / Out of Scope

May add repository code, repository schemas, storage-path wiring, and repository tests. Must not implement archive parsing, Fastify routes, Library UI, Studio context merging, SQLite, migrations, or X API sync.

No raw archive file contents are persisted.

## Test Strategy & Fixture Ownership

Engine unit tests own temp-root repository coverage. Dependency category: local-substitutable filesystem. Tests should use isolated temp directories and avoid the user's real settings path.

## Definition of Done

- Repository can load an empty store.
- Repository validates loaded JSON and handles corrupt data deterministically.
- Upsert enforces unique `{ platform, platformPostId }`.
- Writes are atomic and serialized.
- Future sync can call the same upsert interface without archive-specific method names.

## Acceptance Criteria

- Given no post library file, When repository loads, Then it returns an empty valid store.
- Given duplicate posts with the same X post id, When upsert runs, Then only one canonical post remains.
- Given updated metrics for an existing post, When upsert runs, Then metric snapshots and source refs are preserved without duplicating the post.
- Given a corrupt store file, When repository loads, Then it returns a controlled storage error or safe fallback according to the repository contract.

## Edge Cases

- Two imports started at once.
- Unwritable storage path.
- Store schema version mismatch.
- Missing metric fields.
- Posts with valid id/date/text but unknown kind.

## Pipeline Log

- 2026-06-16: Created from arch-recon synthesis.
