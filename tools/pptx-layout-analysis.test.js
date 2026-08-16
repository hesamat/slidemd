/* globals console */
/**
 * PPTX layout-threshold analysis harness.
 * @vitest-environment jsdom
 *
 * Runs the real extraction + layout-inference pipeline over a corpus of
 * .pptx decks and reports, per slide, the inferred layout and the CONFIG
 * threshold inputs that drove the decision. Used by the Phase 14.9
 * "Review layout thresholds" task to tune thresholds from actual failure
 * cases instead of intuition.
 *
 * The corpus lives outside the repo (real-world decks), so this spec skips
 * cleanly when the corpus file or any deck is missing — it only runs where
 * the corpus is present.
 *
 * Usage:
 *   npx vitest run tools/pptx-layout-analysis.test.js
 *
 * Writes a JSON report to tools/layout-report.json.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PptxExtractor } from "../src/data/pptx-extractor.js";
import { convertToSlideMd } from "../src/data/pptx-to-slide-md.js";
import {
  findDominantImages,
  filterMeaningfulElements,
  inferLayout,
} from "../src/data/pptx-layout-inference.js";
import { CONFIG, CONVERSION, ELEMENT_TYPES, DEFAULT_SLIDE_SIZE } from "../src/data/pptx-slide-config.js";

const corpusPath = path.join(import.meta.dirname, "pptx-layout-corpus.json");
const reportPath = path.join(import.meta.dirname, "layout-report.json");

function emuToPoints(emu) {
  // Mirrors convertSlide.normalizeElementUnits: values below EMU_THRESHOLD
  // are already points; only larger numbers are EMUs to be divided.
  // Constants come from CONVERSION, not CONFIG — reading them from the wrong
  // object yields undefined, and `emu >= undefined` is false, so every value
  // would be treated as already-points and the geometry never normalized.
  if (typeof emu !== "number") return 0;
  return emu >= CONVERSION.EMU_THRESHOLD ? emu / CONVERSION.EMU_PER_POINT : emu;
}

function stripHtml(html) {
  return (html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Record the decision inputs for one slide, mirroring the pre-processing
 * in convertSlide (pptx-to-slide-md.js) so the reported stats match exactly
 * what inferLayout received.
 */
function analyzeSlide(slide, slideWidth, slideHeight, slideIndex, importImages = true) {
  const elements = slide.elements.map((el) => ({
    ...el,
    left: emuToPoints(el.left),
    top: emuToPoints(el.top),
    width: emuToPoints(el.width),
    height: emuToPoints(el.height),
  }));

  const dominantImages = importImages
    ? findDominantImages(elements, slideWidth, slideHeight)
    : [];

  const meaningfulElements = filterMeaningfulElements(
    elements,
    slideWidth,
    slideHeight,
    dominantImages,
  );

  const survivingDominant = dominantImages.filter((dom) =>
    meaningfulElements.some(
      (el) =>
        el.type === ELEMENT_TYPES.IMAGE &&
        el.ref === dom.ref &&
        el.left === dom.left &&
        el.top === dom.top,
    ),
  );

  const textElements = meaningfulElements.filter(
    (el) => el.type === ELEMENT_TYPES.TEXT && el.content?.trim(),
  );

  const allElements = meaningfulElements.filter(
    (el) =>
      el.placeholderType !== ELEMENT_TYPES.FOOTER &&
      ((el.type === ELEMENT_TYPES.TEXT && el.content?.trim()) ||
        (importImages && el.type === ELEMENT_TYPES.IMAGE && el.ref) ||
        (el.type === ELEMENT_TYPES.TABLE && el.rows?.length) ||
        el.type === ELEMENT_TYPES.CHART ||
        el.type === ELEMENT_TYPES.DIAGRAM),
  );

  const hasMedia = allElements.some((el) => el.type !== ELEMENT_TYPES.TEXT);

  const layout = inferLayout(
    textElements,
    slideWidth,
    slideHeight,
    hasMedia,
    allElements,
    survivingDominant,
    slideIndex,
  );

  const contentEls = textElements.filter((el) => el.content?.trim());
  const totalLength = contentEls.reduce((sum, el) => sum + el.content.trim().length, 0);
  const bodyThreshold = slideHeight * CONFIG.bodyTopRatio;

  let headerEl = null;
  for (const el of contentEls) {
    const text = stripHtml(el.content || "");
    const hasBullet = /^(?:[\u2022\u2023\u25E6\u2043\u2219•-]\s*)+/.test(text);
    if (el.top < bodyThreshold && text.length <= CONFIG.maxHeaderLength && !hasBullet) {
      headerEl = el;
      break;
    }
  }

  const titleBodyEls = contentEls.filter((el) => el !== headerEl);
  const headerHi = headerEl?.height || 0;
  const bodyHi = titleBodyEls.length
    ? Math.max(...titleBodyEls.map((e) => e.height || 0))
    : 0;
  const headerThin = headerEl && bodyHi > 0 && headerHi < bodyHi * CONFIG.headerThinRatio;

  // Mirror the code-detection path in inferLayout so the report can say
  // whether a focus/header-content/two-column choice came from the code
  // branch and which code thresholds fired.
  let codeEl = null;
  const looksLikeCode = contentEls.some((el) => {
    const text = el.content?.trim() || "";
    if (/```[\s\S]*```/.test(text)) {
      codeEl = el;
      return true;
    }
    const lines = text.split("\n");
    if (lines.length < 2) return false;
    const codeKeywords =
      /^\s*(def\s+\w|function\s+\w|class\s+\w|const\s+\w|let\s+\w|var\s+\w|import\s+[\w{#]|#include|for\s*\(|while\s*\(|if\s*\(|else\s|elif\s|return\s|try\s|catch\s|from\s+\w|async\s|await\s|void\s+\w|null\b|undefined\b|this\.|self\.|console\.|print\(|echo\s|\/\/|<!--|\w+\s*[=:]\s*[({[])/;
    const codeLineCount = lines.filter((l) => codeKeywords.test(l)).length;
    if (codeLineCount >= 2) {
      codeEl = el;
      return true;
    }
    return false;
  });
  const codeWidthPct = codeEl?.width ? (codeEl.width / slideWidth).toFixed(3) : null;
  const codeLines = codeEl
    ? (codeEl.content || "")
        .split("\n")
        .filter((l) => l.trim() && !/^\s*```/.test(l)).length
    : null;
  // Mirror the production gate in inferLayout exactly: a fenced block only
  // goes two-column when the total content is substantial; unfenced raw code
  // (PPTX merged columns) keeps the historical two-column behavior.
  const isFenced = /```/.test(codeEl?.content || "");
  const codeFiredTwoColumn =
    looksLikeCode &&
    (codeEl?.width || 0) > slideWidth * 0.8 &&
    codeLines >= CONFIG.minMergedCodeLines &&
    (!isFenced || totalLength >= CONFIG.maxTitleLength);

  return {
    slideIndex,
    layout: layout.type,
    spec: layout.spec,
    textCount: textElements.length,
    allCount: allElements.length,
    dominantImages: survivingDominant.length,
    hasMedia,
    totalLength,
    underMaxTitleLength: totalLength < CONFIG.maxTitleLength,
    underMaxFocusElements: contentEls.length <= CONFIG.maxFocusElements,
    contentElCount: contentEls.length,
    headerEl: headerEl ? stripHtml(headerEl.content).slice(0, 40) : null,
    headerHi,
    bodyHi,
    headerThin,
    code: {
      looksLikeCode,
      codeWidthPct,
      codeLines,
      isFenced,
      firedTwoColumn: codeFiredTwoColumn,
    },
    thresholdFired: {
      shortFocusPath: !hasMedia && totalLength < CONFIG.maxTitleLength,
      thinHeaderBlock: headerThin === true,
    },
  };
}

async function analyzeDeck(name, pptxPath) {
  const buffer = fs.readFileSync(pptxPath);
  const extraction = await PptxExtractor.extract(buffer);
  const slideWidth = emuToPoints(extraction.size?.width || DEFAULT_SLIDE_SIZE.WIDTH_EMU);
  const slideHeight = emuToPoints(extraction.size?.height || DEFAULT_SLIDE_SIZE.HEIGHT_EMU);

  const slides = extraction.slides.map((slide, i) =>
    analyzeSlide(slide, slideWidth, slideHeight, i),
  );

  // Also run the real converter per slide so the rendered layout matches
  // exactly what convertSlide emits for that slide (guard upgrades, media-span
  // side selection, and empty-slide drops included). Pad the extraction with
  // empty slides so the converted slide keeps its original index — index 0 is
  // the only one eligible for TITLE_SLIDE, so a shifted index would produce
  // false title-slides.
  const EMPTY_SLIDE = { elements: [] };
  for (let i = 0; i < extraction.slides.length; i++) {
    const padded = [
      ...Array.from({ length: i }, () => ({ ...EMPTY_SLIDE })),
      extraction.slides[i],
    ];
    const single = { ...extraction, slides: padded };
    const markdown = convertToSlideMd(single);
    const match = /^layout: ([^\n]+)/m.exec(markdown);
    slides[i].renderedLayout = match?.[1] ?? null;
  }

  return {
    name,
    file: pptxPath,
    slideCount: slides.length,
    slides,
  };
}

describe("pptx layout threshold analysis (corpus)", () => {
  it("runs the corpus and writes the report", async () => {
    // Corpus decks are real lecture files with 100+ slides each.
    // Overallocate: extraction + conversion across 11 decks takes minutes.
    if (!fs.existsSync(corpusPath)) {
      console.log("SKIP: corpus manifest not found — this is a local-only analysis.");
      expect(true).toBe(true);
      return;
    }
    const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));
    const report = { config: { ...CONFIG }, decks: [] };

    for (const entry of corpus) {
      if (!fs.existsSync(entry.path)) {
        console.warn(`SKIP ${entry.name}: not found at ${entry.path}`);
        continue;
      }
      console.log(`Analyzing ${entry.name} ...`);
      report.decks.push(await analyzeDeck(entry.name, entry.path));
    }

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log("\n=== Summary ===");
    for (const deck of report.decks) {
      const layoutCounts = {};
      for (const s of deck.slides) {
        layoutCounts[s.layout] = (layoutCounts[s.layout] || 0) + 1;
      }
      console.log(`${deck.name} (${deck.slideCount} slides): ${JSON.stringify(layoutCounts)}`);
    }
    console.log(`\nFull report written to ${reportPath}`);

    expect(report.decks.length).toBeGreaterThan(0);
  }, 600000);
});
