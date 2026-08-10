import { test, expect } from "./fixtures.js";
import { loadExampleDeck } from "./helpers.js";

test("updates the preview after editing slide text", async ({ page }) => {
  await loadExampleDeck(page);
  await page.locator("#toggleEditModeBtn").click();

  const editor = page.locator("#markdownEditor .cm-content");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("layout: title-slide\n\n@title\n\n# E2E Edited Deck");

  await expect(page.locator(".slide").first()).toContainText("E2E Edited Deck");
});
