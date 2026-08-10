import path from "node:path";
import { test, expect } from "./fixtures.js";
import { loadExampleDeck, openMenu } from "./helpers.js";

test("imports a PPTX fixture through the import flow", async ({ page }) => {
  test.setTimeout(60_000);
  await loadExampleDeck(page);
  await openMenu(page);
  await page.locator("#menuConvertPptxBtn").click();

  const modal = page.locator(".conversion-modal__backdrop");
  await expect(modal).toBeVisible();
  await modal
    .locator('[data-field="file"]')
    .setInputFiles(path.resolve("src/__tests__/fixtures/pptx/verbose-bullets.pptx"));

  const importButton = modal.locator('[data-action="save"]');
  await expect(importButton).toBeVisible({ timeout: 30_000 });
  await importButton.click();

  await expect(page.locator("#editorPanel")).not.toHaveClass(/webdeck-hidden/, {
    timeout: 30_000,
  });
  await expect(page.locator(".slide").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#markdownEditor .cm-content")).toContainText("layout:", {
    timeout: 30_000,
  });
});
