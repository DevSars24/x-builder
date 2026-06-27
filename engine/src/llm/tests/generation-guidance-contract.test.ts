import { describe, expect, it } from "vitest";
import { detectedPostFormatSchema, type DetectedPostFormat } from "@x-builder/shared";

type MappingEntry = {
  sectionIds?: unknown;
  priority?: unknown;
  includeFallbackGeneral?: unknown;
  founderStoryGuardrail?: unknown;
};

type GuidanceContractModule = {
  formatPlaybookMapping?: Record<string, MappingEntry>;
};

const loadGuidanceContract = async (): Promise<GuidanceContractModule> =>
  import("../generation-guidance.js") as Promise<GuidanceContractModule>;

const detectedFormats = detectedPostFormatSchema.options as DetectedPostFormat[];

const mappingEntries = async () => {
  const { formatPlaybookMapping } = await loadGuidanceContract();

  expect(formatPlaybookMapping).toBeDefined();
  expect(formatPlaybookMapping).not.toBeNull();
  expect(typeof formatPlaybookMapping).toBe("object");

  return formatPlaybookMapping!;
};

describe("generation guidance playbook mapping", () => {
  it("maps every detected post format exactly once", async () => {
    const mapping = await mappingEntries();

    expect(Object.keys(mapping).sort()).toEqual([...detectedFormats].sort());
  });

  it.each(detectedFormats)("declares explicit playbook selection for %s", async (format) => {
    const mapping = await mappingEntries();
    const entry = mapping[format];

    expect(entry).toBeDefined();
    expect(entry?.sectionIds).toEqual(expect.any(Array));
    expect(entry?.sectionIds).not.toHaveLength(0);
    expect(entry?.sectionIds).toEqual(
      expect.arrayContaining([expect.stringMatching(/^[a-z0-9][a-z0-9-]*$/)]),
    );
    expect(entry?.priority).toSatisfy((value) => value === "primary" || value === "secondary");
    expect(typeof entry?.includeFallbackGeneral).toBe("boolean");
  });

  it("keeps the catch-all format limited to general guidance", async () => {
    const mapping = await mappingEntries();

    expect(mapping.other).toMatchObject({
      sectionIds: ["general"],
      priority: "secondary",
      includeFallbackGeneral: true,
    });
  });

  it("exposes a no-emotional-generation guardrail for founder story guidance", async () => {
    const mapping = await mappingEntries();

    expect(mapping.founder_story).toMatchObject({
      founderStoryGuardrail: {
        preserveUserSuppliedStakes: true,
        forbidInventedEmotionalContent: true,
      },
    });
  });
});
