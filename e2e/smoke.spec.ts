import { expect, test } from "@playwright/test";

test("la carte se charge et la recherche cadastrale propose la parcelle", async ({ page }) => {
  await page.goto("/carte");
  await expect(page.getByTestId("map")).toBeVisible();
  await page.getByTestId("search-input").fill("74010 000 DN 0055");
  await expect(page.getByRole("option", { name: /74010000DN0055/ })).toBeVisible({ timeout: 15_000 });
});
