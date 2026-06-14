import { describe, expect, it } from "vitest";

import {
  computeRepeatMultiplier,
  computeStatusMultiplier,
  estimateEngagementRange,
  staticQualityCompression,
} from "../prediction-estimator";
import { bannedClaimPattern, buildReachInput } from "./test-helpers";

describe("prediction-estimator", () => {
  it("keeps engagement prediction math stable", () => {
    const prediction = estimateEngagementRange({
      text: "Clear writing compounds when the point is specific.",
      score: 66,
      format: "insight_share",
      followers: 1000,
    });

    expect(prediction).toEqual({
      rangeLow: 160,
      rangeHigh: 372,
      midpoint: 266,
      confidence: "medium",
      signals: [
        {
          signal_key: "quality_voice",
          label: "Static score 66 (-30%)",
          multiplier: 0.7,
        },
        {
          signal_key: "format_insight_share",
          label: "Insight format -5%",
          multiplier: 0.95,
        },
      ],
    });
  });

  it("does not use an implicit follower fallback", () => {
    const prediction = estimateEngagementRange({
      text: "Clear writing compounds when the point is specific.",
      score: 66,
      format: "insight_share",
      followers: undefined,
    });

    expect(prediction).toBeNull();
  });

  it("documents timely wording math without live-trend copy claims", () => {
    const prediction = estimateEngagementRange({
      text: "AI onboarding gets easier when the first run has one clear success moment.",
      score: 66,
      format: "insight_share",
      followers: 1000,
    });

    const signal = prediction?.signals.find((item) => item.signal_key === "zeitgeist");

    expect(signal).toMatchObject({
      signal_key: "zeitgeist",
      multiplier: 1.15,
    });
    expect(signal?.label).not.toMatch(bannedClaimPattern);
  });
});

describe("staticQualityCompression", () => {
  it.each([
    [92, 1.3],
    [90, 1.3],
    [70, 1.1],
    [50, 1.0],
    [25, 0.8],
    [24, 0.6],
    [10, 0.6],
  ])("maps a static score of %s to the compression factor %s", (score, factor) => {
    expect(staticQualityCompression(score)).toBe(factor);
  });
});

describe("computeRepeatMultiplier", () => {
  it("decays a matching format by the repeat base raised to its recent count", () => {
    const input = buildReachInput({
      format: "hot_take",
      repeatHistory: [
        { format: "hot_take", lastPostedAt: "2026-06-13T10:00:00.000Z", countLast7d: 2 },
      ],
    });

    expect(computeRepeatMultiplier(input.repeatHistory, input.format)).toBeCloseTo(0.3025, 6);
  });

  it("floors the decay at the repeat floor for a heavily repeated format", () => {
    const input = buildReachInput({
      format: "hot_take",
      repeatHistory: [
        { format: "hot_take", lastPostedAt: "2026-06-13T10:00:00.000Z", countLast7d: 10 },
      ],
    });

    expect(computeRepeatMultiplier(input.repeatHistory, input.format)).toBe(0.2);
  });

  it("returns 1 when no history entry matches the current format", () => {
    const input = buildReachInput({
      format: "hot_take",
      repeatHistory: [
        { format: "story", lastPostedAt: "2026-06-13T10:00:00.000Z", countLast7d: 5 },
      ],
    });

    expect(computeRepeatMultiplier(input.repeatHistory, input.format)).toBe(1);
  });

  it("returns 1 when the repeat history is empty", () => {
    const input = buildReachInput({ format: "hot_take", repeatHistory: [] });

    expect(computeRepeatMultiplier(input.repeatHistory, input.format)).toBe(1);
  });
});

describe("computeStatusMultiplier", () => {
  it("floors a low-follower wisdom_one_liner at the status minimum", () => {
    expect(computeStatusMultiplier("wisdom_one_liner", 1400)).toBe(0.3);
  });

  it("returns the neutral status for a wisdom_one_liner at the divisor follower count", () => {
    expect(computeStatusMultiplier("wisdom_one_liner", 20000)).toBe(1.0);
  });

  it("caps a high-follower wisdom_one_liner at the status maximum", () => {
    expect(computeStatusMultiplier("wisdom_one_liner", 58000)).toBe(1.5);
  });

  it("returns 1 for a non-wisdom format regardless of follower count", () => {
    expect(computeStatusMultiplier("hot_take", 1400)).toBe(1);
    expect(computeStatusMultiplier("hot_take", 58000)).toBe(1);
  });

  it("falls back to 1 for a wisdom_one_liner with undefined followers", () => {
    expect(computeStatusMultiplier("wisdom_one_liner", undefined)).toBe(1);
  });
});
