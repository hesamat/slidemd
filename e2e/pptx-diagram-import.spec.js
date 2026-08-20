import path from "node:path";
import { test, expect } from "./fixtures.js";
import { loadExampleDeck, openMenu } from "./helpers.js";

test("imports a PPTX with manual diagrams as PNG images", async ({ page }) => {
  test.setTimeout(90_000);
  await loadExampleDeck(page);
  await openMenu(page);
  await page.locator("#menuConvertPptxBtn").click();

  const modal = page.locator(".conversion-modal__backdrop");
  await expect(modal).toBeVisible();
  await modal
    .locator('[data-field="file"]')
    .setInputFiles(path.resolve("src/__tests__/fixtures/pptx/diagram-flowchart.pptx"));

  const importButton = modal.locator('[data-action="save"]');
  await expect(importButton).toBeVisible({ timeout: 30_000 });
  console.log("[diag-test] Import button visible, clicking...");
  await importButton.click();
  console.log("[diag-test] Import button clicked, waiting for editor panel...");

  await expect(page.locator("#editorPanel")).not.toHaveClass(/webdeck-hidden/, {
    timeout: 60_000,
  });
  console.log("[diag-test] Editor panel visible!");
  await expect(page.locator(".slide").first()).toBeVisible({ timeout: 30_000 });

  const cm = page.locator("#markdownEditor .cm-content");
  await expect(cm).toContainText("layout:", { timeout: 60_000 });

  // The top-level diagram (Step A → Step B) and the grouped diagram (G1/G2)
  // must both render as embedded PNG images in the converted markdown.  The
  // import pipeline appends a content hash to image refs, so match the prefix.
  await expect(cm).toContainText("images/diagram-0-1-");
  await expect(cm).toContainText("images/diagram-0-2-");
  // The diagram labels survive as image alt text.
  await expect(cm).toContainText("Step A");
  await expect(cm).toContainText("G1");
});
