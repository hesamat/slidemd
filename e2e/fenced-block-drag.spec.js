/* global window */

import { test, expect } from "./fixtures.js";
import { loadExampleDeck } from "./helpers.js";

const MERMAID_DECK = `layout: two-column

@main

# Diagram Demo

\`\`\`mermaid
flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Do it]
    B -->|No| D[Stop]
\`\`\`

@media

Placeholder text
`;

const CODE_DECK = `layout: two-column

@main

# Code Demo

\`\`\`js
function hello() {
  console.log("hello world");
}
\`\`\`

@media

Placeholder text
`;

const REORDER_DECK = `layout: two-column

@main

## Blocks

\`\`\`js
A
\`\`\`

\`\`\`python
B
\`\`\`

\`\`\`ts
C
\`\`\`

@media

Side content
`;

const DEFAULT_MAIN_DECK = `layout: two-column

Prose in the default main area

\`\`\`js
console.log("from default main");
\`\`\`

@media

Side text
`;

async function setEditorMarkdown(page, markdown) {
  // Use the CodeMirror view dispatch API to replace all content in one
  // transaction. This triggers the editor's onChange handler which updates
  // the preview (keyboard.type is too slow for long markdown with backticks).
  await page.evaluate((md) => {
    const ec = window.__WEBDECK_EDIT_CONTROLLER__;
    const view = ec?.markdownEditor?.view;
    if (view) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: md },
      });
    }
  }, markdown);
  // Wait for the debounced preview re-render (300ms) plus margin
  await page.waitForTimeout(1000);
}

test("drags a mermaid diagram from main to media area", async ({ page }) => {
  await loadExampleDeck(page);
  await page.locator("#toggleEditModeBtn").click();
  await page.waitForTimeout(500);
  await setEditorMarkdown(page, MERMAID_DECK);

  // Wait for the mermaid diagram to render in the active slide
  const activeSlide = page.locator(".slide.active");
  await expect(activeSlide.locator(".mermaid").first()).toBeVisible({ timeout: 15_000 });

  const mainArea = activeSlide.locator('.slide__area[data-area-name="main"]');
  const mediaArea = activeSlide.locator('.slide__area[data-area-name="media"]');
  await expect(mainArea.locator(".mermaid")).toHaveCount(1);
  await expect(mediaArea.locator(".mermaid")).toHaveCount(0);

  // Drag the mermaid diagram from main to media area
  const mermaidBox = await activeSlide.locator(".mermaid").first().boundingBox();
  const mediaBox = await mediaArea.boundingBox();

  expect(mermaidBox).not.toBeNull();
  expect(mediaBox).not.toBeNull();

  await page.mouse.move(mermaidBox.x + mermaidBox.width / 2, mermaidBox.y + mermaidBox.height / 2);
  await page.mouse.down();
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      mermaidBox.x + mermaidBox.width / 2 + ((mediaBox.x - mermaidBox.x) * i) / steps,
      mermaidBox.y + mermaidBox.height / 2 + ((mediaBox.y - mermaidBox.y) * i) / steps,
    );
  }
  await page.mouse.up();

  // Wait for re-render and verify the mermaid moved to media area
  await expect(mediaArea.locator(".mermaid")).toHaveCount(1, { timeout: 10_000 });
  await expect(mainArea.locator(".mermaid")).toHaveCount(0);
});

test("drags a code block from main to media area", async ({ page }) => {
  await loadExampleDeck(page);
  await page.locator("#toggleEditModeBtn").click();
  await page.waitForTimeout(500);
  await setEditorMarkdown(page, CODE_DECK);

  // Wait for the code block to render in the active slide
  const activeSlide = page.locator(".slide.active");
  await expect(activeSlide.locator(".slide__area > pre").first()).toBeVisible({
    timeout: 10_000,
  });

  const mainArea = activeSlide.locator('.slide__area[data-area-name="main"]');
  const mediaArea = activeSlide.locator('.slide__area[data-area-name="media"]');
  await expect(mainArea.locator("> pre")).toHaveCount(1);
  await expect(mediaArea.locator("> pre")).toHaveCount(0);

  // Drag the code block from main to media area
  const preBox = await activeSlide.locator(".slide__area > pre").first().boundingBox();
  const mediaBox = await mediaArea.boundingBox();

  expect(preBox).not.toBeNull();
  expect(mediaBox).not.toBeNull();

  await page.mouse.move(preBox.x + preBox.width / 2, preBox.y + preBox.height / 2);
  await page.mouse.down();
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      preBox.x + preBox.width / 2 + ((mediaBox.x - preBox.x) * i) / steps,
      preBox.y + preBox.height / 2 + ((mediaBox.y - preBox.y) * i) / steps,
    );
  }
  await page.mouse.up();

  // Wait for re-render and verify the code block moved to media area
  await expect(mediaArea.locator("> pre")).toHaveCount(1, { timeout: 10_000 });
  await expect(mainArea.locator("> pre")).toHaveCount(0);
});

test("reorders a code block within the main area", async ({ page }) => {
  await loadExampleDeck(page);
  await page.locator("#toggleEditModeBtn").click();
  await page.waitForTimeout(500);
  await setEditorMarkdown(page, REORDER_DECK);

  const activeSlide = page.locator(".slide.active");
  await expect(activeSlide.locator(".slide__area > pre")).toHaveCount(3, { timeout: 10_000 });

  const mainArea = activeSlide.locator('.slide__area[data-area-name="main"]');
  const pres = mainArea.locator("> pre");

  // Original order: A (js), B (python), C (ts)
  await expect(pres.nth(0)).toContainText("A");
  await expect(pres.nth(1)).toContainText("B");
  await expect(pres.nth(2)).toContainText("C");

  // Drag the first (A) block to just before the third (C) block.
  const firstBox = await pres.nth(0).boundingBox();
  const thirdBox = await pres.nth(2).boundingBox();
  expect(firstBox).not.toBeNull();
  expect(thirdBox).not.toBeNull();

  await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
  await page.mouse.down();
  const steps = 10;
  const targetX = thirdBox.x + thirdBox.width / 2;
  const targetY = thirdBox.y - 5; // slightly above the third block to drop before it
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      firstBox.x + firstBox.width / 2 + ((targetX - firstBox.x) * i) / steps,
      firstBox.y + firstBox.height / 2 + ((targetY - firstBox.y) * i) / steps,
    );
  }
  await page.mouse.up();

  // Expected order: B, A, C
  await expect(pres.nth(0)).toContainText("B", { timeout: 5_000 });
  await expect(pres.nth(1)).toContainText("A", { timeout: 5_000 });
  await expect(pres.nth(2)).toContainText("C", { timeout: 5_000 });
});

test("drags a code block from default @main to media area", async ({ page }) => {
  await loadExampleDeck(page);
  await page.locator("#toggleEditModeBtn").click();
  await page.waitForTimeout(500);
  await setEditorMarkdown(page, DEFAULT_MAIN_DECK);

  const activeSlide = page.locator(".slide.active");
  await expect(activeSlide.locator(".slide__area > pre")).toHaveCount(1, { timeout: 10_000 });

  const mainArea = activeSlide.locator('.slide__area[data-area-name="main"]');
  const mediaArea = activeSlide.locator('.slide__area[data-area-name="media"]');
  await expect(mainArea.locator("> pre")).toHaveCount(1);
  await expect(mediaArea.locator("> pre")).toHaveCount(0);

  const preBox = await activeSlide.locator(".slide__area > pre").first().boundingBox();
  const mediaBox = await mediaArea.boundingBox();
  expect(preBox).not.toBeNull();
  expect(mediaBox).not.toBeNull();

  await page.mouse.move(preBox.x + preBox.width / 2, preBox.y + preBox.height / 2);
  await page.mouse.down();
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      preBox.x + preBox.width / 2 + ((mediaBox.x - preBox.x) * i) / steps,
      preBox.y + preBox.height / 2 + ((mediaBox.y - preBox.y) * i) / steps,
    );
  }
  await page.mouse.up();

  await expect(mediaArea.locator("> pre")).toHaveCount(1, { timeout: 10_000 });
  await expect(mainArea.locator("> pre")).toHaveCount(0);
});
