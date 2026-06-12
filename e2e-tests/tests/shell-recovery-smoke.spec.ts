import { expect, test } from "@playwright/test";

import { stubEngine } from "./support/engine-stub";

const codexUnavailableMessage =
  "Codex is unavailable. Deterministic scoring still works.";

test("opens at root inside the shell and resolves to Writer", async ({ page }) => {
  const requests = await stubEngine(page);

  await page.goto("/");

  await expect(page).toHaveURL(/\/writer$/);
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Studio" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Draft" })).toBeVisible();
  expect(requests.status).toBeGreaterThan(0);
});

test("shows Codex ready status on boot", async ({ page }) => {
  const requests = await stubEngine(page);

  await page.goto("/");

  await expect(page).toHaveURL(/\/writer$/);
  await expect(
    page.getByRole("status").filter({ hasText: "Codex judge ready" }),
  ).toBeVisible();
  expect(requests.status).toBeGreaterThan(0);
});

test("sidebar navigation reaches every shell route with active state", async ({ page }) => {
  const requests = await stubEngine(page);

  await page.goto("/");

  const nav = page.getByRole("navigation", { name: "Primary" });
  const routes = [
    { heading: "Studio", label: "Studio", path: "/writer" },
    { heading: "Voice", label: "Voice", path: "/voice" },
    { heading: "Post Library", label: "Post Library", path: "/library" },
    { heading: "Settings", label: "Settings", path: "/settings" },
  ];

  for (const route of routes) {
    await nav.getByRole("link", { name: route.label }).click();

    await expect(page).toHaveURL(new RegExp(`${route.path}$`));
    await expect(nav.getByRole("link", { name: route.label })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      page.getByRole("heading", { level: 1, name: route.heading }),
    ).toBeVisible();
  }

  await expect(page.getByLabel("Engine URL")).toBeVisible();
  await expect(page.getByLabel("Storage path")).toBeVisible();
  await expect(page.getByLabel("Judge provider")).toBeVisible();
  await expect(page.getByLabel("Codex model")).toBeVisible();
  await expect(page.getByLabel("Claude model")).toBeVisible();
  await expect(page.getByLabel("Cursor model")).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to Studio" })).toBeVisible();
  expect(requests.status).toBeGreaterThan(0);
  expect(requests.settings).toBeGreaterThan(0);
});

test("placeholder routes render useful recovery copy", async ({ page }) => {
  const requests = await stubEngine(page);

  await page.goto("/voice");

  await expect(page.getByRole("heading", { level: 1, name: "Voice" })).toBeVisible();
  await expect(
    page.getByText("Voice profile setup is not part of this shell pass."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to Studio" })).toBeVisible();

  await page.getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Post Library" })
    .click();

  await expect(page).toHaveURL(/\/library$/);
  await expect(
    page.getByText("Post memory is reserved for the library feature pass."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to Studio" })).toBeVisible();
  expect(requests.status).toBeGreaterThan(0);
});

test("studio preserves draft during deterministic backend failure", async ({ page }) => {
  const requests = await stubEngine(page);

  await page.goto("/writer");

  const idea = "Turn customer support surprises into launch-week content.";
  const ideaInput = page.getByRole("textbox", { name: "Draft" });

  await ideaInput.fill(idea);

  const recovery = page.getByRole("alert");
  await expect(recovery).toBeVisible();
  await expect(recovery.getByText("Route unavailable")).toBeVisible();
  await expect(
    recovery.getByText("Deterministic scoring is temporarily unavailable."),
  ).toBeVisible();
  await expect(ideaInput).toHaveValue(idea);
  await expect(recovery.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();

  const bannerBox = await recovery.boundingBox();
  const ideaBox = await ideaInput.boundingBox();
  expect(bannerBox).not.toBeNull();
  expect(ideaBox).not.toBeNull();
  expect(bannerBox!.y).toBeLessThan(ideaBox!.y);

  expect(requests.analyze).toBe(1);
  expect(requests.status).toBeGreaterThan(0);
  expect(requests.settings).toBe(0);
  expect(requests.generate).toBe(0);
});

test("keeps Writer usable when only Codex readiness is unavailable", async ({ page }) => {
  const requests = await stubEngine(page, {
    slotState: "unavailable",
    slotMessage: codexUnavailableMessage,
  });

  await page.goto("/writer");

  const status = page.getByRole("status").filter({ hasText: "Codex judge unavailable" });
  await expect(status.getByText("Engine ready")).toBeVisible();
  await expect(status.getByText("Deterministic scorer ready")).toBeVisible();
  await expect(status.getByText("Codex judge unavailable")).toBeVisible();
  await expect(status.getByText(codexUnavailableMessage)).toBeVisible();
  await expect(status.getByRole("button", { name: "Open Settings" })).toBeVisible();

  await expect(page.getByRole("heading", { level: 1, name: "Studio" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Draft" })).toBeEditable();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("Deterministic scorer failed")).toHaveCount(0);
  await expect(page.getByText("Route unavailable")).toHaveCount(0);
  expect(requests.status).toBeGreaterThan(0);
});

test("opens Settings from partial readiness without exposing raw judge controls", async ({ page }) => {
  const requests = await stubEngine(page, {
    slotState: "unavailable",
    slotMessage: codexUnavailableMessage,
  });

  await page.goto("/writer");

  await page
    .getByRole("status")
    .filter({ hasText: "Codex judge unavailable" })
    .getByRole("button", { name: "Open Settings" })
    .click();

  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page.getByLabel("Engine URL")).toBeVisible();
  await expect(page.getByLabel("Storage path")).toBeVisible();
  await expect(page.getByLabel("Judge provider")).toBeVisible();
  await expect(page.getByLabel("Codex command label")).toHaveCount(0);
  await expect(page.getByText("Codex command label")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Test readiness" })).toBeEnabled();
  await expect(page.getByText("Judge provider")).not.toHaveText(
    /codex exec|raw llm|llm judge|judge retry|retry judge/i,
  );
  await expect(page.getByText("Codex model")).not.toHaveText(
    /codex exec|raw llm|llm judge|judge retry|retry judge/i,
  );
  await expect(page.getByText("Leave empty to use the provider's default.")).not.toHaveText(
    /codex exec|raw llm|llm judge|judge retry|retry judge/i,
  );

  await page.getByRole("button", { name: "Test readiness" }).click();

  await expect(page.getByText("Codex judge unavailable")).toBeVisible();
  await expect(page.getByText("Deterministic scorer ready")).toBeVisible();
  await expect(page.getByText(/codex exec|raw llm|llm judge|judge retry|retry judge/i)).toHaveCount(0);
  expect(requests.status).toBeGreaterThanOrEqual(2);
  expect(requests.settings).toBeGreaterThan(0);
});
