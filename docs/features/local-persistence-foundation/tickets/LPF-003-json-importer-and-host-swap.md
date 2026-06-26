---
status: done
---

# LPF-003: [FND] One-time JSON-to-SQLite importer and host swap

## Implementation Details

Add the one-time importer that moves any existing `post-library.json` into `x-builder.db`, then swap both hosts to construct `SqlitePostLibraryRepository`.

`importPostLibraryJsonToSqlite(jsonRoot, db)` is one-time and idempotent. It:

1. Checks for `post-library.json` in `jsonRoot`. If absent (already migrated, or a fresh install), it is a no-op and returns.
2. Reads the file and parses it with `postLibraryStoreSchema.parse`, **reusing a shared, extracted v1→v2 upgrade function** (see the extraction step below): a `schemaVersion: 1` file is upgraded to 2 with `profileSnapshots: []` before parse. A `schemaVersion` newer than supported, or unreadable / corrupt JSON, throws `PostLibraryStorageError`.

**Extract the v1→v2 upgrade first (so it is reused, not re-implemented).** Today this upgrade is inline private logic inside `JsonFilePostLibraryRepository.loadStore`. Extract it to a single exported function — e.g. `upgradePostLibraryStoreToV2(raw: unknown): unknown` (returns the v2-shaped object ready for `postLibraryStoreSchema.parse`, throws `PostLibraryStorageError` for `schemaVersion > 2`) — and have **both** `JsonFilePostLibraryRepository.loadStore` and the importer call it. This keeps the upgrade single-sourced; LPF-004 deletes only the JSON repo, leaving the shared upgrade function in place for upgraders.
3. Expands the parsed store into rows: `posts` → `post`, each post's `metricSnapshots` → `metric_obs`, `sourceRefs` → `source_ref`, the store's `profileSnapshots` → `profile_snapshot`, and `importRuns` / `derivedInsights` / `activeContext` → the `import_run` / `derived_insight` / `active_context` JSON-payload tables. It computes `content_hash` and `logical_post_id` per post (same write-time computation as the repository).
4. Inserts everything with `INSERT OR IGNORE` inside a `db.transaction`.
5. Renames `post-library.json` → `post-library.json.migrated`.

Re-running is a no-op via three independent guards: the rename guard (the file is gone after a successful run), a non-empty `post` table check, and `INSERT OR IGNORE` on every row.

**Host swap:** `createBoundEngineServices` (runner) and `buildServer` (engine, until its host is retired by `voice-rag-generation`) call `openEngineDatabase(dbPath)` once at startup against the same `storage` directory that held `post-library.json` (i.e. `~/.x-builder/engine-settings/storage/x-builder.db`), run `importPostLibraryJsonToSqlite(jsonRoot, db)` once at open, and construct `SqlitePostLibraryRepository` with the handle instead of `JsonFilePostLibraryRepository`. `runner-app.ts` (which currently constructs `JsonFilePostLibraryRepository` and passes it into `createBoundEngineServices`) is updated to construct the SQLite repo through the new open path.

**Widen the host signatures to the interface.** Three sites are currently typed to the concrete class and must be widened to `PostLibraryRepository` (the interface) so the swap type-checks and so LPF-004 can delete the concrete class without a compile break: the `BoundEngineServices` field `postLibraryRepository: JsonFilePostLibraryRepository`, the `createBoundEngineServices` parameter typed the same way, and the optional `postLibraryRepository?: JsonFilePostLibraryRepository` option in `runner-app.ts`. After widening, these sites name only the interface; no caller depends on the concrete type.

## Data Models

No new schemas. The importer consumes `postLibraryStoreSchema` (and its v1→v2 branch) and writes through the migration-1 tables defined in LPF-002. `import_run` / `derived_insight` / `active_context` payloads are written verbatim (their existing Zod payloads).

## Integration Point

The importer runs exactly once per host, at database open, before any request is served. After this ticket, every corpus read/write in both hosts goes through `SqlitePostLibraryRepository`; the JSON file is no longer read or written by the repository (it survives only as `post-library.json.migrated`). The `PostLibraryRepository` interface and all consumers are unchanged.

## Scope Boundaries / Out of Scope

May add `importPostLibraryJsonToSqlite`, extract `upgradePostLibraryStoreToV2` (and repoint `JsonFilePostLibraryRepository.loadStore` at it), the open-and-import wiring in `createBoundEngineServices` / `buildServer` / `runner-app`, the host-signature widening to the `PostLibraryRepository` interface, and their tests.

Out of scope: removing `JsonFilePostLibraryRepository` or its `saveStore` / `withSerializedWrite` (that is LPF-004 — the JSON repo's read path must still exist this ticket so the importer can be parity-checked and so a fallback exists); the `post_vec` vector table, embedder, and migrations 2–3 (`voice-rag-generation`); any new transport method (the "exactly 17" invariant is untouched).

The importer must not delete `post-library.json` — it renames it to `.migrated`, preserving it for rollback.

## Test Strategy & Fixture Ownership

Vitest 3, engine unit/integration tests, using `makeTempEngineDb()` (owned by LPF-002) and a tmpdir for the JSON root. Seed a tmpdir `post-library.json` (both a v2 and a v1-shaped fixture), run the importer, and assert the SQLite tables match and the file was renamed. Never touch the user's real storage path.

## Definition of Done

- `importPostLibraryJsonToSqlite(jsonRoot, db)` migrates an existing `post-library.json` into all migration-1 tables and renames it to `post-library.json.migrated`.
- The v1→v2 upgrade is extracted to a shared exported `upgradePostLibraryStoreToV2`; `JsonFilePostLibraryRepository.loadStore` and the importer both call it (no duplicated upgrade logic).
- The three host signatures (`BoundEngineServices.postLibraryRepository`, the `createBoundEngineServices` param, `runner-app`'s option) are widened to the `PostLibraryRepository` interface; the swap type-checks.
- A v1-shaped `post-library.json` is upgraded via the shared `upgradePostLibraryStoreToV2` before import.
- An absent `post-library.json` is a clean no-op.
- A corrupt / unreadable / too-new `post-library.json` throws `PostLibraryStorageError`.
- Re-running the importer (file already renamed, or table already populated) inserts nothing and renames nothing.
- `createBoundEngineServices` and `buildServer` open the DB once, run the importer once, and construct `SqlitePostLibraryRepository`; `runner-app` is updated to match.

## Acceptance Criteria

- Given an existing v2 `post-library.json` with posts, metric snapshots, source refs, profile snapshots, import runs, insights, and active context, When the importer runs, Then every record is present in the corresponding SQLite table and the file is renamed to `post-library.json.migrated`.
- Given a v1-shaped `post-library.json`, When the importer runs, Then it is upgraded (profileSnapshots defaulted) and imported without error.
- Given no `post-library.json`, When the importer runs, Then no tables change and nothing is renamed.
- Given a corrupt `post-library.json`, When the importer runs, Then it throws `PostLibraryStorageError` and does not rename the file.
- Given a host that already migrated (file is `post-library.json.migrated`, `post` table populated), When it starts again, Then the importer is a no-op and the host serves from SQLite.
- Given both hosts after the swap, When a corpus write happens, Then it lands in `x-builder.db` and `post-library.json` is never (re)created.

## Edge Cases

- v1 schema upgrade branch reused (not re-implemented) so the upgrade stays single-sourced.
- Absent file vs renamed file vs populated table — each independently makes the importer a no-op.
- Corrupt / truncated JSON, and a `schemaVersion` newer than supported, both surface as `PostLibraryStorageError`.
- A partially-completed prior run (rows present but file not yet renamed): `INSERT OR IGNORE` + non-empty-table guard keep the retry idempotent, and the rename then completes.
- Posts whose `kind` is `unknown` import verbatim (no remap).
- Snowflake IDs imported as `TEXT` without precision loss.

## Pipeline Log

- **2026-06-26 — DONE (FND: Red → Blue → Green → Blue+Yellow → Architecture checkpoint). 0 rejection cycles.** Commit `728ae8d` (Green) — `import-post-library-json.ts` (new), `post-library-repository.ts` (extract `upgradePostLibraryStoreToV2` + repoint loadStore), `server.ts` (`storageRoot` option + `resolvePostLibraryRepository` + `startEngineServer`), `index.ts`, `runner-app.ts` (`defaultCreateServices` swap + widen), `bound-engine-services.ts` (2 widenings). Importer is synchronous (sync fs + one `db.transaction` of `INSERT OR IGNORE`), reuses the LPF-002 `post-row-mapping` shred (byte-faithful to the JSON repo), three idempotency guards, renames (never deletes). `upgradePostLibraryStoreToV2` single-sourced (repo loadStore + importer both call it). **Safety:** the user's live 253 KB `~/.x-builder/.../post-library.json` was a real migration risk via the ~14 bare `buildServer()` tests; resolved by `buildServer` precedence injected-repo → `storageRoot` (open+import) → bare `:memory:` (empty, no home I/O), production persistence via `startEngineServer({storageRoot: defaultSettingsRoot})`. Corpus verified byte-identical to the safety backup before+after every run. **Bonus:** the `:memory:` bare-default fixed a pre-existing isolation bug — 3 `posts-analyze` tests were silently reading the real corpus; engine failures dropped 4→1 (remaining `judge-draft-service` failure is pre-existing, unrelated). Validate-Green **APPROVE**, Yellow **APPROVE** (3 host-swap traces wired; `:memory:` default intent-matching), Architecture **APPROVE** (genuine strangler step-2; reversibility preserved — JSON repo still exists for LPF-004; transport still exactly 17). **No concerns.**
