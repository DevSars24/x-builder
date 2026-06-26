import { chmodSync } from "node:fs";

import Database from "better-sqlite3";

import { PostLibraryStorageError } from "./post-library-repository.js";

type DatabaseHandle = Database.Database;

const memoryPath = ":memory:";

const migration1Ddl = `
CREATE TABLE post (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL DEFAULT 'x',
  platform_post_id TEXT NOT NULL,
  logical_post_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  language TEXT,
  in_reply_to_post_id TEXT,
  in_reply_to_user_id TEXT,
  has_urls INTEGER NOT NULL,
  has_media INTEGER NOT NULL,
  has_hashtags INTEGER NOT NULL,
  has_mentions INTEGER NOT NULL,
  weak_favorite_count INTEGER,
  weak_retweet_count INTEGER,
  content_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_post_platform_post_id ON post(platform_post_id);
CREATE INDEX idx_post_kind ON post(kind);
CREATE INDEX idx_post_logical ON post(logical_post_id);
CREATE INDEX idx_post_created_at ON post(created_at);

CREATE TABLE metric_obs (
  tweet_id TEXT NOT NULL REFERENCES post(platform_post_id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT '',
  impressions INTEGER,
  likes INTEGER,
  reposts INTEGER,
  replies INTEGER,
  quotes INTEGER,
  bookmarks INTEGER,
  favorite_count INTEGER,
  retweet_count INTEGER,
  content_hash TEXT NOT NULL,
  PRIMARY KEY (tweet_id, source, observed_at, imported_at)
);
CREATE INDEX idx_metric_obs_tweet ON metric_obs(tweet_id, observed_at);

CREATE TABLE source_ref (
  post_id TEXT NOT NULL REFERENCES post(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  import_run_id TEXT NOT NULL DEFAULT '',
  source_hash TEXT NOT NULL DEFAULT '',
  capture_session_id TEXT NOT NULL DEFAULT '',
  raw_id TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (post_id, source, import_run_id, source_hash, capture_session_id, raw_id)
);

CREATE TABLE profile_snapshot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform_user_id TEXT NOT NULL,
  screen_name TEXT NOT NULL,
  followers INTEGER,
  captured_at TEXT NOT NULL
);
CREATE INDEX idx_profile_snapshot_user ON profile_snapshot(platform_user_id, captured_at);

CREATE TABLE import_run (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL
);

CREATE TABLE derived_insight (
  import_run_id TEXT PRIMARY KEY,
  generated_at TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE active_context (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  payload TEXT NOT NULL
);
`;

export type Migration = {
  version: number;
  up(db: DatabaseHandle): void;
};

// Ordered ascending by version. Later features (voice-rag-generation) append
// migrations 2 and 3 here without editing the existing entries; the runner only
// applies migrations whose version exceeds the current PRAGMA user_version.
export const migrations: Migration[] = [
  {
    version: 1,
    up(db) {
      db.exec(migration1Ddl);
    },
  },
];

const applyMigrations = (db: DatabaseHandle): void => {
  const currentVersion = Number(db.pragma("user_version", { simple: true }));

  for (const migration of migrations) {
    if (migration.version <= currentVersion) {
      continue;
    }

    db.transaction(() => {
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
    })();
  }
};

export const openEngineDatabase = (dbPath: string): DatabaseHandle => {
  try {
    const db = new Database(dbPath);

    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("foreign_keys = ON");

    if (dbPath !== memoryPath) {
      chmodSync(dbPath, 0o600);
    }

    applyMigrations(db);

    return db;
  } catch (error) {
    if (error instanceof PostLibraryStorageError) {
      throw error;
    }

    throw new PostLibraryStorageError(
      `Failed to open engine database at ${dbPath}.`,
      error,
    );
  }
};
