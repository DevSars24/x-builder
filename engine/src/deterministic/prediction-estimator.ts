import {
  engagementPredictionWeights,
  formatEngagementMultipliers,
  staticScoreQualityMultipliers,
} from "./const/scoring-weights.js";
import { predictionFormatLabels } from "./format-classifier.js";
import { timelyTopicTerms } from "./rule-lexicon.js";
import type {
  EngagementPrediction,
  PostFormat,
  PredictionSignal,
} from "./types.js";

const fallbackStaticScoreBand =
  staticScoreQualityMultipliers[staticScoreQualityMultipliers.length - 1]!;

function chooseQualityMultiplier(score: number): {
  signalKey: string;
  label: string;
  multiplier: number;
} {
  const scoreBand = staticScoreQualityMultipliers.find(
    (band) => score >= band.minimumScore,
  ) ?? fallbackStaticScoreBand;

  return {
    signalKey: "quality_voice",
    label: `Static score ${score}`,
    multiplier: scoreBand.multiplier,
  };
}

function buildMultiplierLabel(label: string, multiplier: number): string {
  return `${label} (${multiplier > 1 ? "+" : "-"}${Math.round(
    Math.abs(multiplier - 1) * 100,
  )}%)`;
}

export function estimateEngagementRange(input: {
  text: string;
  score: number;
  format: PostFormat;
  followers: number | undefined;
}): EngagementPrediction | null {
  const {
    text,
    score,
    format,
    followers,
  } = input;
  const trimmedText = text.trim();

  if (
    followers === undefined ||
    trimmedText.length < engagementPredictionWeights.minimumTextLength
  ) {
    return null;
  }

  const lowerText = trimmedText.toLowerCase();
  const signals: PredictionSignal[] = [];
  const followerScale = Math.min(
    engagementPredictionWeights.maximumFollowerScale,
    Math.max(
      engagementPredictionWeights.minimumFollowerScale,
      followers / 1000,
    ),
  );
  const baseImpressions =
    engagementPredictionWeights.baseImpressionsPerThousandFollowers * followerScale;
  const qualitySignal = chooseQualityMultiplier(score);

  if (qualitySignal.multiplier !== 1) {
    signals.push({
      signal_key: qualitySignal.signalKey,
      label: buildMultiplierLabel(qualitySignal.label, qualitySignal.multiplier),
      multiplier: qualitySignal.multiplier,
    });
  }

  const formatMultiplier = formatEngagementMultipliers[format] ?? 1;

  if (formatMultiplier !== 1) {
    signals.push({
      signal_key: `format_${format}`,
      label: `${predictionFormatLabels[format] ?? "Other"} format ${
        formatMultiplier > 1 ? "+" : ""
      }${Math.round((formatMultiplier - 1) * 100)}%`,
      multiplier: formatMultiplier,
    });
  }

  const timelyTermCount = timelyTopicTerms.filter((term) =>
    new RegExp(`\\b${term}\\b`, "i").test(lowerText),
  ).length;

  if (timelyTermCount > 0) {
    const timelyMultiplier =
      1 +
      Math.min(
        engagementPredictionWeights.timelyTermMaximumBonus,
        engagementPredictionWeights.timelyTermBonusPerMatch * timelyTermCount,
      );

    signals.push({
      signal_key: "zeitgeist",
      label: "Timely wording",
      multiplier: timelyMultiplier,
    });
  }

  if (/\b(but|yet|never|actually|instead|however|rather|despite|supposed to)\b/i.test(trimmedText)) {
    signals.push({
      signal_key: "tension_contradiction",
      label: "Tension / contradiction +25%",
      multiplier: engagementPredictionWeights.tensionMultiplier,
    });
  }

  const midpointRaw = signals.reduce(
    (value, signal) => value * signal.multiplier,
    baseImpressions,
  );
  const uncertainty =
    signals.length >= engagementPredictionWeights.highConfidenceSignalCount
      ? engagementPredictionWeights.highSignalUncertainty
      : signals.length >= engagementPredictionWeights.mediumConfidenceSignalCount
        ? engagementPredictionWeights.mediumSignalUncertainty
        : engagementPredictionWeights.lowSignalUncertainty;
  const confidence =
    signals.length >= engagementPredictionWeights.highConfidenceSignalCount &&
    score >= engagementPredictionWeights.highConfidenceScoreMinimum
      ? "high"
      : signals.length >= engagementPredictionWeights.mediumConfidenceSignalCount &&
          score >= engagementPredictionWeights.mediumConfidenceScoreMinimum
        ? "medium"
        : "low";

  return {
    rangeLow: Math.round(midpointRaw * (1 - uncertainty)),
    rangeHigh: Math.round(midpointRaw * (1 + uncertainty)),
    midpoint: Math.round(midpointRaw),
    confidence,
    signals,
  };
}
