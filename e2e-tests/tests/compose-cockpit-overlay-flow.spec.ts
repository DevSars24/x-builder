// E2E: runner ⇄ local mock x.com — the compose-cockpit overlay flows + the
// invariants that depend on the rendered overlay.
//
// Each test boots a real RunnerApp against the route-mocked x.com, injects the
// real @x-builder/overlay bundle, mounts it, and drives the compose flow through
// the SAME transport bindings the production overlay consumes — with only the LLM
// provider faked (deterministic, per-purpose) and a ready-judge readiness service.
// Assertions use semantic selectors (role/text the cockpit renders) and Playwright
// auto-waiting; there are NO hard sleeps, positional selectors, or timing
// assumptions.
//
// Playwright's locators pierce OPEN shadow roots, so getByText/getByRole reach
// into the overlay's <xb-overlay-root> shadow tree (mode "open", per bootstrap).

import { expect, test, type Locator, type Page } from "@playwright/test";

import { startRunner, type RunnerHarness } from "./support/runner-harness";

// The mock composer (X's contenteditable). Typing into it drives ComposeContext.
function composer(page: Page): Locator {
  return page.locator('div[data-testid="tweetTextarea_0"]');
}

// Type `text` into the contenteditable composer as a real user would. The cockpit
// reads the composer's textContent (debounced ~350 ms) to drive analyze/judge.
async function typeDraft(page: Page, text: string): Promise<void> {
  const el = composer(page);
  await el.click();
  await el.fill(""); // contenteditable fill clears
  await page.keyboard.type(text);
}

const REPLY_TARGET = {
  displayName: "Alice Example",
  handle: "alice",
  statusId: "1930000000000000001",
  text: "Shipping the small boring thing is usually the move that compounds.",
  url: "https://x.com/alice/status/1930000000000000001",
} as const;

type TransportMethod = RunnerHarness["transportCalls"][number]["method"];

function callsFor(h: RunnerHarness, method: TransportMethod) {
  return h.transportCalls.filter((call) => call.method === method);
}

function lastCallArg(h: RunnerHarness, method: TransportMethod): any {
  const calls = callsFor(h, method);
  const last = calls[calls.length - 1];
  expect(last, `expected a ${method} transport call`).toBeDefined();
  return last?.arg;
}

async function waitForCall(h: RunnerHarness, method: TransportMethod): Promise<any> {
  await expect.poll(() => callsFor(h, method).length).toBeGreaterThan(0);
  return lastCallArg(h, method);
}

function expectReplyContext(value: unknown): void {
  expect(value).toMatchObject({
    source: "same_dialog_dom",
    targetAuthorHandle: REPLY_TARGET.handle,
    targetDisplayName: REPLY_TARGET.displayName,
    targetText: REPLY_TARGET.text,
    targetStatusId: REPLY_TARGET.statusId,
    targetUrl: REPLY_TARGET.url,
    leadingTargetHandle: {
      handle: REPLY_TARGET.handle,
      state: "present",
    },
  });
}

function expectNoReplyContextOnCall(call: RunnerHarness["transportCalls"][number]): void {
  const arg = call.arg as any;
  if (Array.isArray(arg?.items)) {
    for (const item of arg.items) {
      expect(item).not.toHaveProperty("replyContext");
    }
    return;
  }
  expect(arg).not.toHaveProperty("replyContext");
}

function expectNoReplyContextOnTransportCalls(h: RunnerHarness): void {
  expect(h.transportCalls.length).toBeGreaterThan(0);
  for (const call of h.transportCalls) {
    expectNoReplyContextOnCall(call);
  }
}

async function seedReplyDialog(
  page: Page,
  options: { composerText?: string; missingTextEvidence?: boolean } = {},
): Promise<void> {
  await page.evaluate(
    ({ target, composerText, missingTextEvidence }) => {
      const dialog = document.querySelector('[role="dialog"]');
      const composerEl = document.querySelector('div[data-testid="tweetTextarea_0"]');
      if (!(dialog instanceof HTMLElement) || !(composerEl instanceof HTMLElement)) {
        throw new Error("Mock X composer dialog is not available.");
      }

      dialog.querySelector('[data-xb-reply-target="true"]')?.remove();

      const article = document.createElement("article");
      article.setAttribute("data-testid", "tweet");
      article.setAttribute("data-xb-reply-target", "true");

      const displayName = document.createElement("div");
      displayName.textContent = target.displayName;
      article.append(displayName);

      const status = document.createElement("a");
      status.href = target.url;
      status.textContent = `@${target.handle}`;
      article.append(status);

      if (!missingTextEvidence) {
        const text = document.createElement("div");
        text.setAttribute("data-testid", "tweetText");
        text.textContent = target.text;
        article.append(text);
      }

      dialog.insertBefore(article, composerEl);
      composerEl.textContent = composerText ?? `@${target.handle} `;
      composerEl.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
    },
    {
      target: REPLY_TARGET,
      composerText: options.composerText,
      missingTextEvidence: options.missingTextEvidence ?? false,
    },
  );
}

async function appendToComposer(page: Page, text: string): Promise<void> {
  const el = composer(page);
  await el.click();
  await page.evaluate(() => {
    const composerEl = document.querySelector('div[data-testid="tweetTextarea_0"]');
    if (!(composerEl instanceof HTMLElement)) {
      throw new Error("Mock X composer is not available.");
    }
    const range = document.createRange();
    range.selectNodeContents(composerEl);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.keyboard.type(text);
}

async function setComposerText(page: Page, text: string): Promise<void> {
  await page.evaluate((nextText) => {
    const composerEl = document.querySelector('div[data-testid="tweetTextarea_0"]');
    if (!(composerEl instanceof HTMLElement)) {
      throw new Error("Mock X composer is not available.");
    }
    composerEl.textContent = nextText;
    composerEl.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
  }, text);
}

async function waitForReplyContextReady(h: RunnerHarness): Promise<void> {
  const originalText = (await composer(h.page).textContent()) ?? "";
  h.transportCalls.splice(0);
  await appendToComposer(h.page, "readiness probe");
  await expect
    .poll(() =>
      callsFor(h, "analyzePosts").some((call) => {
        const item = (call.arg as any)?.items?.[0];
        return item?.text === "readiness probe" && item.replyContext?.targetStatusId === REPLY_TARGET.statusId;
      }),
    )
    .toBe(true);
  await setComposerText(h.page, originalText);
  h.transportCalls.splice(0);
  await expect(composer(h.page)).toHaveText(originalText);
}

async function runJudge(page: Page): Promise<void> {
  const run = page.getByRole("button", { name: "Run judge" });
  await expect(run).toBeVisible();
  await run.click();
}

async function installPostClickCounter(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as typeof window & { __xbPostClickCount?: number };
    win.__xbPostClickCount = 0;
    const postButton = document.querySelector('div[data-testid="tweetButton"]');
    if (!(postButton instanceof HTMLElement)) {
      throw new Error("Mock X post button is not available.");
    }
    postButton.addEventListener("click", () => {
      win.__xbPostClickCount = (win.__xbPostClickCount ?? 0) + 1;
    });
  });
}

async function expectNoPostClicks(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => (window as typeof window & { __xbPostClickCount?: number }).__xbPostClickCount ?? 0),
    )
    .toBe(0);
}

// A user-typed draft that lands in the slight_rework band (the fake judge scores
// any draft carrying the annotation quote at 78 → slight_rework, the correct
// state for OFFERING Apply-all) and contains the annotation quote the fake judge
// underlines (blue). The default fake policy quote is "specific phrase".
const TYPED_DRAFT =
  "Good onboarding gets the user to one finished task; that specific phrase is the whole job.";

test("reply generate writes one structural target prefix and sends reply context through transport", async () => {
  const h = await startRunner({
    llmPolicy: {
      writerVariants: [
        "@alice agree with this",
        "agree with this, but with another angle",
        "agree with this, and make it concrete",
      ],
    },
  });
  try {
    await seedReplyDialog(h.page, { composerText: "@alice " });
    await installPostClickCounter(h.page);
    await h.mountOverlay();
    await waitForReplyContextReady(h);

    const hotTake = h.page.getByRole("button", { name: "Hot take" });
    await expect(hotTake).toBeVisible();
    await hotTake.click();

    const generateArg = await waitForCall(h, "generateIdeas");

    await expect(composer(h.page)).toHaveText("@alice agree with this");
    await expect(h.page.getByText("✓ Judge approved")).toBeVisible();
    expect(generateArg.format).toBe("hot_take");
    expectReplyContext(generateArg.replyContext);

    const generatedAnalyze = callsFor(h, "analyzePosts").find(
      (call) => (call.arg as any)?.items?.[0]?.text === "agree with this",
    );
    expect(generatedAnalyze, "generated body should be analyzed without structural prefix").toBeDefined();
    expectReplyContext((generatedAnalyze?.arg as any).items[0].replyContext);

    const composerText = (await composer(h.page).textContent()) ?? "";
    expect(composerText.match(/@alice/g)).toHaveLength(1);
    await expectNoPostClicks(h.page);
  } finally {
    await h.stop();
  }
});

test("reply manual judge and apply-all send body plus reply context and write prefix plus returned body", async () => {
  const h = await startRunner({
    llmPolicy: { annotationQuote: "good point", rewriteText: "better point" },
  });
  try {
    await seedReplyDialog(h.page, { composerText: "@alice " });
    await installPostClickCounter(h.page);
    await h.mountOverlay();
    await appendToComposer(h.page, "good point");

    await expect(h.page.getByText("Static score")).toBeVisible();
    const analyzeArg = lastCallArg(h, "analyzePosts");
    expect(analyzeArg.items[0].text).toBe("good point");
    expectReplyContext(analyzeArg.items[0].replyContext);

    await runJudge(h.page);
    await expect(h.page.getByText("Slight rework", { exact: true })).toBeVisible();

    const judgeArg = lastCallArg(h, "judgeDraft");
    expect(judgeArg.text).toBe("good point");
    expectReplyContext(judgeArg.replyContext);

    const applyAll = h.page.getByRole("button", { name: /Apply all suggestions/ });
    await expect(applyAll).toBeVisible();
    await applyAll.click();

    await expect(composer(h.page)).toHaveText("@alice better point");
    await expect(h.page.getByText("✓ Judge approved")).toBeVisible();

    const applyArg = lastCallArg(h, "applyJudgeSuggestions");
    expect(applyArg.text).toBe("good point");
    expectReplyContext(applyArg.replyContext);
    await expectNoPostClicks(h.page);
  } finally {
    await h.stop();
  }
});

test("normal compose with a leading handle stays post-mode and does not strip the mention", async () => {
  const h = await startRunner({
    llmPolicy: { rewriteText: "@alice improved normal post" },
  });
  try {
    await installPostClickCounter(h.page);
    await h.mountOverlay();
    await typeDraft(h.page, "@alice good point with the specific phrase");

    await expect(h.page.getByText("Static score")).toBeVisible();
    const analyzeArg = lastCallArg(h, "analyzePosts");
    expect(analyzeArg.items[0].text).toBe("@alice good point with the specific phrase");
    expect(analyzeArg.items[0]).not.toHaveProperty("replyContext");

    await runJudge(h.page);
    await expect(h.page.getByText("Slight rework", { exact: true })).toBeVisible();
    const judgeArg = lastCallArg(h, "judgeDraft");
    expect(judgeArg.text).toBe("@alice good point with the specific phrase");
    expect(judgeArg).not.toHaveProperty("replyContext");
    await expect(composer(h.page)).toHaveText("@alice good point with the specific phrase");

    const applyAll = h.page.getByRole("button", { name: /Apply all suggestions/ });
    await expect(applyAll).toBeVisible();
    await applyAll.click();
    await expect(composer(h.page)).toHaveText("@alice improved normal post");

    const applyArg = lastCallArg(h, "applyJudgeSuggestions");
    expect(applyArg.text).toBe("@alice good point with the specific phrase");
    expect(applyArg).not.toHaveProperty("replyContext");
    await expectNoPostClicks(h.page);
  } finally {
    await h.stop();
  }
});

test("normal compose generation with a leading handle stays post-mode", async () => {
  const h = await startRunner({
    llmPolicy: {
      writerVariants: [
        "@alice generated normal post",
        "@alice generated normal post with a second angle",
        "@alice generated normal post with a question",
      ],
    },
  });
  try {
    await installPostClickCounter(h.page);
    await h.mountOverlay();
    await typeDraft(h.page, "@alice seed body");
    await expect(h.page.getByText("Static score")).toBeVisible();

    await h.page.getByRole("button", { name: "Hot take" }).click();

    const generateArg = await waitForCall(h, "generateIdeas");
    await expect(composer(h.page)).toHaveText("@alice generated normal post");
    expect(generateArg).not.toHaveProperty("replyContext");

    const generatedAnalyze = callsFor(h, "analyzePosts").find(
      (call) => (call.arg as any)?.items?.[0]?.text === "@alice generated normal post",
    );
    expect(generatedAnalyze, "normal generated leading handle should be analyzed as authored text").toBeDefined();
    expect((generatedAnalyze?.arg as any).items[0]).not.toHaveProperty("replyContext");
    expectNoReplyContextOnTransportCalls(h);
    await expectNoPostClicks(h.page);
  } finally {
    await h.stop();
  }
});

test("reply-looking dialog with missing target text evidence fails closed as normal compose", async () => {
  const h = await startRunner({
    llmPolicy: {
      annotationQuote: "specific phrase",
      rewriteText: "@alice improved fallback",
      writerVariants: ["@alice generated fallback", "second fallback", "third fallback"],
    },
  });
  try {
    await seedReplyDialog(h.page, { composerText: "@alice ", missingTextEvidence: true });
    await installPostClickCounter(h.page);
    await h.mountOverlay();

    await appendToComposer(h.page, "fallback body with the specific phrase");
    await expect(h.page.getByText("Static score")).toBeVisible();
    await runJudge(h.page);
    await expect(h.page.getByText("Slight rework", { exact: true })).toBeVisible();

    const applyAll = h.page.getByRole("button", { name: /Apply all suggestions/ });
    await expect(applyAll).toBeVisible();
    await applyAll.click();
    await expect(composer(h.page)).toHaveText("@alice improved fallback");

    await h.page.getByRole("button", { name: "Hot take" }).click();

    const generateArg = await waitForCall(h, "generateIdeas");

    await expect(composer(h.page)).toHaveText("@alice generated fallback");
    expect(generateArg).not.toHaveProperty("replyContext");

    const generatedAnalyze = callsFor(h, "analyzePosts").find(
      (call) => (call.arg as any)?.items?.[0]?.text === "@alice generated fallback",
    );
    expect(generatedAnalyze, "fail-closed generated text should be analyzed as normal post").toBeDefined();
    expect((generatedAnalyze?.arg as any).items[0]).not.toHaveProperty("replyContext");
    expectNoReplyContextOnTransportCalls(h);
    await expectNoPostClicks(h.page);
  } finally {
    await h.stop();
  }
});

test("Flow A: typing fills the static column, manual judge lands blue annotations + Apply-all, and Apply-all rewrites to a green/approved generated post", async () => {
  const h: RunnerHarness = await startRunner();
  try {
    await h.mountOverlay();
    await typeDraft(h.page, TYPED_DRAFT);

    // Static engine fills fast with deterministic metrics.
    await expect(h.page.getByText("◆ Static engine")).toBeVisible();
    await expect(h.page.getByText("Static score")).toBeVisible();
    await expect(h.page.getByText("Reach prediction")).toBeVisible();

    await runJudge(h.page);
    // The judge pulses, then lands the verdict band. The
    // band Badge text is EXACTLY "Slight rework" (the aria-live announcement embeds
    // the same label in a longer string, so match exactly to target the Badge).
    await expect(h.page.getByText(/AI judge running/)).toBeVisible();
    await expect(h.page.getByText("Slight rework", { exact: true })).toBeVisible();

    // Blue annotation underlay is painted over the exact quoted substring.
    const blue = h.page.locator('[role="mark"]');
    await expect(blue.first()).toBeVisible();

    // user_written + judged ⇒ "Apply all suggestions" is offered.
    const applyAll = h.page.getByRole("button", { name: /Apply all suggestions/ });
    await expect(applyAll).toBeVisible();

    // Click Apply-all: the rewrite is written into the composer + re-pinned green.
    await applyAll.click();

    // On completion: generated state ⇒ "✓ Judge approved", green wash, blue hidden,
    // Apply-all gone (loop prevention).
    await expect(h.page.getByText("✓ Judge approved")).toBeVisible();
    await expect(applyAll).toHaveCount(0);
    await expect(blue).toHaveCount(0);
    // The improved text was written into the composer (explicit gesture).
    await expect(composer(h.page)).not.toHaveText(TYPED_DRAFT);
  } finally {
    await h.stop();
  }
});

// Flow B — generated entry from a refined candidate (pre-approved, no judge wait).
test("Flow B: clicking a generate category writes a pre-judged candidate without showing the judge pulse", async () => {
  const h = await startRunner();
  try {
    await h.mountOverlay();

    // The LEFT rail lists the cold-start categories from getGenerateCategories().
    const hotTake = h.page.getByRole("button", { name: "Hot take" });
    await expect(hotTake).toBeVisible();
    await hotTake.click();

    // The generated candidate is written without a manual judge pulse.
    await expect(composer(h.page)).not.toHaveText("");
    // A pre-judged entry skips the judge-pulse entirely.
    await expect(h.page.getByText(/AI judge running/)).toHaveCount(0);
    // No blue highlights in the generated (green) state.
    await expect(h.page.locator('[role="mark"]')).toHaveCount(0);
  } finally {
    await h.stop();
  }
});

// Flow C — edit a generated post → flip to user_written → blue reappears.
test("Flow C: editing a generated (green) post flips provenance to user_written, drops the green wash, re-judges, and brings back the blue annotations + Apply-all", async () => {
  const h = await startRunner();
  try {
    await h.mountOverlay();

    // Reach the generated/green state via Flow B.
    await h.page.getByRole("button", { name: "Hot take" }).click();
    await expect(composer(h.page)).not.toHaveText("");

    // Edit the composer so its text no longer matches the green anchor, and make
    // sure the annotation quote is present so the re-judge produces a blue span.
    await composer(h.page).click();
    await h.page.keyboard.type(" plus an edited tail with the specific phrase added.");

    // Provenance flips → the approval badge clears, the judge re-runs, and blue
    // annotations + Apply-all return on the fresh verdict.
    await expect(h.page.getByText("✓ Judge approved")).toHaveCount(0);
    await runJudge(h.page);
    // Match the verdict Badge exactly (the aria-live announcement embeds the label).
    await expect(h.page.getByText("Slight rework", { exact: true })).toBeVisible();
    await expect(h.page.locator('[role="mark"]').first()).toBeVisible();
    await expect(h.page.getByRole("button", { name: /Apply all suggestions/ })).toBeVisible();
  } finally {
    await h.stop();
  }
});

// Flow E / Invariant #6 — highlight degrade: a quote edited out is silently
// dropped, no throw, typing stays responsive.
test("Flow E + Invariant #6: removing the annotated phrase silently drops its blue underlay without throwing, and the composer stays responsive", async () => {
  const h = await startRunner();
  const pageErrors: string[] = [];
  h.page.on("pageerror", (e) => pageErrors.push(e.message));
  try {
    await h.mountOverlay();
    await typeDraft(h.page, TYPED_DRAFT);
    await runJudge(h.page);

    // A blue underlay for "specific phrase" is present after the judge lands.
    await expect(h.page.locator('[role="mark"]').first()).toBeVisible();

    // Edit the phrase OUT of the composer entirely.
    await typeDraft(
      h.page,
      "Most onboarding decks explain the product when they should get the user to one finished task instead.",
    );

    // The corresponding blue rect is silently removed; no error thrown; typing
    // still produces a fresh static/judge pass (the static column stays rendered).
    await expect(h.page.locator('[role="mark"]')).toHaveCount(0);
    await expect(h.page.getByText("◆ Static engine")).toBeVisible();
    // The composer remains responsive — a further keystroke lands.
    await composer(h.page).click();
    await h.page.keyboard.type(" still typing.");
    await expect(composer(h.page)).toContainText("still typing.");
    expect(pageErrors).toEqual([]);
  } finally {
    await h.stop();
  }
});

// Flow F — static-fast-then-judge-pulse-then-fill sequence. The judge HANGS, so we
// can observe the static column filling and staying rendered while the judge runs.
test("Flow F: the static column fills before the judge completes and does not clear or show a loading state while the judge is still running", async () => {
  const h = await startRunner({ llmPolicy: { judge: "hang" } });
  try {
    await h.mountOverlay();
    await typeDraft(h.page, TYPED_DRAFT);
    await runJudge(h.page);

    // Static fills (deterministic, fast) while the judge is still pulsing.
    await expect(h.page.getByText("Static score")).toBeVisible();
    await expect(h.page.getByText("Reach prediction")).toBeVisible();
    await expect(h.page.getByText(/AI judge running/)).toBeVisible();

    // The judge never returns (hung), but the static column stays rendered — it
    // does not clear back to its scoring/loading slots.
    await expect(h.page.getByText("Static score")).toBeVisible();
    await expect(h.page.getByText(/AI judge running/)).toBeVisible();
  } finally {
    await h.stop();
  }
});

// Invariant #3 — static metrics render without the judge (judge hangs ⇒ timeout).
test("Invariant #3: with the judge hung, the static column still fills with valid deterministic metrics", async () => {
  const h = await startRunner({ llmPolicy: { judge: "hang" } });
  try {
    await h.mountOverlay();
    await typeDraft(h.page, TYPED_DRAFT);
    await runJudge(h.page);

    await expect(h.page.getByText("Static score")).toBeVisible({ timeout: 5_000 });
    await expect(h.page.getByText("Reach prediction")).toBeVisible();
    // Static did NOT block on the judge: it never shows a failed/empty state here.
    await expect(h.page.getByText(/Static scoring failed/)).toHaveCount(0);
  } finally {
    await h.stop();
  }
});

// Invariant #4 — judge-down ≠ static-down (judge returns failed).
test("Invariant #4: when the judge returns failed, the JudgeStrip shows the failure Alert while the static column stays fully rendered", async () => {
  const h = await startRunner({ llmPolicy: { judge: "fail" } });
  try {
    await h.mountOverlay();
    await typeDraft(h.page, TYPED_DRAFT);
    await runJudge(h.page);

    // The judge channel surfaces its failure while the static channel remains ready.
    await expect(h.page.getByText(/AI judge failed/)).toBeVisible();
    // The static column is unaffected — it stays rendered with its metrics.
    await expect(h.page.getByText("Static score")).toBeVisible();
    await expect(h.page.getByText("Reach prediction")).toBeVisible();
  } finally {
    await h.stop();
  }
});

// Invariant #5 — apply-all loop prevention. After Flow A's generated/green state,
// "Apply all suggestions" must be ABSENT from the DOM.
test("Invariant #5: once the composer is in the generated (green) state, Apply all suggestions is absent from the DOM", async () => {
  const h = await startRunner();
  try {
    await h.mountOverlay();
    await typeDraft(h.page, TYPED_DRAFT);
    await runJudge(h.page);

    const applyAll = h.page.getByRole("button", { name: /Apply all suggestions/ });
    await expect(applyAll).toBeVisible();
    await applyAll.click();

    // Generated/improved state reached: the apply-all affordance is gone (not just disabled).
    await expect(composer(h.page)).not.toHaveText(TYPED_DRAFT);
    await expect(applyAll).toHaveCount(0);
  } finally {
    await h.stop();
  }
});
