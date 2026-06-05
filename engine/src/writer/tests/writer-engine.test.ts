import { describe, expect, it } from "vitest";
import { generateCandidates } from "../writer-engine";

describe("generateCandidates", () => {
  it("returns one candidate for each required writer format", () => {
    const result = generateCandidates({ idea: "shipping daily", useKnownPostIds: [] });

    expect(result.candidates.map((candidate) => candidate.format)).toEqual([
      "one_liner",
      "mini_framework",
      "debate_question"
    ]);
  });
});
