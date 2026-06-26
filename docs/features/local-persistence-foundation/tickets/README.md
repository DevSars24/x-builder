# Local Persistence Foundation Tickets

Build order:

1. `LPF-001: [CHORE] Verify better-sqlite3 and scaffold the migration runner` — already-declared dep; verify-and-document + smoke script.
2. `LPF-002: [FND] openEngineDatabase, migration 1 DDL, SqlitePostLibraryRepository, and row mappers` — DDL keys match `snapshotKey`/`sourceRefKey`; archive `imported_at` round-trips; `profile_snapshot` append-only; `logical_post_id = platform_post_id`. Hosts the JSON↔SQLite parity/pinning test; owns `makeTempEngineDb`/`seedPosts`.
3. `LPF-003: [FND] One-time JSON-to-SQLite importer and host swap` — extract shared `upgradePostLibraryStoreToV2`; widen host signatures to the `PostLibraryRepository` interface.
4. `LPF-004: [RFR] Retire JsonFilePostLibraryRepository and the JSON write paths` — migrate the ~10 consumer-test fixtures + the `index.ts` export to the SQLite repo via the shared factory, then delete the class.
5. `LPF-005: [INT] SQLite storage integration + migration idempotency` — SQLite-only (parity vs JSON is pinned in LPF-002).
6. `LPF-006: [DOC] Document the local SQLite store and one-time migration`
