import { test, expect } from "./fixtures.js";
import { loadExampleDeck } from "./helpers.js";

test("switches the current slide layout", async ({ page }) => {
  await loadExampleDeck(page);
  await page.locator("#toggleEditModeBtn").click();
  await page.locator("#insertDropdownBtn").click();
  await page.locator('[data-insert-action="layout"]').click();

  const picker = page.locator("#layoutPickerModal");
  await expect(picker).not.toHaveClass(/webdeck-hidden/);
  await picker.locator('[data-layout="focus"]').click();

  await expect(picker).toHaveClass(/webdeck-hidden/);
  await expect(page.locator("#markdownEditor .cm-content")).toContainText("layout: focus");
});
