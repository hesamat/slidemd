import { test, expect } from "./fixtures.js";
import { loadExampleDeck, openMenu } from "./helpers.js";

test("exports the deck as a standalone HTML file", async ({ page }) => {
  await loadExampleDeck(page);
  await openMenu(page);

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#menuExportHtmlBtn").click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.html$/i);
});
