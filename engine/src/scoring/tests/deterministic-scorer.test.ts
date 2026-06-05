import { describe, expect, it } from "vitest";
import { scoreCandidate } from "../deterministic-scorer";

describe("scoreCandidate", () => {
  it("returns bounded heuristic scores", () => {
    const result = scoreCandidate({
      format: "debate_question",
      text: "What is the point where shipping daily stops helping founders and starts becoming theater?"
    });

    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThanOrEqual(100);
  });
});
