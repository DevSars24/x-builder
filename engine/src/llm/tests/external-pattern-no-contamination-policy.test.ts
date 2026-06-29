import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import * as ts from "typescript";

type ForbiddenModule = {
  label: string;
  sourceUrl: URL;
};

const forbiddenModules: ForbiddenModule[] = [
  {
    label: "PostLibraryRepository",
    sourceUrl: new URL("../../server/post-library-repository.ts", import.meta.url),
  },
  {
    label: "SqlitePostLibraryRepository",
    sourceUrl: new URL("../../server/sqlite-post-library-repository.ts", import.meta.url),
  },
  {
    label: "JudgeDraftService",
    sourceUrl: new URL("../judge-draft-service.ts", import.meta.url),
  },
  {
    label: "ApplyJudgeSuggestionsService",
    sourceUrl: new URL("../apply-judge-suggestions-service.ts", import.meta.url),
  },
  {
    label: "FeedbackLoopService",
    sourceUrl: new URL("../../feedback/feedback-loop-service.ts", import.meta.url),
  },
  {
    label: "GenerateCategoryService",
    sourceUrl: new URL("../../suggest/generate-category-service.ts", import.meta.url),
  },
  {
    label: "SuggestPostService",
    sourceUrl: new URL("../../suggest/suggest-post-service.ts", import.meta.url),
  },
  {
    label: "RepetitionWindowService",
    sourceUrl: new URL("../../capture/repetition-window-service.ts", import.meta.url),
  },
  {
    label: "LiveCaptureService",
    sourceUrl: new URL("../../capture/live-capture-service.ts", import.meta.url),
  },
  {
    label: "LiveContextResolver",
    sourceUrl: new URL("../../capture/live-context-resolver.ts", import.meta.url),
  },
  {
    label: "ArchiveDerivedContextService",
    sourceUrl: new URL("../../archive/archive-derived-context-service.ts", import.meta.url),
  },
  {
    label: "ArchiveImportService",
    sourceUrl: new URL("../../archive/archive-import-service.ts", import.meta.url),
  },
  {
    label: "ImportPostLibraryJson",
    sourceUrl: new URL("../../server/import-post-library-json.ts", import.meta.url),
  },
  {
    label: "DeterministicAnalysisService",
    sourceUrl: new URL("../../deterministic/deterministic-analysis-service.ts", import.meta.url),
  },
  {
    label: "Analyzer",
    sourceUrl: new URL("../../deterministic/analyzer.ts", import.meta.url),
  },
];

const forbiddenExternalModuleFragments = [
  "/external/",
  "external-pattern-guidance",
  "external-x-signals",
];

const forbiddenExternalImportName = /^(ExternalPattern|ExternalXSignal)/;

const forbiddenExternalBarrelExportNames = new Set([
  "SqliteExternalXSignalsRepository",
  "ExternalXSignalsRepository",
  "ExternalXSignalsService",
  "ExternalXSignalsServiceOptions",
  "ExternalXSignalsWriteResult",
  "ExternalXObservedTimelineBatch",
  "ExternalXObservedTimelinePost",
  "ExternalXObservedTimelineResult",
  "createExternalPatternGuidanceProvider",
  "ExternalPatternGuidanceProvider",
  "ExternalPatternSnapshotReader",
]);

const isForbiddenExternalImportName = (name: string): boolean =>
  forbiddenExternalImportName.test(name) || forbiddenExternalBarrelExportNames.has(name);

const isEngineBarrelImport = (modulePath: string): boolean =>
  modulePath === "@x-builder/engine" ||
  modulePath.endsWith("/index.js") ||
  modulePath.endsWith("/index");

const importViolations = (label: string, sourcePath: string, source: string): string[] => {
  const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true);
  const violations: string[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }

    const modulePath = statement.moduleSpecifier.text;
    if (forbiddenExternalModuleFragments.some((fragment) => modulePath.includes(fragment))) {
      violations.push(`${label} imports ${modulePath}`);
    }

    const namedBindings = statement.importClause?.namedBindings;
    if (namedBindings === undefined) {
      continue;
    }

    if (ts.isNamespaceImport(namedBindings)) {
      if (isEngineBarrelImport(modulePath)) {
        violations.push(`${label} imports namespace ${namedBindings.name.text} from ${modulePath}`);
      }
      continue;
    }

    if (!ts.isNamedImports(namedBindings)) {
      continue;
    }

    for (const element of namedBindings.elements) {
      const importedName = (element.propertyName ?? element.name).text;
      if (isForbiddenExternalImportName(importedName)) {
        violations.push(`${label} imports ${importedName} from ${modulePath}`);
      }
    }
  }

  return violations;
};

describe("external pattern no-contamination policy", () => {
  it("keeps forbidden own-corpus, judge, apply, feedback, category, cooldown, capture, archive, and scoring modules off external pattern imports", async () => {
    const violations = (
      await Promise.all(
        forbiddenModules.map(async ({ label, sourceUrl }) => {
          const source = await readFile(sourceUrl, "utf8");
          return importViolations(label, sourceUrl.pathname, source);
        }),
      )
    ).flat();

    expect(violations).toEqual([]);
  });

  it("flags external pattern consumers imported indirectly through a barrel", () => {
    const source = [
      'import { createExternalPatternGuidanceProvider as guidanceProvider } from "../../index.js";',
      'import { SqliteExternalXSignalsRepository } from "@x-builder/engine";',
      'import * as localEngine from "../../index.js";',
      'import * as extensionlessLocalEngine from "../../index";',
      'import * as packageEngine from "@x-builder/engine";',
    ].join("\n");

    expect(importViolations("ForbiddenConsumer", "forbidden-consumer.ts", source)).toEqual([
      "ForbiddenConsumer imports createExternalPatternGuidanceProvider from ../../index.js",
      "ForbiddenConsumer imports SqliteExternalXSignalsRepository from @x-builder/engine",
      "ForbiddenConsumer imports namespace localEngine from ../../index.js",
      "ForbiddenConsumer imports namespace extensionlessLocalEngine from ../../index",
      "ForbiddenConsumer imports namespace packageEngine from @x-builder/engine",
    ]);
  });
});
