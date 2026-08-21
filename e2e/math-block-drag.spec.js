/* global window */

import { test, expect } from "./fixtures.js";
import { loadExampleDeck } from "./helpers.js";

const MATH_DECK = `layout: two-column

@main

# Math Demo

$$\\int_{0}^{1} x \\, dx = \\frac{1}{2}$$

@media

Placeholder text
`;

const REORDER_MATH_DECK = `layout: two-column

@main

## Equations

$$A$$

$$B$$

$$C$$

@media

Side content
`;

const MIXED_MATH_DECK = `layout: two-column

@main

# Mixed Math

Block: $$\\int_{0}^{1} x \\, dx = \\frac{1}{2}$$

@media

Placeholder text
`;

async function setEditorMarkdown(page, markdown) {
  await page.evaluate((md) => {
    const ec = window.__WEBDECK_EDIT_CONTROLLER__;
    const view = ec?.markdownEditor?.view;
    if (view) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: md },
      });
    }
  }, markdown);
  await page.waitForTimeout(1000);
}

test("drags a display-math block from main to media area", async ({ page }) => {
  await loadExampleDeck(page);
  await page.locator("#toggleEditModeBtn").click();
  await page.waitForTimeout(500);
  await setEditorMarkdown(page, MATH_DECK);

  const activeSlide = page.locator(".slide.active");
  const mainArea = activeSlide.locator('.slide__area[data-area-name="main"]');
  const mediaArea = activeSlide.locator('.slide__area[data-area-name="media"]');

  await expect(activeSlide.locator(".katex-display").first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(mainArea.locator(".katex-display")).toHaveCount(1);
  await expect(mediaArea.locator(".katex-display")).toHaveCount(0);

  const mathBox = await mainArea.locator(".katex-display").first().boundingBox();
  const mediaBox = await mediaArea.boundingBox();
  expect(mathBox).not.toBeNull();
  expect(mediaBox).not.toBeNull();

  await page.mouse.move(mathBox.x + mathBox.width / 2, mathBox.y + mathBox.height / 2);
  await page.mouse.down();
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      mathBox.x + mathBox.width / 2 + ((mediaBox.x - mathBox.x) * i) / steps,
      mathBox.y + mathBox.height / 2 + ((mediaBox.y - mathBox.y) * i) / steps,
    );
  }
  await page.mouse.up();

  await expect(mediaArea.locator(".katex-display")).toHaveCount(1, { timeout: 10_000 });
  await expect(mainArea.locator(".katex-display")).toHaveCount(0);
});

test("reorders a display-math block within the main area", async ({ page }) => {
  await loadExampleDeck(page);
  await page.locator("#toggleEditModeBtn").click();
  await page.waitForTimeout(500);
  await setEditorMarkdown(page, REORDER_MATH_DECK);

  const activeSlide = page.locator(".slide.active");
  const mainArea = activeSlide.locator('.slide__area[data-area-name="main"]');
  const mathBlocks = mainArea.locator(".katex-display");

  await expect(mathBlocks).toHaveCount(3, { timeout: 10_000 });

  // Original order: A, B, C
  await expect(mathBlocks.nth(0)).toContainText("A");
  await expect(mathBlocks.nth(1)).toContainText("B");
  await expect(mathBlocks.nth(2)).toContainText("C");

  const firstBox = await mathBlocks.nth(0).boundingBox();
  const thirdBox = await mathBlocks.nth(2).boundingBox();
  expect(firstBox).not.toBeNull();
  expect(thirdBox).not.toBeNull();

  await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
  await page.mouse.down();
  const steps = 10;
  const targetX = thirdBox.x + thirdBox.width / 2;
  const targetY = thirdBox.y - 5;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      firstBox.x + firstBox.width / 2 + ((targetX - firstBox.x) * i) / steps,
      firstBox.y + firstBox.height / 2 + ((targetY - firstBox.y) * i) / steps,
    );
  }
  await page.mouse.up();

  // Expected order: B, A, C
  await expect(mathBlocks.nth(0)).toContainText("B", { timeout: 5_000 });
  await expect(mathBlocks.nth(1)).toContainText("A", { timeout: 5_000 });
  await expect(mathBlocks.nth(2)).toContainText("C", { timeout: 5_000 });
});

test("drags a display-math block that shares a paragraph with text", async ({ page }) => {
  await loadExampleDeck(page);
  await page.locator("#toggleEditModeBtn").click();
  await page.waitForTimeout(500);
  await setEditorMarkdown(page, MIXED_MATH_DECK);

  const activeSlide = page.locator(".slide.active");
  const mainArea = activeSlide.locator('.slide__area[data-area-name="main"]');
  const mediaArea = activeSlide.locator('.slide__area[data-area-name="media"]');

  await expect(activeSlide.locator(".katex-display").first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(mainArea.locator(".katex-display")).toHaveCount(1);
  await expect(mediaArea.locator(".katex-display")).toHaveCount(0);

  const mathBox = await mainArea.locator(".katex-display").first().boundingBox();
  const mediaBox = await mediaArea.boundingBox();
  expect(mathBox).not.toBeNull();
  expect(mediaBox).not.toBeNull();

  await page.mouse.move(mathBox.x + mathBox.width / 2, mathBox.y + mathBox.height / 2);
  await page.mouse.down();
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      mathBox.x + mathBox.width / 2 + ((mediaBox.x - mathBox.x) * i) / steps,
      mathBox.y + mathBox.height / 2 + ((mediaBox.y - mathBox.y) * i) / steps,
    );
  }
  await page.mouse.up();

  await expect(mediaArea.locator(".katex-display")).toHaveCount(1, { timeout: 10_000 });
  await expect(mainArea.locator(".katex-display")).toHaveCount(0);
});
