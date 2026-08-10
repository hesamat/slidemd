import { test, expect } from "./fixtures.js";
import { loadExampleDeck, markdownFile, openFileWithChooser, openMenu } from "./helpers.js";

test("opens a Markdown deck through the Open Deck flow", async ({ page }) => {
  await loadExampleDeck(page);
  await openMenu(page);
  await page.locator("#menuOpenFileBtn").click();
  await expect(page.locator("#openDeckModal")).not.toHaveClass(/webdeck-hidden/);

  await openFileWithChooser(
    page,
    "#openDeckMdBtn",
    markdownFile("layout: title-slide\n\n@title\n\n# E2E Markdown Deck"),
  );

  await expect(page.locator(".slide").first()).toContainText("E2E Markdown Deck");
});
