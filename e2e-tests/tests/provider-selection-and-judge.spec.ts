import { expect, test, type Page } from "@playwright/test";

import {
  engineBaseUrl,
  expectCatalogLabel,
  fulfillJson,
  fulfillPreflight,
  judgeBody,
  requestJson,
  sampleVerdict,
  statusBadgeText,
  statusBody,
  stubEngine,
  type SlotState,
} from "./support/engine-stub";

const draft =
  "Most onboarding advice is wrong. You need one screen where the user finishes their first real task.";

type ProviderSlot = {
  state: SlotState;
  label?: string;
  message?: string;
  model?: string;
};

// A stateful engine fixture for the provider-switch flows: /settings PATCH
// mutates the active provider, and /status reflects whichever provider is
// currently active — exactly how the live save → getStatus → publish chain
// expects the engine to behave. All payloads come from the shared builder.
async function stubProviderSwitchEngine(
  page: Page,
  options: {
    initialProvider: string;
    slots: Record<string, ProviderSlot>;
  },
): Promise<{ statusRequests: () => number }> {
  let activeProvider = options.initialProvider;
  let statusRequests = 0;

  const statusForActive = () => {
    const slot = options.slots[activeProvider];

    if (slot === undefined) {
      throw new Error(`No slot configured for provider "${activeProvider}".`);
    }

    return statusBody({
      selectedProvider: activeProvider,
      slotLabel: slot.label,
      slotMessage: slot.message,
      slotState: slot.state,
    });
  };

  await page.route(`${engineBaseUrl}/status`, async (route) => {
    statusRequests += 1;
    await fulfillJson(route, 200, statusForActive());
  });

  await page.route(`${engineBaseUrl}/settings`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await fulfillPreflight(route);
      return;
    }

    if (route.request().method() === "PATCH") {
      const body = requestJson(route) as { judgeProvider?: string };

      if (typeof body.judgeProvider === "string") {
        activeProvider = body.judgeProvider;
      }
    }

    await fulfillJson(route, 200, {
      settings: {
        claudeModel: "",
        codexModel: "",
        cursorModel: "",
        engineBaseUrl,
        judgeProvider: activeProvider,
        showDeterministicDetails: true,
        storagePath: "~/.x-builder/e2e",
      },
      source: "defaults" as const,
    });
  });

  await page.route(`${engineBaseUrl}/drafts/judge`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await fulfillPreflight(route);
      return;
    }

    const slot = options.slots[activeProvider];
    await fulfillJson(
      route,
      200,
      judgeBody({ judgeModel: slot?.model ?? activeProvider }),
    );
  });

  return { statusRequests: () => statusRequests };
}

// ---------------------------------------------------------------------------
// User flow 1 — Default-boot regression
// ---------------------------------------------------------------------------
test("default boot lands on a ready Codex judge and renders a verdict", async ({ page }) => {
  await stubEngine(page, { selectedProvider: "codex-cli", slotState: "ready" });

  await page.goto("/");
  await expect(page).toHaveURL(/\/writer$/);

  const statusBar = page.getByRole("status");
  await expect(statusBar.getByText(statusBadgeText("Codex judge", "ready"))).toBeVisible();

  await page.getByRole("textbox", { name: "Draft" }).fill(draft);

  const judgeButton = page.getByRole("button", { name: "Judge draft" });
  await expect(judgeButton).toBeEnabled();
  await judgeButton.click();

  const judgePanel = page.getByRole("region", { name: "Draft judge" });
  await expect(judgePanel.getByText("Slight rework")).toBeVisible();
  await expect(judgePanel.getByText(sampleVerdict.headline)).toBeVisible();
  await expect(judgePanel.getByText("Judged by Codex judge")).toBeVisible();
});

// ---------------------------------------------------------------------------
// User flow 2 — Provider switch happy path (no reload)
// ---------------------------------------------------------------------------
test("switching to a ready provider updates the badge without reload and attributes the verdict", async ({
  page,
}) => {
  const { statusRequests } = await stubProviderSwitchEngine(page, {
    initialProvider: "codex-cli",
    slots: {
      "codex-cli": { state: "ready" },
      "claude-cli": { state: "ready" },
    },
  });

  await page.goto("/writer");
  const statusBar = page.getByRole("status");
  await expect(statusBar.getByText(statusBadgeText("Codex judge", "ready"))).toBeVisible();
  const statusAfterBoot = statusRequests();

  // Open Settings via the sidebar and pick the new provider.
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Settings" })
    .click();
  await expect(page).toHaveURL(/\/settings$/);

  await page
    .getByLabel("Judge provider")
    .selectOption({ label: expectCatalogLabel("claude-cli") });
  await page.getByRole("button", { name: "Save settings" }).click();

  // The badge flips to the new provider's label WITHOUT a navigation/reload:
  // the save → getStatus → publish chain repaints the shared status bar in place.
  await expect(statusBar.getByText(statusBadgeText("Claude judge", "ready"))).toBeVisible();
  await expect(statusBar.getByText(statusBadgeText("Codex judge", "ready"))).toHaveCount(0);
  expect(statusRequests()).toBeGreaterThan(statusAfterBoot);
  await expect(page).toHaveURL(/\/settings$/);

  // Drafts do NOT survive navigation (by design): re-enter the draft in Studio.
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Studio" })
    .click();
  await expect(page).toHaveURL(/\/writer$/);

  const draftInput = page.getByRole("textbox", { name: "Draft" });
  await expect(draftInput).toHaveValue("");
  await draftInput.fill(draft);

  const judgeButton = page.getByRole("button", { name: "Judge draft" });
  await expect(judgeButton).toBeEnabled();
  await judgeButton.click();

  const judgePanel = page.getByRole("region", { name: "Draft judge" });
  await expect(judgePanel.getByText("Slight rework")).toBeVisible();
  // Attribution resolves the response model "claude-cli" through the catalog.
  await expect(judgePanel.getByText("Judged by Claude judge")).toBeVisible();
});

// ---------------------------------------------------------------------------
// User flow 3 — Switch to an unavailable provider: graceful degradation
// ---------------------------------------------------------------------------
test("switching to an unavailable provider degrades gracefully while deterministic flow survives", async ({
  page,
}) => {
  const unavailableMessage =
    "Cursor judge is not configured. Deterministic scoring still works.";
  let analyzeRequests = 0;

  await stubProviderSwitchEngine(page, {
    initialProvider: "codex-cli",
    slots: {
      "codex-cli": { state: "ready" },
      "cursor-cli": {
        state: "unavailable",
        message: unavailableMessage,
      },
    },
  });

  // The deterministic analyze route stays healthy regardless of judge state,
  // so the generate/score flow can complete end-to-end.
  await page.route(`${engineBaseUrl}/posts/analyze`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await fulfillPreflight(route);
      return;
    }

    analyzeRequests += 1;
    const body = requestJson(route) as {
      items: Array<{ id: string; text: string }>;
      presentation: { postCoachMode: "preview" | "expanded" };
    };

    await fulfillJson(route, 200, {
      items: body.items.map((item) => ({
        status: "scored",
        id: item.id,
        text: item.text,
        detectedFormat: "insight_share",
        score: {
          value: 80,
          checks: [
            { id: "api-check", kind: "quality", label: "API check", status: "pass" },
          ],
          learnings: [],
          engageability: { engageable: true, reason: "Ready for a static pass." },
        },
        postCoach: { state: "empty", title: "Post Coach", message: "Preview." },
        prediction: {
          status: "disabled",
          reason: "missing_followers",
          message: "Add followers.",
        },
        heuristicLabel: "Heuristic rank, not prediction.",
        analyzedAt: "2026-06-08T08:00:00.000Z",
        analyzerVersion: "deterministic-e2e",
      })),
    });
  });

  await page.goto("/writer");
  const statusBar = page.getByRole("status");
  await expect(statusBar.getByText(statusBadgeText("Codex judge", "ready"))).toBeVisible();

  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Settings" })
    .click();
  await page
    .getByLabel("Judge provider")
    .selectOption({ label: expectCatalogLabel("cursor-cli") });
  await page.getByRole("button", { name: "Save settings" }).click();

  // Danger badge + inline message + the Open Settings affordance.
  const dangerStatus = statusBar.filter({ hasText: statusBadgeText("Cursor judge", "unavailable") });
  await expect(dangerStatus.getByText(statusBadgeText("Cursor judge", "unavailable"))).toBeVisible();
  await expect(dangerStatus.getByText(unavailableMessage)).toBeVisible();
  await expect(dangerStatus.getByRole("button", { name: "Open Settings" })).toBeVisible();

  // Studio judge is disabled with the neutral hint; deterministic flow still runs.
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Studio" })
    .click();
  await page.getByRole("textbox", { name: "Draft" }).fill(draft);

  await expect(page.getByRole("button", { name: "Judge draft" })).toBeDisabled();
  await expect(
    page.getByText("The judge is unavailable right now. Check the provider in Settings."),
  ).toBeVisible();

  const results = page.getByRole("region", { name: "Studio evaluation" });
  await expect(results.getByText("Add followers.")).toBeVisible();
  expect(analyzeRequests).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// User flow 4 — Settings-page copy guard (banned jargon)
// ---------------------------------------------------------------------------
test("settings page exposes no judge-internals jargon", async ({ page }) => {
  await stubEngine(page, { selectedProvider: "codex-cli", slotState: "ready" });

  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page.getByLabel("Judge provider")).toBeVisible();
  await expect(page.getByRole("status")).toBeVisible();

  // Render the readiness badges too, so the scan covers every judge surface.
  await page.getByRole("button", { name: "Test readiness" }).click();
  await expect(page.getByText(statusBadgeText("Codex judge", "ready")).first()).toBeVisible();

  const settingsText = await page
    .getByRole("main")
    .innerText();
  expect(settingsText).not.toMatch(/codex exec|raw llm|llm judge|judge retry|retry judge/i);
});

test("settings model input follows the selected provider and remembers each draft value", async ({
  page,
}) => {
  await stubEngine(page, { selectedProvider: "codex-cli", slotState: "ready" });

  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

  const modelInput = page.getByLabel("Model");
  await expect(modelInput).toBeVisible();
  await expect(modelInput).toHaveValue("");

  await modelInput.fill("gpt-5-codex");
  await expect(modelInput).toHaveValue("gpt-5-codex");

  await page
    .getByLabel("Judge provider")
    .selectOption({ label: expectCatalogLabel("claude-cli") });
  await expect(modelInput).toHaveValue("");

  await modelInput.fill("claude-sonnet");
  await expect(modelInput).toHaveValue("claude-sonnet");

  await page
    .getByLabel("Judge provider")
    .selectOption({ label: expectCatalogLabel("codex-cli") });
  await expect(modelInput).toHaveValue("gpt-5-codex");
});

// ---------------------------------------------------------------------------
// Architectural invariant 1 — exactly four status badges (by COUNT)
// Falsifiable: a 5th or 3rd badge fails this count.
// ---------------------------------------------------------------------------
test("status bar renders exactly four readiness badges", async ({ page }) => {
  await stubEngine(page, { selectedProvider: "codex-cli", slotState: "ready" });

  await page.goto("/writer");
  const statusBar = page.getByRole("status");
  await expect(statusBar.getByText(statusBadgeText("Codex judge", "ready"))).toBeVisible();

  // Each subsystem renders as one .xb-status-bar__item span; the count is fixed
  // at four (engine, deterministic, judge, storage) regardless of the catalog.
  await expect(statusBar.locator(".xb-status-bar__item")).toHaveCount(4);
});

// ---------------------------------------------------------------------------
// Architectural invariant 2 — judge gating derives from the selected slot ONLY
// Falsifiable: the only thing that flips the gate is status.llm.state; the
// settings select value alone never does.
// ---------------------------------------------------------------------------
test("judge gating follows the published slot state, not the settings value", async ({
  page,
}) => {
  // Boot: provider selected (claude-cli) but its slot is UNAVAILABLE. If the
  // gate read the settings value it could be enabled; it must be disabled
  // because the published slot is unavailable.
  const { statusRequests } = await stubProviderSwitchEngine(page, {
    initialProvider: "claude-cli",
    slots: {
      "claude-cli": { state: "unavailable", message: "Claude judge offline." },
      "codex-cli": { state: "ready" },
    },
  });

  await page.goto("/writer");
  await page.getByRole("textbox", { name: "Draft" }).fill(draft);
  await expect(page.getByRole("button", { name: "Judge draft" })).toBeDisabled();

  // Switch the provider to codex-cli whose slot is ready: only the refreshed
  // status publish — not the settings value — re-enables the gate.
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Settings" })
    .click();
  await page
    .getByLabel("Judge provider")
    .selectOption({ label: expectCatalogLabel("codex-cli") });
  const statusBeforeSave = statusRequests();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(
    page.getByRole("status").getByText(statusBadgeText("Codex judge", "ready")),
  ).toBeVisible();
  expect(statusRequests()).toBeGreaterThan(statusBeforeSave);

  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Studio" })
    .click();
  await page.getByRole("textbox", { name: "Draft" }).fill(draft);
  await expect(page.getByRole("button", { name: "Judge draft" })).toBeEnabled();
});

// ---------------------------------------------------------------------------
// Architectural invariant 3 — badge text derives from the SERVER label verbatim
// Falsifiable: a novel llm.label the client has never seen renders exactly; any
// client-side provider-name mapping in the status path would rewrite it.
// ---------------------------------------------------------------------------
test("status badge renders a novel server label verbatim", async ({ page }) => {
  const novelLabel = "Quorum judge";

  await stubEngine(page, {
    selectedProvider: "codex-cli",
    slotLabel: novelLabel,
    slotState: "ready",
  });

  await page.goto("/writer");
  const statusBar = page.getByRole("status");
  await expect(statusBar.getByText(statusBadgeText(novelLabel, "ready"))).toBeVisible();
  // The catalog label for the selected provider must NOT appear: the status
  // path performs no mapping, it echoes status.llm.label.
  await expect(statusBar.getByText(statusBadgeText("Codex judge", "ready"))).toHaveCount(0);
  await expect(statusBar.locator(".xb-status-bar__item")).toHaveCount(4);
});
