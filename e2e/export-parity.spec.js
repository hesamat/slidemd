import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test, expect } from "./fixtures.js";
import { loadExampleDeck, markdownFile, openFileWithChooser, openMenu } from "./helpers.js";

/* global window, document, ContentEnhancer */

const e2eDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(e2eDir, "..");
const fixturePath = path.join(e2eDir, "fixtures", "parity", "parity-deck.md");
const fixtureMarkdown = fs.readFileSync(fixturePath, "utf8");
const distHtmlPath = path.join(repoRoot, "dist", "parity-deck.html");
const expectedSlideCount = fixtureMarkdown.split(/^---$/m).length;

// Building the fixture (esbuild + Mermaid bundle) plus two full page renders
// takes well over the default 30s test timeout.
test.setTimeout(240_000);

/**
 * Normalize volatile markup so the two render paths can be compared.
 *
 * - Mermaid embeds its render id (`mermaid-<Date.now()>-<random>`) in the svg
 *   id attribute, in marker/clip-path `url(#...)`/`href="#..."` references,
 *   and inside the svg's own `<style>` selectors.
 * - Copy-to-clipboard buttons are added only on export surfaces
 *   (`__WEBDECK_EXPORTED__`/`__WEBDECK_BUNDLED_BUILD__`), never in the dev
 *   viewer window, so they are stripped from the snapshot.
 * - `data-source-line` is editor-only click-to-source metadata produced by the
 *   runtime parser; the build parser intentionally omits it from the
 *   read-only exported HTML.
 */
function normalizeSlideHtml(raw) {
  return raw
    .replace(/mermaid-\d+-[a-z0-9]+/gi, "mermaid-id")
    .replace(/url\('#[^']*'\)|url\("#[^"]*"\)|url\(#[^)]*\)/g, "url(#)")
    .replace(/\shref="#[^"]*"/g, ' href="#"')
    .replace(/\sxlink:href="#[^"]*"/g, ' xlink:href="#"');
}

/** In-page: clone each slide, strip volatile bits, serialize. */
async function captureSlideSnapshots(page) {
  return page.evaluate(() => {
    const slides = Array.from(document.querySelectorAll("#slidesContainer > .slide"));
    return slides.map((slide) => {
      const clone = slide.cloneNode(true);
      clone.classList.remove("active");
      clone.querySelectorAll(".code-copy-button").forEach((n) => n.remove());
      clone.querySelectorAll("pre.has-copy-button").forEach((n) => {
        n.classList.remove("has-copy-button");
      });
      clone.querySelectorAll("[data-source-line]").forEach((n) => {
        n.removeAttribute("data-source-line");
      });
      clone.querySelectorAll("svg, svg *").forEach((n) => n.removeAttribute("id"));
      return clone.outerHTML;
    });
  });
}

/**
 * Wait until both pages have finished the same rendering pipeline as the
 * bundled export: all slides enhanced with Prism/KaTeX/Mermaid, fonts and
 * images settled (same waits as tools/pdf.mjs).
 */
async function settleDeckPage(page) {
  await page.waitForFunction(() => window.__WEBDECK_READY__ === true, null, { timeout: 60_000 });
  // __WEBDECK_READY__ fires before Mermaid's dynamic import resolves.
  await page
    .waitForFunction(() => window.mermaid && typeof window.mermaid.render === "function", null, {
      timeout: 30_000,
    })
    .catch(() => {});

  // The dev runtime only enhances the active slide; the export bootstrap
  // enhances everything. Force the same all-slides pass on both sides.
  await page.evaluate(async () => {
    await ContentEnhancer.enhanceRenderedContent(document.body, {
      renderAllSlides: true,
      force: true,
    });
  });

  // Mermaid rendering is async and sets data-mermaid-processed when done.
  await page.waitForFunction(
    () => {
      const blocks = Array.from(document.querySelectorAll(".mermaid"));
      return blocks.every(
        (b) =>
          b.dataset.mermaidProcessed === "1" &&
          (b.querySelector("svg") || b.querySelector(".mermaid-error")),
      );
    },
    null,
    { timeout: 60_000 },
  );

  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.addEventListener("load", resolve, { once: true });
          img.addEventListener("error", resolve, { once: true });
        });
      }),
    );
  });
}

/** First differing token between two serialized slides, with context. */
function describeFirstDifference(devHtml, exportHtml) {
  const tokenize = (html) => html.replace(/></g, ">\n<").split("\n");
  const dev = tokenize(devHtml);
  const exp = tokenize(exportHtml);
  let i = 0;
  while (i < Math.min(dev.length, exp.length) && dev[i] === exp[i]) i += 1;
  const context = (lines, from) => lines.slice(Math.max(0, from - 2), from + 6).join("\n");
  return [
    `first difference at token ${i} (${dev.length} vs ${exp.length} tokens)`,
    `--- dev ---\n${context(dev, i)}`,
    `--- export ---\n${context(exp, i)}`,
  ].join("\n");
}

test("exported HTML renders the same slide DOM as the live renderer", async ({
  page,
}, testInfo) => {
  test.skip(process.env.WEBDECK_SKIP_PARITY === "1", "parity run skipped via env var");

  // 1. Build the fixture deck with the real build script.
  execFileSync(process.execPath, ["tools/build.mjs", path.relative(repoRoot, fixturePath)], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  expect(fs.existsSync(distHtmlPath)).toBe(true);

  // 2. Dev side: load the same fixture through the live editor app.
  await loadExampleDeck(page);
  await openMenu(page);
  await page.locator("#menuOpenFileBtn").click();
  await expect(page.locator("#openDeckModal")).not.toHaveClass(/webdeck-hidden/);
  await openFileWithChooser(
    page,
    "#openDeckMdBtn",
    markdownFile(fixtureMarkdown, "parity-deck.md"),
  );
  await expect(page.locator("#slidesContainer > .slide")).toHaveCount(expectedSlideCount);
  await settleDeckPage(page);
  const devSnapshots = await captureSlideSnapshots(page);

  // 3. Export side: the built standalone HTML (same deck JSON source).
  const exportUrl = pathToFileURL(distHtmlPath);
  exportUrl.searchParams.set("role", "viewer");
  const exportPage = await page.context().newPage();
  await exportPage.goto(exportUrl.toString(), { waitUntil: "domcontentloaded" });
  await settleDeckPage(exportPage);
  const exportSnapshots = await captureSlideSnapshots(exportPage);

  // 4. Compare per-slide DOM.
  expect(exportSnapshots).toHaveLength(expectedSlideCount);
  expect(devSnapshots).toHaveLength(expectedSlideCount);

  const mismatches = [];
  for (let i = 0; i < expectedSlideCount; i += 1) {
    const devNormalized = normalizeSlideHtml(devSnapshots[i]);
    const exportNormalized = normalizeSlideHtml(exportSnapshots[i]);
    if (devNormalized !== exportNormalized) {
      mismatches.push({ index: i, devNormalized, exportNormalized });
    }
  }

  if (mismatches.length > 0) {
    // Attach full snapshots + per-slide screenshots of both variants so the
    // diff can be inspected without re-running the harness.
    await testInfo.attach("parity-dev-slides.html", {
      body: Buffer.from(devSnapshots.join("\n\n"), "utf8"),
      contentType: "text/html",
    });
    await testInfo.attach("parity-export-slides.html", {
      body: Buffer.from(exportSnapshots.join("\n\n"), "utf8"),
      contentType: "text/html",
    });
    for (const { index, devNormalized, exportNormalized } of mismatches) {
      console.log(`\n=== Parity mismatch on slide ${index + 1} ===`);
      console.log(describeFirstDifference(devNormalized, exportNormalized));
    }
    for (const { index } of mismatches) {
      for (const [label, snapPage] of [
        ["dev", page],
        ["export", exportPage],
      ]) {
        try {
          const locator = snapPage.locator(`#slidesContainer > .slide`).nth(index);
          const buffer = await locator.screenshot({ timeout: 5_000 });
          await testInfo.attach(`parity-slide-${index + 1}-${label}.png`, {
            body: buffer,
            contentType: "image/png",
          });
        } catch {
          // Hidden slides cannot be screenshotted; the HTML snapshot covers them.
        }
      }
    }
  }

  expect(
    mismatches.map((m) => m.index + 1),
    `slides whose DOM differs between dev renderer and export: ${mismatches
      .map((m) => describeFirstDifference(m.devNormalized, m.exportNormalized))
      .join("\n\n")}`,
  ).toEqual([]);
});
