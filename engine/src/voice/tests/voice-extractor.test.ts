import { describe, expect, it } from "vitest";
import { extractVoiceProfile } from "../voice-extractor";

describe("extractVoiceProfile", () => {
  it("extracts a default local voice profile", () => {
    const profile = extractVoiceProfile(["Founders building agents need better observability."]);

    expect(profile.enabled).toBe(true);
    expect(profile.tone).toContain("founder-led");
  });
});
