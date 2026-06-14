import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  analyzePostsResponseSchema,
  judgeDraftResponseSchema,
  type AnalyzedPostItem,
  type AppSettings,
  type AnalyzePostsRequest,
  type AnalyzePostsResponse,
  type JudgeVerdict,
} from "@x-builder/shared";
import { describe, expect, it, vi } from "vitest";

import { JsonFileAppSettingsRepository } from "../settings-repository";
import { buildServer } from "../server";

// Two-pass reach + judge-bridge integration, exercised end-to-end through the
// real /posts/analyze route -> DeterministicAnalysisService.analyzePosts ->
// computeReachModel path and the real /drafts/judge route -> settings fallback.
// The ONLY stubbed seam is the judge LLM (an in-process fake), which is the
// genuine external boundary; no CLI is ever spawned and no real ~/.x-builder is
// touched (a temp-root settings repository backs the settings flows).

const parseJson = (payload: string): unknown => JSON.parse(payload);

const parseAnalyze = (payload: string): AnalyzePostsResponse =>
  analyzePostsResponseSchema.parse(parseJson(payload));

// A draft long enough to clear the reach-model minimum-length gate and concrete
// enough to score a stable static verdict across both passes.
const draftText =
  "genuine question: which onboarding signal first told you the product was finally landing for real users?";

const analyzePayload = (
  scoringContext: AnalyzePostsRequest["scoringContext"],
): AnalyzePostsRequest => ({
  items: [
    {
      id: "candidate-1",
      text: draftText,
      sourceFormat: "debate-question",
    },
  ],
  scoringContext,
  presentation: {
    postCoachMode: "preview",
  },
});

const expectScored = (
  item: AnalyzedPostItem | undefined,
): Extract<AnalyzedPostItem, { status: "scored" }> => {
  if (!item || item.status !== "scored") {
    throw new Error("Expected a scored deterministic analysis item.");
  }

  return item;
};

const expectAvailable = (
  item: Extract<AnalyzedPostItem, { status: "scored" }>,
): Extract<
  Extract<AnalyzedPostItem, { status: "scored" }>["prediction"],
  { status: "available" }
> => {
  if (item.prediction.status !== "available") {
    throw new Error("Expected an available engagement prediction.");
  }

  return item.prediction;
};

// Analyze a single draft end-to-end through the real route + service + estimator
// and return the (asserted-200) parsed response.
const analyzeDraft = async (
  scoringContext: AnalyzePostsRequest["scoringContext"],
): Promise<AnalyzePostsResponse> => {
  const app = buildServer();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/posts/analyze",
      payload: analyzePayload(scoringContext),
    });

    expect(response.statusCode).toBe(200);

    return parseAnalyze(response.body);
  } finally {
    await app.close();
  }
};

describe("two-pass analyze + judge-bridge integration — user flows", () => {
  // FLOW 1: pass-1 (no judgeSignals) yields a static four-regime prediction with
  // both ranges ordered and none of the deleted legacy mirror fields.
  it("returns a static four-regime prediction with ordered ranges and no legacy fields when no judge signals are supplied", async () => {
    const result = await analyzeDraft({ followers: 2400 });
    const prediction = expectAvailable(expectScored(result.items[0]));

    expect(prediction.qualityBasis).toBe("static");

    // All four-regime fields present.
    expect(prediction.predictedMidImpressions).toBeGreaterThanOrEqual(1);
    expect(prediction.stallRange).toBeDefined();
    expect(prediction.escapeRange).toBeDefined();
    expect(prediction.escapeProbability).toBeGreaterThanOrEqual(0);
    expect(prediction.escapeProbability).toBeLessThanOrEqual(1);
    expect(prediction.expectedReplies).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(prediction.signals)).toBe(true);

    // Both ranges ordered (low <= high).
    expect(prediction.stallRange.low).toBeLessThanOrEqual(prediction.stallRange.high);
    expect(prediction.escapeRange.low).toBeLessThanOrEqual(prediction.escapeRange.high);

    // None of the deleted legacy mirror fields survive the boundary.
    expect(prediction).not.toHaveProperty("rangeLow");
    expect(prediction).not.toHaveProperty("rangeHigh");
    expect(prediction).not.toHaveProperty("midpoint");
    expect(prediction).not.toHaveProperty("confidence");
  });

  // FLOW 2: pass-2 (judgeSignals present) flips qualityBasis to "judge" and the
  // judged-quality multiplier moves the reach relative to pass-1 for the same
  // draft. Judged impressions=100 -> ceiling 2.5, above the max static lift 1.3,
  // so the midpoint must change.
  it("returns a judge-basis prediction whose reach differs from pass-1 for the same draft when judge signals are supplied", async () => {
    const pass1 = expectAvailable(expectScored((await analyzeDraft({ followers: 2400 })).items[0]));
    const pass2 = expectAvailable(
      expectScored(
        (
          await analyzeDraft({
            followers: 2400,
            judgeSignals: { impressions: 100, replies: 80 },
          })
        ).items[0],
      ),
    );

    expect(pass1.qualityBasis).toBe("static");
    expect(pass2.qualityBasis).toBe("judge");
    expect(pass2.predictedMidImpressions).not.toBe(pass1.predictedMidImpressions);
  });

  // FLOW 4: a context with ONLY a trailing median (no followers) yields an
  // available prediction anchored on the trailing median — not a disabled /
  // missing_followers response (the RMU-006 disabled-guard fix).
  it("returns an available trailing-median prediction when only a trailing median is supplied without followers", async () => {
    const result = await analyzeDraft({ trailingMedianImpressions: 900 });
    const item = expectScored(result.items[0]);

    expect(item.prediction.status).toBe("available");

    const prediction = expectAvailable(item);
    expect(prediction.baseSource).toBe("trailing_median");
    expect(prediction.baseSource).not.toBe("follower_estimate");
  });
});

// FLOW 3 lives against the real /drafts/judge route with a temp-root settings
// repository and an in-process judge fake that records the profile it receives.
describe("two-pass analyze + judge-bridge integration — account profile settings fallback", () => {
  // A schema-shaped verdict (13 dims incl. the nullable audienceMatch) the fake
  // reflects: a numeric audienceMatch when a profile arrived, null otherwise.
  const baseVerdict: JudgeVerdict = {
    verdict: "slight_rework",
    confidence: "medium",
    scores: {
      overall: 78,
      replies: 80,
      profileClicks: 72,
      impressions: 65,
      bookmarkValue: 60,
      dwellProxy: 70,
      voiceMatch: 85,
      negativeRisk: 10,
      answerEffort: 55,
      strangerAnswerability: 48,
      statusDependency: 30,
      replyVsQuoteOrientation: 62,
      audienceMatch: null,
    },
    headline: "Solid hook, weak closer.",
    strengths: ["Clear, concrete claim"],
    improvements: ["Cut the last sentence"],
  };

  const profileCapturingJudge = () => {
    const received: Array<string | undefined> = [];

    const judge = vi.fn(async (_text: string, accountProfile?: string) => {
      received.push(accountProfile);

      return {
        status: "judged" as const,
        response: {
          status: "judged" as const,
          verdict: {
            ...baseVerdict,
            scores: {
              ...baseVerdict.scores,
              audienceMatch: accountProfile === undefined ? null : 64,
            },
          },
          model: "codex-cli",
          judgedAt: "2026-06-10T12:00:00.000Z",
        },
      };
    });

    return { judge, received };
  };

  const withSettingsRoot = async <T,>(
    run: (repository: JsonFileAppSettingsRepository) => Promise<T>,
  ): Promise<T> => {
    const root = await mkdtemp(join(tmpdir(), "x-builder-two-pass-profile-"));

    try {
      return await run(new JsonFileAppSettingsRepository({ root }));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  };

  const persistedSettings = (root: string, accountProfile: string): AppSettings =>
    ({
      engineBaseUrl: "http://127.0.0.1:4173",
      storagePath: join(root, "storage"),
      judgeProvider: "codex-cli",
      showDeterministicDetails: true,
      accountProfile,
    }) as AppSettings;

  it("threads the persisted account profile into the judge and yields a non-null audienceMatch when the body omits one", async () => {
    const settingsProfile = "Solo founder writing about local-first dev tooling.";

    await withSettingsRoot(async (settingsRepository) => {
      const saved = await settingsRepository.save(
        persistedSettings(settingsRepository.defaults().storagePath, settingsProfile),
      );
      expect(saved.settings.accountProfile).toBe(settingsProfile);

      const { judge, received } = profileCapturingJudge();
      const app = buildServer({ judgeDraftService: { judge }, settingsRepository });

      try {
        const response = await app.inject({
          method: "POST",
          url: "/drafts/judge",
          payload: { text: "A draft judged with the settings profile." },
        });

        expect(response.statusCode).toBe(200);
        // The judge fake RECEIVED the settings value (no body override).
        expect(received).toEqual([settingsProfile]);

        const body = judgeDraftResponseSchema.parse(parseJson(response.body));
        expect(body.verdict.scores.audienceMatch).not.toBeNull();
        expect(body.verdict.scores.audienceMatch).toBe(64);
      } finally {
        await app.close();
      }
    });
  });
});

describe("two-pass analyze + judge-bridge integration — architectural invariants", () => {
  // INVARIANT A: an available prediction carries every four-regime field and the
  // qualityBasis, and both ranges are ordered. Falsifiable: a facade dropping any
  // regime field (the schema parse rejects it) or emitting an unordered range
  // (the reachRange refine rejects it) fails this.
  it("carries every four-regime field with ordered ranges and a quality basis on an available prediction", async () => {
    const result = await analyzeDraft({ followers: 3600 });
    const prediction = expectAvailable(expectScored(result.items[0]));

    for (const field of [
      "predictedMidImpressions",
      "stallRange",
      "escapeRange",
      "escapeProbability",
      "expectedReplies",
      "signals",
      "qualityBasis",
    ] as const) {
      expect(prediction, `available prediction must carry ${field}`).toHaveProperty(field);
    }

    expect(prediction.qualityBasis).toBe("static");
    expect(prediction.stallRange.low).toBeLessThanOrEqual(prediction.stallRange.high);
    expect(prediction.escapeRange.low).toBeLessThanOrEqual(prediction.escapeRange.high);
  });

  // INVARIANT B: the transitional legacy shim is gone. Falsifiable: a facade
  // leaving rangeLow/rangeHigh/midpoint/confidence on the response fails this.
  it("emits none of the deleted legacy mirror fields on an available prediction", async () => {
    const result = await analyzeDraft({ followers: 3600 });
    const prediction = expectAvailable(expectScored(result.items[0]));

    expect(prediction).not.toHaveProperty("rangeLow");
    expect(prediction).not.toHaveProperty("rangeHigh");
    expect(prediction).not.toHaveProperty("midpoint");
    expect(prediction).not.toHaveProperty("confidence");
  });

  // INVARIANT C: the quality gate is untouched by the judge bridge. Running the
  // SAME draft without then with judgeSignals must leave score and postCoach
  // byte-identical (only the reach quality slot may move). Falsifiable: a facade
  // letting the judge leak into the score/verdict fails this deep-equal.
  it("keeps score and postCoach byte-identical between pass-1 and pass-2 for the same draft", async () => {
    const scored1 = expectScored((await analyzeDraft({ followers: 2400 })).items[0]);
    const scored2 = expectScored(
      (
        await analyzeDraft({
          followers: 2400,
          judgeSignals: { impressions: 100, replies: 80 },
        })
      ).items[0],
    );

    // The judge bridge moved the reach quality slot...
    expect(scored2.prediction.status).toBe("available");
    expect(expectAvailable(scored2).qualityBasis).toBe("judge");
    expect(expectAvailable(scored1).qualityBasis).toBe("static");

    // ...but the quality gate output is identical, byte for byte.
    expect(JSON.stringify(scored2.score)).toBe(JSON.stringify(scored1.score));
    expect(JSON.stringify(scored2.postCoach)).toBe(JSON.stringify(scored1.postCoach));
    expect(scored2.score).toEqual(scored1.score);
    expect(scored2.postCoach).toEqual(scored1.postCoach);
  });

  // INVARIANT D: the deleted 0-10 aiRating / format-history paths are not
  // reachable through the contract. Falsifiable: a facade re-introducing any of
  // those fields onto a scored item or its prediction fails this.
  it("exposes no aiRating or format-history fields on a scored item or its prediction", async () => {
    const result = await analyzeDraft({ followers: 2400 });
    const item = expectScored(result.items[0]);
    const prediction = expectAvailable(item);

    for (const legacyField of [
      "aiRating",
      "formatHistory",
      "format_history",
      "formatHistoryRating",
    ] as const) {
      expect(item, `scored item must not carry ${legacyField}`).not.toHaveProperty(legacyField);
      expect(item.score, `score must not carry ${legacyField}`).not.toHaveProperty(legacyField);
      expect(prediction, `prediction must not carry ${legacyField}`).not.toHaveProperty(
        legacyField,
      );
    }
  });
});
