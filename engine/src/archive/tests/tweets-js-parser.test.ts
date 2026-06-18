import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ArchiveTweetNormalizer,
  TweetsJsParser,
} from "../tweets-js-parser";

const validTweetsJs = `window.YTD.tweets.part0 = [
  {
    "tweet": {
      "id": "1800000000000000001",
      "id_str": "1800000000000000001",
      "full_text": "A compact archive post with a #tag https://example.com",
      "created_at": "Fri Jan 05 12:00:00 +0000 2024",
      "favorite_count": "12",
      "retweet_count": "3",
      "lang": "en",
      "entities": {
        "hashtags": [{ "text": "tag" }],
        "urls": [{ "expanded_url": "https://example.com" }],
        "user_mentions": []
      }
    }
  }
];`;

describe("TweetsJsParser", () => {
  it("extracts window.YTD.tweets.part0 assignment payloads using JSON parsing only", () => {
    const parser = new TweetsJsParser();

    const result = parser.parse(validTweetsJs);

    expect(result.status).toBe("parsed");
    if (result.status !== "parsed") {
      throw new Error("Expected parsed tweets.js contents.");
    }
    expect(result.archive.assignmentPath).toBe("window.YTD.tweets.part0");
    expect(result.archive.recordCount).toBe(1);
    const firstRecord = result.archive.records[0] as { tweet?: { id_str?: string } } | undefined;
    expect(firstRecord?.tweet?.id_str).toBe("1800000000000000001");
  });

  it("does not execute JavaScript around the assignment", () => {
    const parser = new TweetsJsParser();
    const marker = "__x_builder_archive_parser_executed";
    const previous = (globalThis as Record<string, unknown>)[marker];

    try {
      delete (globalThis as Record<string, unknown>)[marker];

      const result = parser.parse(
        `globalThis.${marker} = true;\nwindow.YTD.tweets.part0 = [{"tweet":{"id":"1"}}];`,
      );

      expect(result.status).toBe("parsed");
      expect((globalThis as Record<string, unknown>)[marker]).toBeUndefined();
    } finally {
      if (previous === undefined) {
        delete (globalThis as Record<string, unknown>)[marker];
      } else {
        (globalThis as Record<string, unknown>)[marker] = previous;
      }
    }
  });

  it("returns invalid for unrelated archive files and malformed assignments", () => {
    const parser = new TweetsJsParser();

    expect(parser.parse("window.YTD.like.part0 = []").status).toBe("invalid");
    expect(parser.parse("window.YTD.tweets.part0 = [{").status).toBe("invalid");
  });

  it("parses empty tweet arrays with a warning", () => {
    const parser = new TweetsJsParser();

    const result = parser.parse("window.YTD.tweets = [];");

    expect(result.status).toBe("parsed");
    if (result.status !== "parsed") {
      throw new Error("Expected parsed tweets.js contents.");
    }
    expect(result.archive.recordCount).toBe(0);
    expect(result.archive.warnings.map((warning) => warning.code)).toContain("empty_archive");
  });

  it("keeps the parser implementation free of execution APIs", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../tweets-js-parser.ts", import.meta.url)),
      "utf8",
    );

    expect(source).not.toMatch(/\beval\s*\(/);
    expect(source).not.toMatch(/\bFunction\s*\(/);
    expect(source).not.toMatch(/node:vm|from ["']vm["']/);
  });
});

describe("ArchiveTweetNormalizer", () => {
  it("normalizes valid tweet records into canonical own-post inputs", () => {
    const parser = new TweetsJsParser();
    const normalizer = new ArchiveTweetNormalizer();
    const parsed = parser.parse(validTweetsJs);

    if (parsed.status !== "parsed") {
      throw new Error("Expected parsed tweets.js contents.");
    }

    const result = normalizer.normalize({
      archive: parsed.archive,
      importRunId: "import-1",
      sourceHash: "sha256:7a2f4e9c1b3d5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcd",
      importedAt: "2026-06-16T10:00:00.000Z",
    });

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]).toMatchObject({
      id: "x-1800000000000000001",
      platform: "x",
      platformPostId: "1800000000000000001",
      text: "A compact archive post with a #tag https://example.com",
      createdAt: "2024-01-05T12:00:00.000Z",
      kind: "original",
      language: "en",
      entityFlags: {
        hasUrls: true,
        hasMedia: false,
        hasHashtags: true,
        hasMentions: false,
      },
      weakMetrics: {
        favoriteCount: 12,
        retweetCount: 3,
      },
    });
    expect(result.fieldAvailability.favoriteCount).toBe(true);
    expect(result.previewCounts.validPosts).toBe(1);
  });

  it("preserves reply references and classifies repost references", () => {
    const parser = new TweetsJsParser();
    const normalizer = new ArchiveTweetNormalizer();
    const parsed = parser.parse(`window.YTD.tweets.part0 = [
      {
        "tweet": {
          "id_str": "2",
          "full_text": "@nataly agreed",
          "created_at": "Fri Jan 05 13:00:00 +0000 2024",
          "in_reply_to_status_id_str": "1",
          "in_reply_to_user_id_str": "9"
        }
      },
      {
        "tweet": {
          "id_str": "3",
          "full_text": "RT @someone: useful post",
          "created_at": "Fri Jan 05 14:00:00 +0000 2024",
          "retweeted_status": { "id_str": "99" }
        }
      }
    ];`);

    if (parsed.status !== "parsed") {
      throw new Error("Expected parsed tweets.js contents.");
    }

    const result = normalizer.normalize({
      archive: parsed.archive,
      importRunId: "import-1",
      sourceHash: "sha256:7a2f4e9c1b3d5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcd",
      importedAt: "2026-06-16T10:00:00.000Z",
    });

    expect(result.posts[0]?.kind).toBe("reply");
    expect(result.posts[0]?.replyReferences).toEqual({
      inReplyToPostId: "1",
      inReplyToUserId: "9",
    });
    expect(result.posts[1]?.kind).toBe("repost_reference");
  });

  it("keeps valid records and aggregates skip reasons for malformed records", () => {
    const parser = new TweetsJsParser();
    const normalizer = new ArchiveTweetNormalizer();
    const parsed = parser.parse(`window.YTD.tweets.part0 = [
      { "tweet": { "id_str": "1", "full_text": "Valid", "created_at": "Fri Jan 05 12:00:00 +0000 2024" } },
      { "tweet": { "full_text": "Missing id", "created_at": "Fri Jan 05 12:00:00 +0000 2024" } },
      { "tweet": { "id_str": "3", "full_text": "", "created_at": "Fri Jan 05 12:00:00 +0000 2024" } },
      { "tweet": { "id_str": "4", "full_text": "Bad date", "created_at": "not a date" } },
      { "notTweet": true }
    ];`);

    if (parsed.status !== "parsed") {
      throw new Error("Expected parsed tweets.js contents.");
    }

    const result = normalizer.normalize({
      archive: parsed.archive,
      importRunId: "import-1",
      sourceHash: "sha256:7a2f4e9c1b3d5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcd",
      importedAt: "2026-06-16T10:00:00.000Z",
    });

    expect(result.posts).toHaveLength(1);
    expect(result.skipped).toEqual([
      { reason: "missing_id", count: 1 },
      { reason: "missing_text", count: 1 },
      { reason: "malformed_date", count: 1 },
      { reason: "unsupported_record_shape", count: 1 },
    ]);
    expect(result.previewCounts.skippedRecords).toBe(4);
  });
});
