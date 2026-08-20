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
