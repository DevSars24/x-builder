import type { Candidate, GenerateIdeaRequest, GenerateIdeaResponse } from "@x-builder/shared";
import { scoreCandidate } from "../scoring/deterministic-scorer";

const formats = ["one_liner", "mini_framework", "debate_question"] as const;

export function generateCandidates(request: GenerateIdeaRequest): GenerateIdeaResponse {
  const ideaId = `idea_${Date.now()}`;
  const candidates = formats.map((format, index) => {
    const text = draftTextForFormat(request.idea, format);

    return {
      id: `cand_${ideaId}_${index + 1}`,
      ideaId,
      format,
      text,
      deterministicScores: scoreCandidate({ text, format }),
      reasons: ["Matches requested format", "Specific enough for a first pass"],
      risks: ["Needs voice profile before final publish"]
    } satisfies Candidate;
  });

  return { ideaId, candidates };
}

function draftTextForFormat(idea: string, format: (typeof formats)[number]): string {
  if (format === "one_liner") {
    return `Most founders do not need more content ideas. They need a sharper opinion about ${idea}.`;
  }

  if (format === "mini_framework") {
    return `The way I think about ${idea}:\n\n1. Find the real constraint.\n2. Remove the polite explanation.\n3. Say the part operators actually feel.`;
  }

  return `What is the point where ${idea} stops being a useful discipline and starts becoming theater?`;
}
