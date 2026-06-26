// LPF-001 — better-sqlite3 binding + migration-runner smoke script.
//
// THROWAWAY / NOT SHIPPED. This file lives in `engine/scripts/` which is OUTSIDE
// the engine's `tsc` compile root (`engine/tsconfig.json` has rootDir "src" and
// include ["src/**/*.ts"]). It is run directly with `node` and is never bundled
// into `dist/`. It contains NO application code, NO real schema, and NO row
// mappers — the "migration 1" below is a deliberate dummy stand-in so LPF-002 has
// a proven, known-good `Database` handle + synchronous-transaction mechanism to
// build the real migration runner on top of.
//
// What it proves end to end:
//   1. better-sqlite3's Node native binding loads (no ERR_DLOPEN_FAILED / ABI mismatch).
//   2. A temp database opens and accepts the three connection PRAGMAs the real
//      runner will need: journal_mode = WAL, synchronous = NORMAL, foreign_keys = ON.
//   3. `PRAGMA user_version` can be read and written (the migration version counter).
//   4. A migration step runs inside a synchronous `db.transaction(...)`, advancing
//      user_version 0 -> 1 atomically.
//   5. Re-running against the SAME database file is a no-op: user_version is already
//      1, so the migration is skipped and the `INSERT OR IGNORE` adds no duplicate row.
//
// Run it:
//   node engine/scripts/sqlite-migration-smoke.mjs              # uses an auto temp file
//   node engine/scripts/sqlite-migration-smoke.mjs /tmp/x.db    # explicit file (run twice to see idempotency)
//
// Platform / CI rebuild notes (so LPF-002 and CI inherit a known-good install):
//   - better-sqlite3 ships a prebuilt native binding per Node ABI. After changing the
//     Node major version, or on a fresh CI runner / different OS-arch than the lockfile
//     was built on, rebuild the binding from the engine package:
//         pnpm --filter @x-builder/engine rebuild better-sqlite3
//     (or `pnpm rebuild better-sqlite3` from within engine/). This requires a C/C++
//     toolchain (Xcode CLT on macOS; build-essential + python3 on Linux CI).
//   - Symptom of a stale/mismatched binding: `Error: ... ERR_DLOPEN_FAILED` or
//     "was compiled against a different Node.js version" on `new Database(...)`. The
//     fix is the rebuild command above — never patch tsconfig/build config to dodge it.

import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The dummy "migration 1". This is NOT the real LPF schema — it is a minimal
// stand-in table that exists only to exercise the runner mechanism. A fixed
// row id + `INSERT OR IGNORE` makes the second run provably a no-op.
const MIGRATION_1 = (db) => {
  db.exec(
    "CREATE TABLE IF NOT EXISTS lpf001_smoke_probe (id INTEGER PRIMARY KEY, note TEXT NOT NULL)",
  );
  db.prepare(
    "INSERT OR IGNORE INTO lpf001_smoke_probe (id, note) VALUES (1, ?)",
  ).run("migration-runner smoke ok");
};

const TARGET_VERSION = 1;

function main() {
  const explicitPath = process.argv[2];
  const dbPath =
    explicitPath ?? join(mkdtempSync(join(tmpdir(), "lpf001-")), "smoke.db");

  const db = new Database(dbPath);
  try {
    // Connection PRAGMAs the real runner (LPF-002) will set on every handle.
    const journalMode = db.pragma("journal_mode = WAL", { simple: true });
    db.pragma("synchronous = NORMAL");
    db.pragma("foreign_keys = ON");

    const foreignKeys = db.pragma("foreign_keys", { simple: true });
    const startVersion = db.pragma("user_version", { simple: true });

    console.log(`db file:        ${dbPath}`);
    console.log(`journal_mode:   ${journalMode}`);
    console.log(`foreign_keys:   ${foreignKeys}`);
    console.log(`user_version:   ${startVersion} (before)`);

    let applied = false;
    if (startVersion < TARGET_VERSION) {
      // Synchronous transaction wrapping: better-sqlite3 runs the wrapped
      // function inside BEGIN/COMMIT and rolls back if it throws.
      const runMigration1 = db.transaction(() => {
        MIGRATION_1(db);
        // user_version cannot be parameterized; it is an integer literal pragma.
        db.pragma(`user_version = ${TARGET_VERSION}`);
      });
      runMigration1();
      applied = true;
    }

    const endVersion = db.pragma("user_version", { simple: true });
    const rowCount = db
      .prepare("SELECT COUNT(*) AS n FROM lpf001_smoke_probe")
      .get().n;

    console.log(`migration 1:    ${applied ? "APPLIED" : "SKIPPED (no-op)"}`);
    console.log(`user_version:   ${endVersion} (after)`);
    console.log(`probe rows:     ${rowCount} (expected 1)`);

    // Fail fast at the boundary if the invariants the runner relies on are violated.
    if (endVersion !== TARGET_VERSION) {
      throw new Error(
        `expected user_version ${TARGET_VERSION}, got ${endVersion}`,
      );
    }
    if (rowCount !== 1) {
      throw new Error(`expected exactly 1 probe row, got ${rowCount}`);
    }

    console.log("SMOKE OK");
  } finally {
    db.close();
  }
}

main();
