import JSZip from "jszip";
import { test, expect } from "./fixtures.js";
import { loadExampleDeck, openFileWithChooser, openMenu } from "./helpers.js";

async function makeTextpack() {
  const zip = new JSZip();
  zip.file("text.markdown", "layout: title-slide\n\n@title\n\n# E2E Textpack Deck");
  return zip.generateAsync({ type: "nodebuffer" });
}

test("opens a .textpack deck through the Open Deck flow", async ({ page }) => {
  await loadExampleDeck(page);
  await openMenu(page);
  await page.locator("#menuOpenFileBtn").click();
  await expect(page.locator("#openDeckModal")).not.toHaveClass(/webdeck-hidden/);

  await openFileWithChooser(page, "#openDeckTextpackBtn", {
    name: "e2e-deck.textpack",
    mimeType: "application/zip",
    buffer: await makeTextpack(),
  });

  await expect(page.locator(".slide").first()).toContainText("E2E Textpack Deck");
});
