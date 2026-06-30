import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const runtimeContractFiles = [
  "shared/src/schemas/deterministic-analysis.ts",
  "engine/src/deterministic/types.ts",
  "engine/src/deterministic/format-classifier.ts",
  "engine/src/deterministic/prediction-estimator.ts",
  "engine/src/deterministic/const/reach-model-weights.ts",
  "engine/src/deterministic/deterministic-analysis-service.ts",
  "engine/src/server/server.ts",
  "engine/src/server/routes.ts",
  "engine/src/server/default-services.ts",
  "engine/src/llm/judge-draft-service.ts",
  "engine/src/llm/generate-ideas-service.ts",
  "overlay/src/compose/static-engine-column.tsx",
  "overlay/src/compose/compose-cockpit.tsx",
  "tools/calibration/src/fit.ts",
] as const;

const userFacingCopyFiles = [
  "overlay/src/compose/static-engine-column.tsx",
  "overlay/src/compose/compose-cockpit.tsx",
  "engine/src/llm/judge-draft-service.ts",
  "docs/how-to/estimate-post-reach.md",
] as const;

const forbiddenRuntimePatterns = [
  /\bscoringContext\s*\.\s*amplifier\b/,
  /\beventContext\b/,
  /\bamplifierType\b/,
  /\bfounder_story_event\b/,
  /\bfounder_story_personal_stakes\b/,
  /\bfounder_story_reuse_decay\b/,
  /\bjudge\s+amplifier\s+dimension/i,
  /\bamplifier\s+ui\s+control/i,
] as const;

const forbiddenCopyPatterns = [
  /\badd hardship\b/i,
  /\bmake it more emotional\b/i,
  /\bshare something vulnerable\b/i,
  /\badd personal stakes\b/i,
  /\breveal more\b/i,
  /\buse adversity\b/i,
  /\buse trauma\b/i,
] as const;

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

function violations(
  files: readonly string[],
  patterns: readonly RegExp[],
  options: { stripSourceComments?: boolean } = {},
): string[] {
  const matches: string[] = [];

  for (const relativePath of files) {
    const raw = readFileSync(join(repoRoot, relativePath), "utf8");
    const source = options.stripSourceComments === true ? stripComments(raw) : raw;

    for (const pattern of patterns) {
      if (pattern.test(source)) {
        matches.push(`${relativePath}: ${pattern.source}`);
      }
    }
  }

  return matches;
}

describe("founder-story reach amplifier boundary policy", () => {
  it("scans real, readable runtime and user-facing source files", () => {
    for (const relativePath of [...runtimeContractFiles, ...userFacingCopyFiles]) {
      const source = readFileSync(join(repoRoot, relativePath), "utf8");
      expect(source.length, `${relativePath} must be readable`).toBeGreaterThan(0);
    }
  });

  it("finds no amplifier-shaped runtime fields in the founder-story runtime paths", () => {
    expect(
      violations(runtimeContractFiles, forbiddenRuntimePatterns, {
        stripSourceComments: true,
      }),
    ).toEqual([]);
  });

  it("finds no emotional-growth prompt copy in runtime UI, judge prompts, or reach docs", () => {
    expect(violations(userFacingCopyFiles, forbiddenCopyPatterns)).toEqual([]);
  });

  it("detects synthetic runtime and copy violations with the same matchers", () => {
    expect(violationsFromSource("const x = { amplifierType: 'founder_story_event' }", forbiddenRuntimePatterns)).not.toEqual([]);
    expect(violationsFromSource("Make it more emotional by adding personal stakes.", forbiddenCopyPatterns)).not.toEqual([]);
  });
});

function violationsFromSource(source: string, patterns: readonly RegExp[]): string[] {
  return patterns
    .filter((pattern) => pattern.test(source))
    .map((pattern) => pattern.source);
}
