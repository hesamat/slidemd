/* global window */

import { expect } from "@playwright/test";

export async function loadExampleDeck(page) {
  const response = await page.request.get("/api/deck");
  await expect(response).toBeOK();
  expect((await response.text()).trim().length).toBeGreaterThan(0);

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
