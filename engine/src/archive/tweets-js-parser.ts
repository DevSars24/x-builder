import type { CanonicalOwnPostInput } from "../server/post-library-repository.js";

export type ArchiveWarning = {
  code: string;
  message: string;
};

export type ParsedTweetsArchive = {
  assignmentPath: string;
  recordCount: number;
  records: unknown[];
  warnings: ArchiveWarning[];
};

export type TweetsJsParseResult =
  | {
      status: "parsed";
      archive: ParsedTweetsArchive;
    }
  | {
      status: "invalid";
      reason: "unsupported_assignment" | "malformed_json" | "unsupported_payload";
      warnings: ArchiveWarning[];
    };

export type ArchiveSkipReason =
  | "missing_id"
  | "missing_text"
  | "missing_created_time"
  | "malformed_date"
  | "unsupported_record_shape";

export type ArchiveSkippedRecordSummary = {
  reason: ArchiveSkipReason;
  count: number;
};

export type ArchiveFieldAvailability = {
  postIds: boolean;
  text: boolean;
  createdTimes: boolean;
  replyRefs: boolean;
  language: boolean;
  entities: boolean;
  favoriteCount: boolean;
  retweetCount: boolean;
};

export type ArchivePreviewCounts = {
  totalRecords: number;
  validPosts: number;
  skippedRecords: number;
  originals: number;
  replies: number;
  repostReferences: number;
};

export type ArchiveTweetNormalizeResult = {
  posts: CanonicalOwnPostInput[];
  skipped: ArchiveSkippedRecordSummary[];
  fieldAvailability: ArchiveFieldAvailability;
  previewCounts: ArchivePreviewCounts;
};

export type ArchiveTweetNormalizeInput = {
  archive: ParsedTweetsArchive;
  importRunId: string;
  sourceHash: string;
  importedAt: string;
};

type RawTweetWrapper = {
  tweet: Record<string, unknown>;
};

const assignmentPattern = /window\.YTD\.tweets(?:\.part\d+)?\s*=/;

const skipReasonOrder: ArchiveSkipReason[] = [
  "missing_id",
  "missing_text",
  "missing_created_time",
  "malformed_date",
  "unsupported_record_shape",
];

const emptyAvailability = (): ArchiveFieldAvailability => ({
  postIds: false,
  text: false,
  createdTimes: false,
  replyRefs: false,
  language: false,
  entities: false,
  favoriteCount: false,
  retweetCount: false,
});

export class TweetsJsParser {
  parse(contents: string): TweetsJsParseResult {
    const match = assignmentPattern.exec(contents);

    if (!match) {
      return {
        status: "invalid",
        reason: "unsupported_assignment",
        warnings: [
          {
            code: "unsupported_assignment",
            message: "Select data/tweets.js from the extracted X archive.",
          },
        ],
      };
    }

    const assignmentPath = match[0].replace(/\s*=$/, "").trim();
    const payloadStart = this.findPayloadStart(contents, match.index + match[0].length);

    if (payloadStart === -1) {
      return {
        status: "invalid",
        reason: "malformed_json",
        warnings: [
          {
            code: "malformed_assignment",
            message: "The tweets.js assignment payload could not be read.",
          },
        ],
      };
    }

    const payloadEnd = this.findJsonArrayEnd(contents, payloadStart);

    if (payloadEnd === -1) {
      return {
        status: "invalid",
        reason: "malformed_json",
        warnings: [
          {
            code: "malformed_assignment",
            message: "The tweets.js assignment payload is not valid JSON.",
          },
        ],
      };
    }

    try {
      const payload = JSON.parse(contents.slice(payloadStart, payloadEnd + 1)) as unknown;

      if (!Array.isArray(payload)) {
        return {
          status: "invalid",
          reason: "unsupported_payload",
          warnings: [
            {
              code: "unsupported_payload",
              message: "The tweets.js assignment did not contain an array.",
            },
          ],
        };
      }

      return {
        status: "parsed",
        archive: {
          assignmentPath,
          recordCount: payload.length,
          records: payload,
          warnings:
            payload.length === 0
              ? [
                  {
                    code: "empty_archive",
                    message: "The tweets.js file did not contain tweet records.",
                  },
                ]
              : [],
        },
      };
    } catch {
      return {
        status: "invalid",
        reason: "malformed_json",
        warnings: [
          {
            code: "malformed_assignment",
            message: "The tweets.js assignment payload is not valid JSON.",
          },
        ],
      };
    }
  }

  private findPayloadStart(contents: string, startIndex: number): number {
    for (let index = startIndex; index < contents.length; index += 1) {
      const char = contents[index];

      if (char === "[") {
        return index;
      }

      if (char && !/\s/.test(char)) {
        return -1;
      }
    }

    return -1;
  }

  private findJsonArrayEnd(contents: string, startIndex: number): number {
    let depth = 0;
    let inString = false;
    let escaping = false;

    for (let index = startIndex; index < contents.length; index += 1) {
      const char = contents[index];

      if (inString) {
        if (escaping) {
          escaping = false;
        } else if (char === "\\") {
          escaping = true;
        } else if (char === '"') {
          inString = false;
        }

        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === "[") {
        depth += 1;
      } else if (char === "]") {
        depth -= 1;

        if (depth === 0) {
          return index;
        }
      }
    }

    return -1;
  }
}

export class ArchiveTweetNormalizer {
  normalize(input: ArchiveTweetNormalizeInput): ArchiveTweetNormalizeResult {
    const fieldAvailability = emptyAvailability();
    const skipCounts = new Map<ArchiveSkipReason, number>();
    const posts: CanonicalOwnPostInput[] = [];
    const previewCounts: ArchivePreviewCounts = {
      totalRecords: input.archive.recordCount,
      validPosts: 0,
      skippedRecords: 0,
      originals: 0,
      replies: 0,
      repostReferences: 0,
    };

    for (const record of input.archive.records) {
      const wrapper = this.asTweetWrapper(record);

      if (!wrapper) {
        this.addSkip(skipCounts, "unsupported_record_shape");
        continue;
      }

      const tweet = wrapper.tweet;
      this.captureAvailability(fieldAvailability, tweet);

      const id = this.stringField(tweet, "id_str") ?? this.stringField(tweet, "id");
      const text = this.stringField(tweet, "full_text") ?? this.stringField(tweet, "text");
      const createdAtRaw = this.stringField(tweet, "created_at");

      if (!id) {
        this.addSkip(skipCounts, "missing_id");
        continue;
      }

      if (!text || text.trim().length === 0) {
        this.addSkip(skipCounts, "missing_text");
        continue;
      }

      if (!createdAtRaw) {
        this.addSkip(skipCounts, "missing_created_time");
        continue;
      }

      const createdAt = this.parseDate(createdAtRaw);

      if (!createdAt) {
        this.addSkip(skipCounts, "malformed_date");
        continue;
      }

      const kind = this.kindFor(tweet, text);
      const favoriteCount = this.numericField(tweet, "favorite_count");
      const retweetCount = this.numericField(tweet, "retweet_count");
      const weakMetrics = {
        ...(favoriteCount === undefined ? {} : { favoriteCount }),
        ...(retweetCount === undefined ? {} : { retweetCount }),
      };

      posts.push({
        id: `x-${id}`,
        platform: "x",
        platformPostId: id,
        text,
        createdAt,
        kind,
        language: this.stringField(tweet, "lang"),
        replyReferences: {
          ...(this.stringField(tweet, "in_reply_to_status_id_str") ??
          this.stringField(tweet, "in_reply_to_status_id")
            ? {
                inReplyToPostId:
                  this.stringField(tweet, "in_reply_to_status_id_str") ??
                  this.stringField(tweet, "in_reply_to_status_id"),
              }
            : {}),
          ...(this.stringField(tweet, "in_reply_to_user_id_str") ??
          this.stringField(tweet, "in_reply_to_user_id")
            ? {
                inReplyToUserId:
                  this.stringField(tweet, "in_reply_to_user_id_str") ??
                  this.stringField(tweet, "in_reply_to_user_id"),
              }
            : {}),
        },
        entityFlags: this.entityFlags(tweet),
        weakMetrics,
        metricSnapshots:
          favoriteCount === undefined && retweetCount === undefined
            ? []
            : [
                {
                  source: "archive_tweets_js",
                  observedAt: createdAt,
                  importedAt: input.importedAt,
                  ...weakMetrics,
                },
              ],
        sourceRefs: [
          {
            source: "archive_tweets_js",
            importRunId: input.importRunId,
            rawId: id,
            sourceHash: input.sourceHash,
          },
        ],
      });

      previewCounts.validPosts += 1;
      if (kind === "original") {
        previewCounts.originals += 1;
      } else if (kind === "reply") {
        previewCounts.replies += 1;
      } else if (kind === "repost_reference") {
        previewCounts.repostReferences += 1;
      }
    }

    previewCounts.skippedRecords = Array.from(skipCounts.values()).reduce(
      (total, count) => total + count,
      0,
    );

    return {
      posts,
      skipped: skipReasonOrder.flatMap((reason) => {
        const count = skipCounts.get(reason) ?? 0;

        return count > 0 ? [{ reason, count }] : [];
      }),
      fieldAvailability,
      previewCounts,
    };
  }

  private asTweetWrapper(record: unknown): RawTweetWrapper | null {
    if (!record || typeof record !== "object" || !("tweet" in record)) {
      return null;
    }

    const tweet = (record as { tweet: unknown }).tweet;

    if (!tweet || typeof tweet !== "object" || Array.isArray(tweet)) {
      return null;
    }

    return { tweet: tweet as Record<string, unknown> };
  }

  private addSkip(skipCounts: Map<ArchiveSkipReason, number>, reason: ArchiveSkipReason): void {
    skipCounts.set(reason, (skipCounts.get(reason) ?? 0) + 1);
  }

  private captureAvailability(
    availability: ArchiveFieldAvailability,
    tweet: Record<string, unknown>,
  ): void {
    availability.postIds ||= this.hasStringField(tweet, "id_str") || this.hasStringField(tweet, "id");
    availability.text ||= this.hasStringField(tweet, "full_text") || this.hasStringField(tweet, "text");
    availability.createdTimes ||= this.hasStringField(tweet, "created_at");
    availability.replyRefs ||=
      this.hasStringField(tweet, "in_reply_to_status_id_str") ||
      this.hasStringField(tweet, "in_reply_to_status_id") ||
      this.hasStringField(tweet, "in_reply_to_user_id_str") ||
      this.hasStringField(tweet, "in_reply_to_user_id");
    availability.language ||= this.hasStringField(tweet, "lang");
    availability.entities ||= "entities" in tweet || "extended_entities" in tweet;
    availability.favoriteCount ||= this.numericField(tweet, "favorite_count") !== undefined;
    availability.retweetCount ||= this.numericField(tweet, "retweet_count") !== undefined;
  }

  private kindFor(tweet: Record<string, unknown>, text: string): CanonicalOwnPostInput["kind"] {
    if ("retweeted_status" in tweet || text.trimStart().startsWith("RT @")) {
      return "repost_reference";
    }

    if (
      this.hasStringField(tweet, "in_reply_to_status_id_str") ||
      this.hasStringField(tweet, "in_reply_to_status_id")
    ) {
      return "reply";
    }

    return "original";
  }

  private entityFlags(tweet: Record<string, unknown>): CanonicalOwnPostInput["entityFlags"] {
    const entities = this.objectField(tweet, "entities");
    const extendedEntities = this.objectField(tweet, "extended_entities");

    return {
      hasUrls: this.hasArrayItems(entities?.urls),
      hasMedia: this.hasArrayItems(entities?.media) || this.hasArrayItems(extendedEntities?.media),
      hasHashtags: this.hasArrayItems(entities?.hashtags),
      hasMentions: this.hasArrayItems(entities?.user_mentions),
    };
  }

  private hasArrayItems(value: unknown): boolean {
    return Array.isArray(value) && value.length > 0;
  }

  private objectField(
    value: Record<string, unknown>,
    field: string,
  ): Record<string, unknown> | undefined {
    const fieldValue = value[field];

    return fieldValue && typeof fieldValue === "object" && !Array.isArray(fieldValue)
      ? (fieldValue as Record<string, unknown>)
      : undefined;
  }

  private stringField(value: Record<string, unknown>, field: string): string | undefined {
    const fieldValue = value[field];

    if (typeof fieldValue === "string" && fieldValue.length > 0) {
      return fieldValue;
    }

    if (typeof fieldValue === "number" && Number.isFinite(fieldValue)) {
      return String(fieldValue);
    }

    return undefined;
  }

  private hasStringField(value: Record<string, unknown>, field: string): boolean {
    return this.stringField(value, field) !== undefined;
  }

  private numericField(value: Record<string, unknown>, field: string): number | undefined {
    const fieldValue = value[field];

    if (typeof fieldValue === "number" && Number.isInteger(fieldValue) && fieldValue >= 0) {
      return fieldValue;
    }

    if (typeof fieldValue === "string" && /^\d+$/.test(fieldValue)) {
      return Number.parseInt(fieldValue, 10);
    }

    return undefined;
  }

  private parseDate(value: string): string | undefined {
    const timestamp = Date.parse(value);

    return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
  }
}
