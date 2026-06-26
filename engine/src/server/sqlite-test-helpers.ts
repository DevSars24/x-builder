import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type Database from "better-sqlite3";

import { openEngineDatabase } from "./open-engine-database.js";
import { SqlitePostLibraryRepository } from "./sqlite-post-library-repository.js";
import type { CanonicalOwnPost } from "./post-library-repository.js";

type DatabaseHandle = Database.Database;

// Shipped, cross-package test-support API (consumed by voice-rag-generation and
// my-feedback-loop). Signatures are stable and documented; this ticket owns them.

/**
 * Open a fresh engine database backed by an `x-builder.db` file inside a unique
 * OS temp directory. Never touches the user's real storage path. The returned
 * handle is migrated to the latest schema version.
 */
export const makeTempEngineDb = (): DatabaseHandle => {
  const root = mkdtempSync(join(tmpdir(), "x-builder-engine-db-"));

  return openEngineDatabase(join(root, "x-builder.db"));
};

/**
 * Seed the given posts into the database through the canonical write path
 * (`SqlitePostLibraryRepository.upsertPosts`), so seeded rows are shredded and
 * deduped identically to production writes.
 */
export const seedPosts = async (
  db: DatabaseHandle,
  posts: CanonicalOwnPost[],
): Promise<void> => {
  const repository = new SqlitePostLibraryRepository(db);

  await repository.upsertPosts(posts);
};
