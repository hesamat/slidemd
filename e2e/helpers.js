/* global window */

import { expect } from "@playwright/test";

async function waitForDeckApi(page) {
  const deadline = Date.now() + 30_000;
  let lastFailure = "unknown error";

  while (Date.now() < deadline) {
    try {
      const response = await page.request.get("/api/deck", { timeout: 2_000 });
      if (response.ok()) {
        const data = await response.json();
        if (typeof data.markdown === "string" && data.markdown.trim().length > 0) return;
        lastFailure = "the API returned an empty deck";
      } else {
        lastFailure = `HTTP ${response.status()}`;
      }
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await page.waitForTimeout(250);
  }

  throw new Error(`Deck API did not become ready: ${lastFailure}`);
}

export async function loadExampleDeck(page) {
  await waitForDeckApi(page);

  await page.addInitScript(() => {
    delete window.showOpenFilePicker;
    delete window.showDirectoryPicker;
  });
  await page.goto("/index.html");
  await page.waitForFunction(() => window.__WEBDECK_READY__ === true);
  await expect(page.locator(".slide").first()).toBeVisible();
}

export async function openMenu(page) {
  await page.locator("#menuBtn").click();
  await expect(page.locator("#menuDropdown")).not.toHaveClass(/webdeck-hidden/);
}

export async function openFileWithChooser(page, trigger, files) {
  const chooserPromise = page.waitForEvent("filechooser");
  await page.locator(trigger).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(files);
}

export function markdownFile(markdown, name = "e2e-deck.md") {
  return {
    name,
    mimeType: "text/markdown",
    buffer: Buffer.from(markdown),
  };
}
