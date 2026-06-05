import { expect, test } from "@playwright/test";

test("writer page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Writer" })).toBeVisible();
});
