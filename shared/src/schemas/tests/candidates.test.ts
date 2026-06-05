import { describe, expect, it } from "vitest";
import { generateIdeaRequestSchema } from "../candidates";

describe("generateIdeaRequestSchema", () => {
  it("applies defaults for known post references", () => {
    const parsed = generateIdeaRequestSchema.parse({ idea: "Build in public without becoming noisy" });

    expect(parsed.useKnownPostIds).toEqual([]);
  });
});
