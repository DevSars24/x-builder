import type { DeterministicScores, PostFormat } from "@x-builder/shared";

type ScoreInput = {
  text: string;
  format: Exclude<PostFormat, "unknown">;
};

export function scoreCandidate(input: ScoreInput): DeterministicScores {
  const lengthScore = scoreLength(input.text);
  const questionBonus = input.text.includes("?") ? 10 : 0;
  const specificity = /\b(founder|operator|build|ship|customer|product|team)\b/i.test(input.text) ? 12 : 0;

  const reach = clamp(lengthScore + specificity);
  const engagement = clamp(lengthScore + questionBonus + (input.format === "debate_question" ? 10 : 0));
  const impressions = clamp(lengthScore + firstLineStrength(input.text));
  const voiceMatch = 50;
  const overall = Math.round(reach * 0.35 + engagement * 0.3 + impressions * 0.2 + voiceMatch * 0.15);

  return {
    reach,
    engagement,
    impressions,
    voiceMatch,
    overall,
    band: scoreBand(overall)
  };
}

function scoreLength(text: string): number {
  const length = text.length;
  if (length < 70) return 78;
  if (length < 180) return 84;
  if (length < 280) return 72;
  return 55;
}

function firstLineStrength(text: string): number {
  const firstLine = text.split("\n")[0] ?? "";
  return firstLine.length > 0 && firstLine.length <= 140 ? 8 : 0;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreBand(score: number): DeterministicScores["band"] {
  if (score >= 90) return "strong";
  if (score >= 75) return "good";
  if (score >= 60) return "usable";
  return "needs_rewrite";
}
