/* global window */

import { test, expect } from "./fixtures.js";
import { loadExampleDeck } from "./helpers.js";

const TEXT_BLOCK_DECK = `layout: title-slide

@title

# Text Block Panel Test
`;

const COLUMN_BLOCK_DECK = `layout: title-slide

@title

::: text-block { id="tb-1" column-count=2 }
- First item
- Second item
- Third item
- Fourth item
:::
`;

const USER_SLIDE_DECK = `layout: "header header" auto "main media" minmax(0, 1fr) "footer footer" auto / 1.3643fr 0.6357fr

@header

# Text Blocks

@media

### Multi-column

::: text-block { column-count=2 }

1. First item
2. Second item
3. Third item
4. Fourth item

:::

### Styled block

::: text-block { color="#1a95b8" markdown=true }

**Bold text** and _italic_ inside a styled block.

:::
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

async function enterEditMode(page) {
  await page.locator("#toggleEditModeBtn").click();
  await page.waitForTimeout(500);
}

test("opens properties panel on click for a plain text block", async ({ page }) => {
  await loadExampleDeck(page);
  await enterEditMode(page);
  await setEditorMarkdown(page, TEXT_BLOCK_DECK);

  // Insert a text block via the insert dropdown
  await page.locator("#insertDropdownBtn").click();
  await page.locator('[data-insert-action="text"]').click();
  await page.waitForTimeout(1500);

  const activeSlide = page.locator(".slide.active");
  const textBlock = activeSlide.locator(".text-block").first();
  await expect(textBlock).toBeVisible({ timeout: 10_000 });

  // The panel should auto-open after insertion
  await expect(page.locator("#textPropertiesPanel")).not.toHaveClass(/webdeck-hidden/, {
    timeout: 5_000,
  });

  // Close the panel by clicking elsewhere
  await page.mouse.click(10, 10);
  await expect(page.locator("#textPropertiesPanel")).toHaveClass(/webdeck-hidden/);

  // Click the text block again — panel should reopen
  const box = await textBlock.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator("#textPropertiesPanel")).not.toHaveClass(/webdeck-hidden/, {
    timeout: 5_000,
  });
});

test("opens properties panel on click for a multi-column text block", async ({ page }) => {
  await loadExampleDeck(page);
  await enterEditMode(page);
  await setEditorMarkdown(page, COLUMN_BLOCK_DECK);

  const activeSlide = page.locator(".slide.active");
  const textBlock = activeSlide.locator(".text-block--multi-column").first();
  await expect(textBlock).toBeVisible({ timeout: 10_000 });

  // Click the multi-column text block — panel should open
  const box = await textBlock.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator("#textPropertiesPanel")).not.toHaveClass(/webdeck-hidden/, {
    timeout: 5_000,
  });

  // The columns control should show the current column count
  const columnsInput = page.locator('[data-field="columnCount"]');
  await expect(columnsInput).toHaveValue("2");

  // The columns control should be wide enough to show its value
  const inputBox = await columnsInput.boundingBox();
  expect(inputBox).not.toBeNull();
  expect(inputBox.width).toBeGreaterThanOrEqual(40);
});

test("opens properties panel via right-click for a multi-column text block", async ({ page }) => {
  await loadExampleDeck(page);
  await enterEditMode(page);
  await setEditorMarkdown(page, COLUMN_BLOCK_DECK);

  const activeSlide = page.locator(".slide.active");
  const textBlock = activeSlide.locator(".text-block--multi-column").first();
  await expect(textBlock).toBeVisible({ timeout: 10_000 });

  const box = await textBlock.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: "right" });
  await expect(page.locator("#textPropertiesPanel")).not.toHaveClass(/webdeck-hidden/, {
    timeout: 5_000,
  });
});

test("does not inline-edit a multi-column text block on double-click", async ({ page }) => {
  await loadExampleDeck(page);
  await enterEditMode(page);
  await setEditorMarkdown(page, COLUMN_BLOCK_DECK);

  const activeSlide = page.locator(".slide.active");
  const textBlock = activeSlide.locator(".text-block--multi-column").first();
  await expect(textBlock).toBeVisible({ timeout: 10_000 });

  // Double-click should NOT make the block contenteditable
  const box = await textBlock.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { clickCount: 2 });
  await page.waitForTimeout(500);

  const isEditable = await textBlock.evaluate((el) => el.isContentEditable);
  expect(isEditable).toBe(false);
});

test("shows markdown source (not rendered text) for an id-less markdown-rendered block", async ({
  page,
}) => {
  await loadExampleDeck(page);
  await enterEditMode(page);
  await setEditorMarkdown(page, USER_SLIDE_DECK);

  const activeSlide = page.locator(".slide.active");
  const textBlocks = activeSlide.locator(".text-block");
  // First block: the multi-column list
  await expect(textBlocks.nth(0)).toBeVisible({ timeout: 10_000 });
  // Second block: the styled markdown block
  await expect(textBlocks.nth(1)).toBeVisible({ timeout: 10_000 });

  // Click the second text block and open its panel
  const box = await textBlocks.nth(1).boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator("#textPropertiesPanel")).not.toHaveClass(/webdeck-hidden/, {
    timeout: 5_000,
  });

  // The textarea should contain the markdown source, not the rendered text
  const textarea = page.locator(".text-properties-panel__textarea");
  const value = await textarea.inputValue();
  expect(value).toMatch(/\*\*Bold text\*\*/);
  expect(value).toMatch(/_italic_/);
});
