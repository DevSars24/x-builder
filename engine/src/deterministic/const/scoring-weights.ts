import type { PostFormat } from "../types.js";

export const checkScorePoints = {
  pass: 1,
  warn: 0.5,
  fail: 0,
} as const;

export const scoreDefaults = {
  fullScore: 100,
  qualityFloor: 40,
  qualityRange: 60,
  tooShortMaximum: 25,
  thinDraftMaximum: 65,
} as const;

export const engagementPredictionWeights = {
  baseImpressionsPerThousandFollowers: 400,
  minimumFollowerScale: 0.2,
  maximumFollowerScale: 10,
  minimumTextLength: 15,
  highSignalUncertainty: 0.25,
  mediumSignalUncertainty: 0.4,
  lowSignalUncertainty: 0.6,
  highConfidenceSignalCount: 4,
  mediumConfidenceSignalCount: 2,
  highConfidenceScoreMinimum: 70,
  mediumConfidenceScoreMinimum: 50,
  timelyTermMaximumBonus: 0.4,
  timelyTermBonusPerMatch: 0.15,
  tensionMultiplier: 1.25,
} as const;

export const staticScoreQualityMultipliers = [
  { minimumScore: 90, multiplier: 4 },
  { minimumScore: 80, multiplier: 2.2 },
  { minimumScore: 70, multiplier: 1.4 },
  { minimumScore: 50, multiplier: 0.7 },
  { minimumScore: 0, multiplier: 0.35 },
] as const;

export const formatEngagementMultipliers: Record<PostFormat, number> = {
  one_liner: 0.84,
  genuine_question: 1.05,
  hot_take: 1.16,
  audience_question: 0.99,
  story: 1.18,
  insight_share: 0.95,
  goal_share: 0.99,
  ab_choice: 1.03,
  connect: 1.27,
  other: 1,
  fill_blank_tribal: 1,
  cta_farm: 1,
  fantasy_question: 1,
  binary_choice: 1,
  nuanced_question: 1,
  recognition_roast: 1,
  wisdom_one_liner: 1,
  milestone: 1,
};

export const postCoachScoreBands = {
  topTierMinimum: 85,
  shipItMinimum: 60,
  almostThereMinimum: 45,
  targetScore: 60,
} as const;
