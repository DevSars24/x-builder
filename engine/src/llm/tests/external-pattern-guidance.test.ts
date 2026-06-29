import { describe, expect, expectTypeOf, it } from "vitest";
import type { DetectedPostFormat, ExternalXSignalPattern } from "@x-builder/shared";

import type {
  ExternalPatternGuidanceItem,
  ExternalPatternGuidanceProvider,
  ExternalPatternGuidanceRequest,
} from "../external-pattern-guidance.js";
import type { GenerationGuidanceRequest } from "../generation-guidance.js";

type ExternalPatternGuidanceModule = {
  renderExternalPatternGuidance?: (items: ExternalPatternGuidanceItem[]) => string | undefined;
};

const loadExternalPatternGuidance = async (): Promise<ExternalPatternGuidanceModule> =>
  import("../external-pattern-guidance.js") as Promise<ExternalPatternGuidanceModule>;

const loadRenderer = async () => {
  const module = await loadExternalPatternGuidance();

  expect(module.renderExternalPatternGuidance).toBeTypeOf("function");

  return module.renderExternalPatternGuidance!;
};

const guidanceItem = (
  overrides: Partial<ExternalPatternGuidanceItem> = {},
): ExternalPatternGuidanceItem => ({
  id: overrides.id ?? "pattern-1",
  patternType: overrides.patternType ?? "hook",
  statement:
    overrides.statement ??
    "Open with a concrete proof point before naming the broader lesson.",
  confidence: overrides.confidence ?? 0.82,
  supportCount: overrides.supportCount ?? 8,
  generatedAt: overrides.generatedAt ?? "2026-06-29T08:00:00.000Z",
  version: overrides.version ?? "external-x-signals:v1",
  ...(overrides.format === undefined ? {} : { format: overrides.format }),
});

const rendered = async (items: ExternalPatternGuidanceItem[]): Promise<string | undefined> => {
  const renderExternalPatternGuidance = await loadRenderer();

  return renderExternalPatternGuidance(items);
};

describe("external pattern guidance", () => {
  it("exports the documented external guidance contracts", async () => {
    const module = await loadExternalPatternGuidance();

    expect(module.renderExternalPatternGuidance).toBeTypeOf("function");

    expectTypeOf<ExternalPatternGuidanceItem>().toEqualTypeOf<{
      id: string;
      patternType: ExternalXSignalPattern["patternType"];
      format?: DetectedPostFormat;
      statement: string;
      confidence: number;
      supportCount: number;
      generatedAt: string;
      version: string;
    }>();

    expectTypeOf<ExternalPatternGuidanceRequest>().toEqualTypeOf<
      GenerationGuidanceRequest & {
        maxPatterns?: number;
        minConfidence?: number;
        minSupportCount?: number;
      }
    >();

    expectTypeOf<ExternalPatternGuidanceProvider>().toEqualTypeOf<
      (request: ExternalPatternGuidanceRequest) => Promise<ExternalPatternGuidanceItem[]>
    >();
  });

  it("renders only sanitized statement metadata from external patterns", async () => {
    const guidance = await rendered([
      {
        ...guidanceItem({
          id: "pattern-with-sensitive-source",
          patternType: "format",
          format: "genuine_question",
          statement: "Ask the sharp tradeoff before giving advice.",
          confidence: 0.91,
          supportCount: 11,
          generatedAt: "2026-06-28T10:00:00.000Z",
          version: "external-x-signals:v1",
        }),
        label: "INVENTED LABEL SENTINEL",
        sourceIds: ["source-secret-1"],
        evidenceIds: ["evidence-secret-1"],
        evidence: [
          {
            evidenceId: "evidence-secret-1",
            sourceId: "source-secret-1",
            screenName: "external_builder",
            platformPostId: "1800000000000000001",
            text: "RAW EXTERNAL PREVIEW SENTINEL",
            metrics: { likes: 123, reposts: 7 },
          },
        ],
      } as ExternalPatternGuidanceItem & Record<string, unknown>,
    ]);

    expect(guidance).toBeDefined();
    expect(guidance).toContain("# External performance patterns (derived constraints, not voice)");
    expect(guidance).toContain("weak writing constraints");
    expect(guidance).toContain("not author voice");
    expect(guidance).toContain("Ask the sharp tradeoff before giving advice.");
    expect(guidance).toContain("format");
    expect(guidance).toContain("genuine_question");
    expect(guidance).toContain("0.91");
    expect(guidance).toContain("11");
    expect(guidance).not.toContain("INVENTED LABEL SENTINEL");
    expect(guidance).not.toContain("source-secret-1");
    expect(guidance).not.toContain("evidence-secret-1");
    expect(guidance).not.toContain("external_builder");
    expect(guidance).not.toContain("1800000000000000001");
    expect(guidance).not.toContain("RAW EXTERNAL PREVIEW SENTINEL");
    expect(guidance).not.toContain("likes");
    expect(guidance).not.toContain("123");
  });

  it("renders at most four default items in provider order", async () => {
    const firstProviderStatement = "Provider first: lead with the late zebra proof.";
    const secondProviderStatement = "Provider second: open with the alpha counterexample.";
    const thirdProviderStatement = "Provider third: anchor the newest omega lesson.";
    const fourthProviderStatement = "Provider fourth: use the beta operator receipt.";
    const fifthProviderStatement = "Provider fifth sentinel: sorted aardvark should be excluded.";

    const guidance = await rendered([
      guidanceItem({
        id: "pattern-z-provider-first",
        statement: firstProviderStatement,
        confidence: 0.31,
        generatedAt: "2026-06-29T09:00:00.000Z",
      }),
      guidanceItem({
        id: "pattern-a-provider-second",
        statement: secondProviderStatement,
        confidence: 0.87,
        generatedAt: "2026-06-26T09:00:00.000Z",
      }),
      guidanceItem({
        id: "pattern-y-provider-third",
        statement: thirdProviderStatement,
        confidence: 0.44,
        generatedAt: "2026-06-28T09:00:00.000Z",
      }),
      guidanceItem({
        id: "pattern-b-provider-fourth",
        statement: fourthProviderStatement,
        confidence: 0.72,
        generatedAt: "2026-06-27T09:00:00.000Z",
      }),
      guidanceItem({
        id: "pattern-c-provider-fifth",
        statement: fifthProviderStatement,
        confidence: 0.99,
        generatedAt: "2026-06-30T09:00:00.000Z",
      }),
    ]);

    expect(guidance).toBeDefined();
    expect(guidance).toContain(firstProviderStatement);
    expect(guidance).toContain(secondProviderStatement);
    expect(guidance).toContain(thirdProviderStatement);
    expect(guidance).toContain(fourthProviderStatement);
    expect(guidance).not.toContain(fifthProviderStatement);

    const renderedPositions = [
      firstProviderStatement,
      secondProviderStatement,
      thirdProviderStatement,
      fourthProviderStatement,
    ].map((statement) => guidance!.indexOf(statement));

    expect(renderedPositions).toEqual([...renderedPositions].sort((a, b) => a - b));
  });

  it("returns no section when there are no guidance items", async () => {
    await expect(rendered([])).resolves.toBeUndefined();
  });

  it("keeps rendered guidance within the default character budget", async () => {
    const guidance = await rendered([
      guidanceItem({
        statement: `START ${"long statement ".repeat(120)} END_SENTINEL`,
      }),
    ]);

    expect(guidance).toBeDefined();
    expect(guidance!.length).toBeLessThanOrEqual(1_200);
    expect(guidance).toContain("# External performance patterns");
    expect(guidance).not.toContain("END_SENTINEL");
  });

  it("renders provided format metadata", async () => {
    const guidance = await rendered([
      guidanceItem({
        patternType: "format",
        format: "hot_take",
        statement: "Name the contrarian claim before the supporting evidence.",
      }),
    ]);

    expect(guidance).toBeDefined();
    expect(guidance).toContain("Name the contrarian claim before the supporting evidence.");
    expect(guidance).toMatch(/\bformat\b/i);
    expect(guidance).toContain("hot_take");
  });

  it("renders a pattern without inventing a missing format", async () => {
    const guidance = await rendered([
      guidanceItem({
        statement: "Use proof before naming the broader lesson.",
      }),
    ]);

    expect(guidance).toBeDefined();
    expect(guidance).toContain("Use proof before naming the broader lesson.");
    expect(guidance).not.toMatch(/\bformat\b/i);
    expect(guidance).not.toContain("undefined");
    expect(guidance).not.toContain("unknown");
    expect(guidance).not.toContain("none");
    expect(guidance).not.toContain("other");
    expect(guidance).not.toContain("hot_take");
    expect(guidance).not.toContain("genuine_question");
  });
});
