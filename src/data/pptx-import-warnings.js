/**
 * PPTX import warnings collector.
 *
 * The import pipeline degrades content silently by design (a failed diagram
 * crop falls back to a text marker, a timed-out slide keeps its remaining
 * content). Aggregating those degradations here lets the app and the CLI show
 * a post-import report of which slides lost content and why, instead of only
 * emitting Logger.warn lines.
 *
 * A collector is a plain object:
 *   { warnings: [{ slideIndex, kind, message }], add(kind, slideIndex, message) }
 *
 * `slideIndex` is 0-based, matching ExtractedSlide.index.
 */

/**
 * @typedef {Object} PptxImportWarning
 * @property {number} slideIndex - 0-based slide index the warning belongs to.
 * @property {'diagram-crop-failed'|'diagram-render-failed'|'diagram-timeout'} kind
 * @property {string} message - Human-readable description of the degradation.
 */

/**
 * Create a warnings collector.
 * @returns {{ warnings: PptxImportWarning[], add: (kind: PptxImportWarning['kind'], slideIndex: number, message: string) => void }}
 */
export function createImportWarningCollector() {
  const warnings = [];
  return {
    warnings,
    add(kind, slideIndex, message) {
      warnings.push({ slideIndex, kind, message: String(message) });
    },
  };
}

const KIND_LABELS = {
  "diagram-crop-failed": "diagram could not be cropped",
  "diagram-render-failed": "diagram could not be rendered",
  "diagram-timeout": "diagram render timed out",
};

/**
 * Build a per-slide post-import report from a warnings array.
 *
 * @param {PptxImportWarning[]} warnings
 * @param {number} [slideCount] - Total imported slides (for the summary line).
 * @returns {{ summary: string, details: string[] }} Empty strings when there
 *   are no warnings. `details` lines are 1-based ("Slide 5: …").
 */
export function buildImportReport(warnings, slideCount = 0) {
  if (!warnings || warnings.length === 0) {
    return { summary: "", details: [] };
  }
  const bySlide = new Map();
  for (const w of warnings) {
    const list = bySlide.get(w.slideIndex) || [];
    list.push(w);
    bySlide.set(w.slideIndex, list);
  }
  const slideNums = [...bySlide.keys()].sort((a, b) => a - b).map((i) => i + 1);
  const slideWord = slideCount === 1 ? "slide" : "slides";
  const reviewWord = bySlide.size === 1 ? "needs review" : "need review";
  const slideListWord = slideNums.length === 1 ? "slide" : "slides";
  const summary = slideCount
    ? `${slideCount} ${slideWord} imported, ${bySlide.size} ${reviewWord} (${slideListWord} ${slideNums.join(", ")})`
    : `${bySlide.size} ${reviewWord} (${slideListWord} ${slideNums.join(", ")})`;
  const details = [];
  for (const slideIndex of [...bySlide.keys()].sort((a, b) => a - b)) {
    for (const w of bySlide.get(slideIndex)) {
      const label = KIND_LABELS[w.kind] || w.kind;
      details.push(`Slide ${slideIndex + 1}: ${label}${w.message ? ` — ${w.message}` : ""}`);
    }
  }
  return { summary, details };
}
