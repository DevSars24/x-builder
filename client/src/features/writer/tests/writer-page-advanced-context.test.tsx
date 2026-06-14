import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { repeatHistoryEntrySchema } from "@x-builder/shared";
import type {
  AnalyzePostsRequest,
  AnalyzePostsResponse,
  GenerateIdeaRequest,
  GenerateIdeaResponse,
  JudgeDraftRequest,
  JudgeDraftResponse,
} from "@x-builder/shared";

import {
  availablePrediction,
  buildAnalyzeResponse,
  scoredItem,
} from "./analyze-response-builder";

const writerPageModulePath = "../writer-page";

const trailingMedianHelper =
  "Median views of your last 20 original posts — exclude pinned and RTs. Find in X Analytics.";
const plannedHourHelper = "0–23 UTC";
const advancedSummaryLabel = "Advanced context (optional)";
const repeatHistoryCheckboxLabel =
  "I posted something similar in the last 7 days";

type WriterApiClient = {
  analyzePosts: (input: AnalyzePostsRequest) => Promise<AnalyzePostsResponse>;
  generateIdea: (input: GenerateIdeaRequest) => Promise<GenerateIdeaResponse>;
  judgeDraft: (input: JudgeDraftRequest) => Promise<JudgeDraftResponse>;
};

type WriterPageProps = {
  apiClient: WriterApiClient;
  onOpenSettings: () => void;
};

// The public driver gains an advanced-context method in this work. It is declared
// alongside the existing surface so a missing method fails the type-shaped import,
// not just the assertion.
type WriterPagePublicDriver = {
  generate: () => Promise<string>;
  render: () => string;
  scoreDraft: () => Promise<string>;
  updateAdvancedContext: (patch: AdvancedContextPatch) => Promise<string>;
  updateFollowers: (followers: string) => string;
  updateIdea: (idea: string) => string;
};

type AdvancedContextPatch = {
  trailingMedianImpressions?: number;
  repeatHistory?: { similarInLast7Days: boolean; date?: string };
  plannedHourUtc?: number;
  willAttachMedia?: boolean;
  accountAgeYears?: number;
};

type WriterPagePublicDriverOptions = WriterPageProps & {
  renderPage?: (props: WriterPageProps) => ReactElement;
};

type WriterPageModule = {
  WriterPage: (props: WriterPageProps) => ReactElement;
  createWriterPagePublicDriver: (
    options: WriterPagePublicDriverOptions,
  ) => WriterPagePublicDriver;
};

async function loadWriterPage() {
  return (await import(writerPageModulePath)) as WriterPageModule;
}

function textContent(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// Slices the markup to just the advanced-context disclosure so assertions about
// the panel's own fields do not accidentally match identical copy elsewhere.
function advancedPanelHtml(html: string) {
  const summaryIndex = html.indexOf(advancedSummaryLabel);
  expect(summaryIndex).toBeGreaterThanOrEqual(0);
  const start = html.lastIndexOf("<details", summaryIndex);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = html.indexOf("</details>", summaryIndex);
  expect(end).toBeGreaterThan(start);

  return html.slice(start, end + "</details>".length);
}

function defaultIdeaResponse(): GenerateIdeaResponse {
  return {
    candidates: [
      {
        format: "one-liner",
        id: "candidate-one-liner",
        text: "Local-first writing tools need boring edges.",
      },
    ],
  };
}

function createApiClient(
  analyzePosts: WriterApiClient["analyzePosts"],
  generateIdea: WriterApiClient["generateIdea"] = vi.fn(async () =>
    defaultIdeaResponse(),
  ),
): WriterApiClient {
  return {
    analyzePosts,
    generateIdea,
    judgeDraft: vi.fn() as unknown as WriterApiClient["judgeDraft"],
  };
}

function createDriver(
  module: WriterPageModule,
  options: WriterPagePublicDriverOptions,
) {
  return module.createWriterPagePublicDriver(options);
}

// Echoes posted drafts back as scored items so a typed draft renders an
// evaluation while the request shape stays observable through the mock. The
// inferred Mock type is kept (no widening annotation) so `.mock.calls` reads.
function echoScoringAnalyze() {
  return vi.fn<WriterApiClient["analyzePosts"]>(async (request) =>
    buildAnalyzeResponse(request),
  );
}

describe("AdvancedContextPanel rendering", () => {
  it("renders a collapsed disclosure after the manual scoring context panel", async () => {
    const module = await loadWriterPage();
    const driver = createDriver(module, {
      apiClient: createApiClient(echoScoringAnalyze()),
      onOpenSettings: vi.fn(),
      renderPage: module.WriterPage,
    });

    const html = driver.render();
    const panel = advancedPanelHtml(html);

    // Collapsed by default: a <details> with a <summary> and no open attribute.
    expect(panel).toContain("<summary");
    expect(panel).not.toContain("open");
    expect(textContent(panel)).toContain(advancedSummaryLabel);
    expect(html.indexOf('aria-label="Manual account context"')).toBeLessThan(
      html.indexOf(advancedSummaryLabel),
    );
  });

  it("labels the disclosure summary with the type-label token", async () => {
    const module = await loadWriterPage();
    const driver = createDriver(module, {
      apiClient: createApiClient(echoScoringAnalyze()),
      onOpenSettings: vi.fn(),
      renderPage: module.WriterPage,
    });

    const panel = advancedPanelHtml(driver.render());
    const summaryStart = panel.indexOf("<summary");
    const summaryEnd = panel.indexOf("</summary>");
    const summary = panel.slice(summaryStart, summaryEnd);

    expect(summary).toContain("--type-label");
    expect(summary).toContain(advancedSummaryLabel);
  });

  it("renders the advanced numeric and toggle fields with their helper copy", async () => {
    const module = await loadWriterPage();
    const driver = createDriver(module, {
      apiClient: createApiClient(echoScoringAnalyze()),
      onOpenSettings: vi.fn(),
      renderPage: module.WriterPage,
    });

    const panel = advancedPanelHtml(driver.render());
    const panelText = textContent(panel);

    expect(panelText).toContain("Trailing median impressions");
    expect(panelText).toContain(trailingMedianHelper);
    expect(panelText).toContain(repeatHistoryCheckboxLabel);
    expect(panelText).toContain(plannedHourHelper);
    // willAttachMedia renders through the foundation Switch (a native checkbox).
    expect(panel).toContain('type="checkbox"');
    expect(panelText).toContain("Will attach media");
    expect(panelText).toContain("Account age");
  });
});

describe("RepeatHistoryControl", () => {
  it("hides the date input until the similar-post checkbox is checked", async () => {
    const module = await loadWriterPage();
    const driver = createDriver(module, {
      apiClient: createApiClient(echoScoringAnalyze()),
      onOpenSettings: vi.fn(),
      renderPage: module.WriterPage,
    });

    const panel = advancedPanelHtml(driver.render());

    expect(textContent(panel)).toContain(repeatHistoryCheckboxLabel);
    expect(panel).not.toContain('type="date"');
  });

  it("shows a date input once a similar post is reported", async () => {
    const module = await loadWriterPage();
    const driver = createDriver(module, {
      apiClient: createApiClient(echoScoringAnalyze()),
      onOpenSettings: vi.fn(),
      renderPage: module.WriterPage,
    });

    driver.updateIdea("A draft that we report having posted something similar to.");
    const html = await driver.updateAdvancedContext({
      repeatHistory: { similarInLast7Days: true },
    });
    const panel = advancedPanelHtml(html);

    expect(panel).toContain('type="date"');
  });

  it("clears the chosen date when the similar-post checkbox is unchecked", async () => {
    const module = await loadWriterPage();
    const driver = createDriver(module, {
      apiClient: createApiClient(echoScoringAnalyze()),
      onOpenSettings: vi.fn(),
      renderPage: module.WriterPage,
    });

    driver.updateIdea("Unchecking the similar-post box should drop the date.");
    await driver.updateAdvancedContext({
      repeatHistory: { similarInLast7Days: true, date: "2026-06-10" },
    });
    const html = await driver.updateAdvancedContext({
      repeatHistory: { similarInLast7Days: false },
    });
    const panel = advancedPanelHtml(html);

    expect(panel).not.toContain('type="date"');
    expect(panel).not.toContain("2026-06-10");
  });
});

describe("AdvancedContextPanel scoring-context wiring", () => {
  it("spreads a planned hour into the analyze scoringContext", async () => {
    const module = await loadWriterPage();
    const analyzePosts = echoScoringAnalyze();
    const driver = createDriver(module, {
      apiClient: createApiClient(analyzePosts),
      onOpenSettings: vi.fn(),
      renderPage: module.WriterPage,
    });

    driver.updateIdea("Planned hour should ride along in the scoring context.");
    await driver.updateAdvancedContext({ plannedHourUtc: 20 });
    await driver.scoreDraft();

    expect(analyzePosts).toHaveBeenCalled();
    const request = analyzePosts.mock.calls.at(-1)?.[0];
    expect(request?.scoringContext.plannedHourUtc).toBe(20);
  });

  it("omits advanced keys from scoringContext when advanced fields are cleared", async () => {
    const module = await loadWriterPage();
    const analyzePosts = echoScoringAnalyze();
    const driver = createDriver(module, {
      apiClient: createApiClient(analyzePosts),
      onOpenSettings: vi.fn(),
      renderPage: module.WriterPage,
    });

    driver.updateIdea("Clearing advanced inputs leaves a bare scoring context.");
    await driver.updateAdvancedContext({ plannedHourUtc: 8 });
    await driver.updateAdvancedContext({ plannedHourUtc: undefined });
    await driver.scoreDraft();

    expect(analyzePosts).toHaveBeenCalled();
    const request = analyzePosts.mock.calls.at(-1)?.[0];
    expect(request?.scoringContext).toEqual({});
  });

  it("keeps follower context unchanged when advanced fields are present", async () => {
    const module = await loadWriterPage();
    const analyzePosts = echoScoringAnalyze();
    const driver = createDriver(module, {
      apiClient: createApiClient(analyzePosts),
      onOpenSettings: vi.fn(),
      renderPage: module.WriterPage,
    });

    driver.updateFollowers("2400");
    driver.updateIdea("Advanced fields must not disturb the follower context.");
    await driver.updateAdvancedContext({ plannedHourUtc: 8 });
    await driver.scoreDraft();

    const request = analyzePosts.mock.calls.at(-1)?.[0];
    expect(request?.scoringContext.followers).toBe(2400);
    expect(request?.scoringContext.plannedHourUtc).toBe(8);
  });

  it("emits one repeat-history entry when a similar recent post is reported", async () => {
    const module = await loadWriterPage();
    const analyzePosts = echoScoringAnalyze();
    const driver = createDriver(module, {
      apiClient: createApiClient(analyzePosts),
      onOpenSettings: vi.fn(),
      renderPage: module.WriterPage,
    });

    driver.updateIdea("Reporting a recent similar post adds repeat history.");
    await driver.updateAdvancedContext({
      repeatHistory: { similarInLast7Days: true, date: "2026-06-10" },
    });
    await driver.scoreDraft();

    const request = analyzePosts.mock.calls.at(-1)?.[0];
    const repeatHistory = request?.scoringContext.repeatHistory;
    expect(repeatHistory).toHaveLength(1);
    const entry = repeatHistory?.[0];
    expect(entry?.countLast7d).toBe(1);
    expect(entry?.lastPostedAt).toContain("2026-06-10");
    // The entry must be a schema-valid repeat-history record (format is a
    // detected-post-format chosen by the producer; pin its validity, not its value).
    expect(repeatHistoryEntrySchema.safeParse(entry).success).toBe(true);
  });

  it("defaults the repeat-history timestamp to now when no date is chosen", async () => {
    const module = await loadWriterPage();
    const analyzePosts = echoScoringAnalyze();
    const driver = createDriver(module, {
      apiClient: createApiClient(analyzePosts),
      onOpenSettings: vi.fn(),
      renderPage: module.WriterPage,
    });

    driver.updateIdea("A similar post with no date still carries a timestamp.");
    await driver.updateAdvancedContext({
      repeatHistory: { similarInLast7Days: true },
    });
    await driver.scoreDraft();

    const request = analyzePosts.mock.calls.at(-1)?.[0];
    const entry = request?.scoringContext.repeatHistory?.[0];
    expect(request?.scoringContext.repeatHistory).toHaveLength(1);
    expect(entry?.countLast7d).toBe(1);
    expect(repeatHistoryEntrySchema.safeParse(entry).success).toBe(true);
  });

  it("omits repeat history when no similar post is reported", async () => {
    const module = await loadWriterPage();
    const analyzePosts = echoScoringAnalyze();
    const driver = createDriver(module, {
      apiClient: createApiClient(analyzePosts),
      onOpenSettings: vi.fn(),
      renderPage: module.WriterPage,
    });

    driver.updateIdea("Saying no similar post omits repeat history entirely.");
    await driver.updateAdvancedContext({
      repeatHistory: { similarInLast7Days: false },
    });
    await driver.scoreDraft();

    const request = analyzePosts.mock.calls.at(-1)?.[0];
    expect(request?.scoringContext.repeatHistory).toBeUndefined();
  });

  it("omits repeat history after a similar post is checked then unchecked", async () => {
    const module = await loadWriterPage();
    const analyzePosts = echoScoringAnalyze();
    const driver = createDriver(module, {
      apiClient: createApiClient(analyzePosts),
      onOpenSettings: vi.fn(),
      renderPage: module.WriterPage,
    });

    driver.updateIdea("Toggling the similar-post box off removes repeat history.");
    await driver.updateAdvancedContext({
      repeatHistory: { similarInLast7Days: true, date: "2026-06-10" },
    });
    await driver.updateAdvancedContext({
      repeatHistory: { similarInLast7Days: false },
    });
    await driver.scoreDraft();

    const request = analyzePosts.mock.calls.at(-1)?.[0];
    expect(request?.scoringContext.repeatHistory).toBeUndefined();
  });
});

describe("AdvancedContextPanel planned-hour validation", () => {
  it("shows an inline field error and does not send an out-of-range planned hour", async () => {
    const module = await loadWriterPage();
    const analyzePosts = echoScoringAnalyze();
    const driver = createDriver(module, {
      apiClient: createApiClient(analyzePosts),
      onOpenSettings: vi.fn(),
      renderPage: module.WriterPage,
    });

    driver.updateIdea("An invalid planned hour should never reach the request.");
    const html = await driver.updateAdvancedContext({ plannedHourUtc: 25 });
    const panel = advancedPanelHtml(html);

    // Inline error rendered through the foundation Input error region.
    expect(panel).toContain("xb-input__error");
    await driver.scoreDraft();

    const request = analyzePosts.mock.calls.at(-1)?.[0];
    expect(request?.scoringContext.plannedHourUtc).toBeUndefined();
  });
});

describe("advanced context edge cases", () => {
  it("sends a trailing median even when followers are empty and keeps the prediction available", async () => {
    const module = await loadWriterPage();
    // The engine guard from RMU-006 anchors the base on the trailing median, so
    // an empty follower count still yields an available prediction.
    const analyzePosts = vi.fn<WriterApiClient["analyzePosts"]>(async (request) =>
      buildAnalyzeResponse(request, {
        "draft-post": scoredItem(
          {
            id: "draft-post",
            text: request.items[0]?.text ?? "",
          },
          {
            prediction: availablePrediction({
              baseSource: "trailing_median",
              baseImpressions: 1800,
            }),
          },
        ),
      }),
    );
    const driver = createDriver(module, {
      apiClient: createApiClient(analyzePosts),
      onOpenSettings: vi.fn(),
      renderPage: module.WriterPage,
    });

    driver.updateIdea("Trailing median should drive prediction without followers.");
    await driver.updateAdvancedContext({ trailingMedianImpressions: 1800 });
    const html = await driver.scoreDraft();
    const text = textContent(html);

    const request = analyzePosts.mock.calls.at(-1)?.[0];
    expect(request?.scoringContext.trailingMedianImpressions).toBe(1800);
    expect(request?.scoringContext.followers).toBeUndefined();
    expect(text).toContain("800 – 2,400");
    expect(text).not.toContain("Prediction needs follower count.");
  });

  it("ignores a whitespace-only repeat-history date", async () => {
    const module = await loadWriterPage();
    const analyzePosts = echoScoringAnalyze();
    const driver = createDriver(module, {
      apiClient: createApiClient(analyzePosts),
      onOpenSettings: vi.fn(),
      renderPage: module.WriterPage,
    });

    driver.updateIdea("Whitespace dates should not become a lastPostedAt value.");
    await driver.updateAdvancedContext({
      repeatHistory: { similarInLast7Days: true, date: "   " },
    });
    await driver.scoreDraft();

    const request = analyzePosts.mock.calls.at(-1)?.[0];
    const entry = request?.scoringContext.repeatHistory?.[0];
    expect(request?.scoringContext.repeatHistory).toHaveLength(1);
    expect(entry?.lastPostedAt.trim().length).toBeGreaterThan(0);
    expect(repeatHistoryEntrySchema.safeParse(entry).success).toBe(true);
  });
});
