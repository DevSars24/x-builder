---
status: done
---

# LPF-004: [RFR] Retire JsonFilePostLibraryRepository and the JSON write paths

## Implementation Details

This is the **producer-and-retire** step: LPF-003 swapped the *hosts* to SQLite, but `JsonFilePostLibraryRepository` is still alive at ~12 other sites — it is the corpus **fixture** in ~10 consumer test suites and is re-exported from `engine/src/index.ts`. The class cannot be deleted until those move, so this ticket migrates every remaining consumer first, swaps the public export, and only then deletes the class. (Verified sites: `new JsonFilePostLibraryRepository` appears in 13 files; one is the repo's own test, the rest are the consumers below + the already-swapped hosts.)

Steps, in order:

1. **Migrate consumer fixtures to the shared SQLite factory.** Repoint every `new JsonFilePostLibraryRepository(...)` corpus fixture to a SQLite repo built with `makeTempEngineDb()` + `SqlitePostLibraryRepository` + `seedPosts(...)` (the factory/helpers owned by LPF-002). Affected suites: server `archive-routes`, `archive-studio-context`, `capture-cooldown`, `posts-analyze`; `archive-derived-context-service`; `live-capture-service`; `live-context-resolver`; `repetition-window-service`; `generate-category-service`; and the runner `transport-engine-bindings.integration.test.ts`. Each suite's **assertions are unchanged** — only the corpus-fixture construction changes, because the service under test only ever sees the `PostLibraryRepository` interface.
2. **Swap the public export.** `engine/src/index.ts` re-exports `JsonFilePostLibraryRepository` today (line 9); replace that with `SqlitePostLibraryRepository` (and `openEngineDatabase`), so external importers get the SQLite repo.
3. **Delete the class.** Remove `JsonFilePostLibraryRepository`, `JsonFilePostLibraryRepositoryOptions`, `saveStore`, `withSerializedWrite`, and the repo's own test file (`post-library-repository.test.ts` — superseded by LPF-002's SQLite-repo tests and LPF-005's integration suite). The surviving JSON-corpus code is the importer's one-time read path plus the shared `upgradePostLibraryStoreToV2` (extracted in LPF-003), which upgraders still need. After this ticket no code path *writes* `post-library.json`.

This is behavior-preserving **for every consumer**: the migrated suites assert the identical service outcomes — only the fixture construction differs. The `PostLibraryRepository` interface, the `PostLibraryStore` / `PostLibraryWriteResult` shapes, the merge semantics, and the `EngineTransport` seam are all preserved exactly.

## Refactor Scope

- `JsonFilePostLibraryRepository` (the class) and `JsonFilePostLibraryRepositoryOptions` — removed.
- Its `saveStore` (temp-file-plus-rename whole-file write) and `withSerializedWrite` (in-process promise queue) — removed; they have no remaining caller once both hosts use SQLite and `db.transaction` provides atomicity.
- `JsonFilePostLibraryRepository`'s own test (`post-library-repository.test.ts`) — removed (superseded by LPF-002 repo tests + LPF-005 integration).
- The ~10 consumer test suites listed in Implementation Details — their corpus **fixture construction** is migrated from `new JsonFilePostLibraryRepository(...)` to the shared `makeTempEngineDb()` + `SqlitePostLibraryRepository` factory; assertions untouched.
- `engine/src/index.ts` — the re-export changes from `JsonFilePostLibraryRepository` to `SqlitePostLibraryRepository` (+ `openEngineDatabase`).
- Host imports/usages in `server.ts`, `runner-app.ts`, `bound-engine-services.ts` — already swapped + widened to the interface in LPF-003; this ticket removes the now-dead symbol.
- **Kept:** the importer's one-time read path + the shared `upgradePostLibraryStoreToV2` (extracted in LPF-003) so upgraders are still migrated. The `postLibraryFileName` constant and the `.migrated` rename target stay.
- **Kept:** `PostLibraryRepository`, `PostLibraryStore`, `PostLibraryWriteResult`, `PostLibraryStorageError`, the `canonicalOwnPost*` / `postLibraryStore*` schemas, and the merge helpers (now homed with the SQLite repo).

## Data Models

No schema changes. `PostLibraryStore` / `PostLibraryWriteResult` / `CanonicalOwnPost` shapes are byte-for-byte the same as before this ticket.

## Integration Point

Both hosts already construct `SqlitePostLibraryRepository` (LPF-003). This ticket only removes the now-unused JSON class and write machinery; the construction sites do not change further. No consumer of `PostLibraryRepository` is touched.

## Scope Boundaries / Out of Scope

May remove `JsonFilePostLibraryRepository` + its own test + the JSON `saveStore` / `withSerializedWrite` write paths; migrate the ~10 consumer fixtures to the shared SQLite factory; and swap the `engine/src/index.ts` export.

Out of scope: changing the `PostLibraryRepository` interface, the store shapes, or the merge semantics; changing any migrated consumer's **assertions** (only its fixture construction moves); touching the importer's behavior; the `post_vec` table, embedder, or migrations 2–3 (`voice-rag-generation`); any transport method (this feature adds none — the `EngineTransport` count is unchanged by LPF).

Zero-trace: no dangling import of the removed class anywhere in shipped source or tests, no dead `withSerializedWrite`, no reachable code path that writes `post-library.json`, and `engine/src/index.ts` no longer names `JsonFilePostLibraryRepository`.

## Behavior-Preservation Invariants

- The `PostLibraryRepository` interface keeps the same 6 methods with the same signatures.
- `loadStore()` returns an identical `PostLibraryStore` shape; `upsertPosts` returns identical `PostLibraryWriteResult` counts; for any input batch the result matches the pre-refactor (and SQLite, post-LPF-003) behavior.
- The merge semantics (`mergePost` / `uniqueBy` / `snapshotKey` / `sourceRefKey` / `postKey`) are unchanged — same dedup keys, same merge precedence.
- **Every migrated consumer suite asserts the identical service behavior** (same outcomes, counts, and shapes) as before the migration; only how the corpus fixture is constructed changes.
- The one-time upgrade path (importer read + shared `upgradePostLibraryStoreToV2`) still migrates an upgrading user exactly as in LPF-003.
- The `EngineTransport` method count is unchanged by this feature (LPF adds no transport method).
- No new error types; `PostLibraryStorageError` remains the storage error.

## Definition of Done

- All ~10 consumer suites are migrated to the shared `makeTempEngineDb()` + `SqlitePostLibraryRepository` factory with their **assertions unchanged**, and pass.
- `JsonFilePostLibraryRepository`, its options type, `saveStore`, `withSerializedWrite`, and its own test file are removed; the project builds and typechecks with no dangling references.
- `engine/src/index.ts` re-exports `SqlitePostLibraryRepository` (+ `openEngineDatabase`) and no longer names `JsonFilePostLibraryRepository`.
- `pnpm test` (engine + runner, excluding e2e) is green; `pnpm typecheck` and `pnpm build` pass.
- The only surviving `post-library.json` access is the importer's one-time read + the shared `upgradePostLibraryStoreToV2`; no code writes the JSON file.
- `rg "JsonFilePostLibraryRepository|withSerializedWrite"` returns nothing in shipped source or tests.

## Pipeline Log

- **2026-06-26 — DONE ([RFR]: Red-RFR → Blue pinning → pre-Green gate → Green → Blue+Yellow). 0 rejection cycles.** Pinning: Red-RFR (`f996b40`) inventoried all 7 Behavior-Preservation Invariants, confirmed the ~10 consumer suites are fixture-only (no oracle equality), and added oracle-independent backstops `sqlite-loadstore-shape-pin.test.ts` (PIN 1 = full parityBatch round-trip shape, PIN 2 = full imported-v2 shape) for the only two field-level spots pinned solely via the JSON oracle. Blue Validate-RFR-Pinning **APPROVE** (pins JSON-repo-free + mutation-falsifiable). Pre-Green pinning gate green at baseline. Green (`352384f`): deleted `JsonFilePostLibraryRepository` + options + `saveStore`/`withSerializedWrite` + its own test + dead helpers (`post-library-repository.ts` 446→184); migrated 10 consumer fixtures to `new SqlitePostLibraryRepository(openEngineDatabase(":memory:"))` (assertions byte-identical); adapted the 4 oracle tests (removed only the `toEqual(json…)` lines, kept concrete assertions); swapped the `index.ts` export; reworded the 2 provenance comments. **DoD met:** `rg "JsonFilePostLibraryRepository|withSerializedWrite"` → ZERO hits in source+tests; engine 741/1 (the 1 = pre-existing unrelated `judge-draft-service`), runner 103/0, typecheck+build clean. Validate-Green **APPROVE** (construction-only migration, each removal oracle/structure-coupled with surviving pins, surviving public surface intact, transport still 17). Yellow **APPROVE** (genuine removal — no dual store, no router, no orphan helpers, no compat shim; corpus still reachable through the unchanged interface). Safety: live `~/.x-builder` corpus byte-identical to backup throughout. **No concerns.**
