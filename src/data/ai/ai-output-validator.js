import { MarkdownParser } from "../markdown-parser.js";
import { LayoutData } from "../layout-data.js";
import { LayoutParser } from "../layout-parser.js";
import { getSchema } from "./ai-output-schema.js";

/**
 * Validates AI-generated Markdown against an output schema.
 * Reuses MarkdownParser and LayoutData — does not reinvent parsing.
 *
 * @typedef {Object} ValidationError
 * @property {number} slide — 0-based slide index, or -1 for deck-level
 * @property {string} code — machine-readable error code
 * @property {string} message — human-readable message
 *
 * @typedef {Object} ValidationResult
 * @property {boolean} ok
 * @property {ValidationError[]} errors
 * @property {ValidationError[]} warnings
 * @property {Object[]} slides — parsed slide data (from MarkdownParser)
 */

export class AiOutputValidator {
  /**
   * @param {object} opts
   * @param {string} opts.inputMarkdown — the original input (for content rules that compare input vs output)
   */
  constructor({ inputMarkdown }) {
    this._inputMarkdown = inputMarkdown;
    this._parser = new MarkdownParser();
    this._inputSlides = null;
  }

  /**
   * Lazily parse the input markdown into slides (needed for tests without window).
   * @returns {object[]}
   */
  _getInputSlides() {
    if (this._inputSlides === null && this._inputMarkdown) {
      try {
        this._inputSlides = this._parser.parseDeckMarkdown(this._inputMarkdown).slides || [];
      } catch {
        this._inputSlides = [];
      }
    }
    return this._inputSlides || [];
  }

  /**
   * @param {string} outputMarkdown
   * @param {string} intent
   * @param {object} [opts]
   * @param {number} [opts.expectedSlideCount] — when set, enforce exact slide count
   * @returns {ValidationResult}
   */
  validate(outputMarkdown, intent, opts = {}) {
    const schema = getSchema(intent);
    const errors = [];
    const warnings = [];

    let deckData;
    try {
      deckData = this._parser.parseDeckMarkdown(outputMarkdown);
    } catch (e) {
      return {
        ok: false,
        errors: [{ slide: -1, code: "PARSE_ERROR", message: e.message }],
        warnings,
        slides: [],
      };
    }

    const slides = deckData.slides || [];

    // preserve-multi-column-list (deck-level content rule)
    if (
      schema.checkContentRules &&
      this._inputMarkdown &&
      /multi-column-list/.test(this._inputMarkdown)
    ) {
      if (!/multi-column-list/.test(outputMarkdown)) {
        errors.push({
          slide: -1,
          code: "PRESERVE_MULTI_COLUMN_LIST",
          message: "The multi-column-list content from the input was dropped in the output",
        });
      }
    }

    // When an exact slide count is expected (fix mode batch), enforce it
    if (opts.expectedSlideCount != null && slides.length !== opts.expectedSlideCount) {
      errors.push({
        slide: -1,
        code: "SLIDE_COUNT_MISMATCH",
        message: `Expected ${opts.expectedSlideCount} slide(s), got ${slides.length}`,
      });
    } else {
      if (slides.length < schema.minSlides) {
        errors.push({
          slide: -1,
          code: "TOO_FEW_SLIDES",
          message: `Expected at least ${schema.minSlides} slide(s), got ${slides.length}`,
        });
      }
      if (schema.maxSlides !== null && slides.length > schema.maxSlides) {
        errors.push({
          slide: -1,
          code: "TOO_MANY_SLIDES",
          message: `Expected at most ${schema.maxSlides} slide(s), got ${slides.length}`,
        });
      }
    }

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];

      if (schema.requireLayout && !slide.layout) {
        errors.push({
          slide: i,
          code: "MISSING_LAYOUT",
          message: `Slide ${i + 1} has no layout directive`,
        });
      }
      if (slide.layout && !this._isValidLayout(slide.layout)) {
        errors.push({
          slide: i,
          code: "UNKNOWN_LAYOUT",
          message: `Slide ${i + 1} uses unknown layout "${slide.layout}"`,
        });
      }

      if (schema.checkAreaValidity && slide.layout) {
        const allowedAreas = this._getLayoutAreas(slide.layout);
        const usedAreas = slide._markerNames || Object.keys(slide.areas || {});
        for (const area of usedAreas) {
          if (!allowedAreas.includes(area)) {
            errors.push({
              slide: i,
              code: "INVALID_AREA",
              message: `Slide ${i + 1} uses @${area} but layout "${slide.layout}" allows only: ${allowedAreas.join(", ")}`,
            });
          }
        }
      }

      if (schema.checkContentRules) {
        this._checkContentRules(slide, i, errors, warnings);
      }

      // Intent-specific constraints (compare against input slide)
      this._checkIntentSpecifics(slide, i, intent, errors, warnings);
    }

    return { ok: errors.length === 0, errors, warnings, slides };
  }

  /**
   * Check intent-specific output constraints against the original input.
   * @param {object} slide - output slide
   * @param {number} index - output slide index
   * @param {string} intent
   * @param {ValidationError[]} errors
   * @param {ValidationError[]} warnings
   */
  _checkIntentSpecifics(slide, index, intent, errors, warnings) {
    const inputSlide = this._getInputSlides()[index];
    if (!inputSlide) return;

    if (intent === "summarize") {
      // Summarize must preserve the original layout and area set
      if (slide.layout && inputSlide.layout && slide.layout !== inputSlide.layout) {
        errors.push({
          slide: index,
          code: "SUMMARIZE_PRESERVE_LAYOUT",
          message: `Summarize must preserve the original layout "${inputSlide.layout}", got "${slide.layout}"`,
        });
      }

      const inputAreas = Object.keys(inputSlide.areas || {}).sort();
      const outputAreas = Object.keys(slide.areas || {}).sort();
      if (JSON.stringify(inputAreas) !== JSON.stringify(outputAreas)) {
        errors.push({
          slide: index,
          code: "SUMMARIZE_PRESERVE_AREAS",
          message: `Summarize must preserve the original @area markers. Expected: ${inputAreas.join(", ")}, got: ${outputAreas.join(", ")}`,
        });
      }
    }

    if (intent === "addSpeakerNotes") {
      // Add speaker notes must not change layout, areas, or visible content
      if (slide.layout !== inputSlide.layout) {
        errors.push({
          slide: index,
          code: "NOTES_PRESERVE_LAYOUT",
          message: `Add speaker notes must not change the slide layout. Expected "${inputSlide.layout}", got "${slide.layout}"`,
        });
      }

      const inputAreas = Object.keys(inputSlide.areas || {}).sort();
      const outputAreas = Object.keys(slide.areas || {}).sort();
      if (JSON.stringify(inputAreas) !== JSON.stringify(outputAreas)) {
        errors.push({
          slide: index,
          code: "NOTES_PRESERVE_AREAS",
          message: `Add speaker notes must not change @area markers. Expected: ${inputAreas.join(", ")}, got: ${outputAreas.join(", ")}`,
        });
      }

      // Visible markdown (without notes) must be unchanged
      const inputVisible = (this._parser.stripNotes(inputSlide.raw) || "").trim();
      const outputVisible = (this._parser.stripNotes(slide.raw) || "").trim();
      if (inputVisible !== outputVisible) {
        errors.push({
          slide: index,
          code: "NOTES_PRESERVE_CONTENT",
          message: "Add speaker notes must not change the slide's visible content",
        });
      }

      // Output must contain a notes block
      const outputNotes = this._parser.extractNotes(slide.raw);
      if (!outputNotes) {
        errors.push({
          slide: index,
          code: "NOTES_MISSING",
          message: "Add speaker notes must produce a `<!-- notes: ... -->` block",
        });
      }
    }
  }

  /**
   * Check if a layout is valid: either a known preset/custom name, or a
   * parseable CSS grid template string (e.g. `"header header" "main media" / 1fr 1fr`).
   * @param {string} layoutName
   * @returns {boolean}
   */
  _isValidLayout(layoutName) {
    if (LayoutData.hasLayout(layoutName)) return true;
    // A grid template string contains quoted row definitions
    if (/["'].*["']/.test(layoutName)) {
      try {
        const parsed = LayoutParser.parse(layoutName);
        return parsed.orderedAreas.length > 0;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Get the area names for a layout, handling both preset names and
   * inline grid template strings.
   * @param {string} layoutName
   * @returns {string[]}
   */
  _getLayoutAreas(layoutName) {
    if (LayoutData.hasLayout(layoutName)) {
      return LayoutData.getAreaNames(layoutName);
    }
    if (/["'].*["']/.test(layoutName)) {
      try {
        const parsed = LayoutParser.parse(layoutName);
        return parsed.orderedAreas;
      } catch {
        return ["main"];
      }
    }
    return LayoutData.getAreaNames(layoutName);
  }

  /**
   * Per-slide content rules (#150):
   * - header-default-h1: if a slide has a header area, its first heading should be h1 (warning, not error)
   * - no-header-on-multi-image: if a slide has >1 image, layout must not be header-content (error)
   */
  _checkContentRules(slide, index, errors, warnings) {
    // header-default-h1
    const headerHtml = (slide.areas && slide.areas.header) || "";
    const firstHeading = headerHtml.match(/<h([1-6])\b[^>]*>/i);
    if (firstHeading) {
      const level = parseInt(firstHeading[1], 10);
      if (level > 1) {
        warnings.push({
          slide: index,
          code: "HEADER_DEFAULT_H1",
          message: `Slide ${index + 1} @header should start with # (h1), found h${level}`,
        });
      }
    }

    // no-header-on-multi-image
    let imgCount = 0;
    if (slide.areas) {
      const allHtml = Object.values(slide.areas).join("");
      const matches = allHtml.match(/<img\b/gi);
      if (matches) imgCount = matches.length;
    }
    if (imgCount > 1 && slide.layout === "header-content") {
      errors.push({
        slide: index,
        code: "NO_HEADER_ON_MULTI_IMAGE",
        message: `Slide ${index + 1} has ${imgCount} images but uses header-content (use media-span, two-column, or full-image instead)`,
      });
    }
  }
}
