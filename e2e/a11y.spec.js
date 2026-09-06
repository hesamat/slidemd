import { test, expect } from "./fixtures.js";
import { loadExampleDeck } from "./helpers.js";

test("stage announces the active slide to screen readers", async ({ page }) => {
  await loadExampleDeck(page);

  const announcer = page.locator("#slideAnnouncer");

  // Initial render announces slide 1 (count excludes hidden slides).
  await expect(announcer).toHaveText(/^Slide 1 of \d+: Welcome to SlideMD$/);
  await expect(announcer).toHaveAttribute("aria-live", "polite");
  await expect(announcer).toHaveClass(/visually-hidden/);

  // Keyboard navigation updates the announcement.
  await page.keyboard.press("ArrowRight");
  await expect(announcer).toHaveText(/^Slide 2 of \d+: What is SlideMD\?$/);

  await page.keyboard.press("ArrowLeft");
  await expect(announcer).toHaveText(/^Slide 1 of \d+: Welcome to SlideMD$/);
});
