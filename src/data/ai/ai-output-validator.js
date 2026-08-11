import { MarkdownParser, splitSlides } from "../markdown-parser.js";
import { LayoutData } from "../layout-data.js";
import { LayoutParser } from "../layout-parser.js";
import { parseTextBlockDirectives } from "../../core/text-block-directive.js";
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

    // Split raw markdown into per-slide text for text-block directive checks.
    // The parsed `slides` array has already converted text-block directives to
    // HTML, so we re-split the raw input to inspect directive attributes.
    const rawSlideTexts = splitSlides(outputMarkdown);

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

      // Check text-block directives for unknown attributes (e.g. `style:`,
      // `padding`, `margin` — these are silently dropped by the parser).
      const rawSlide = rawSlideTexts[i] || "";
      this._checkTextBlockAttributes(rawSlide, i, errors);

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
  _checkIntentSpecifics(slide, index, intent, errors, _warnings) {
    // Only addSpeakerNotes compares against the input slide. Parsing the
    // input is a full markdown+HTML render — skip it entirely for other
    // intents (fix/generate/enhanceSlide), which is most call sites.
    if (intent !== "addSpeakerNotes") return;

    const inputSlide = this._getInputSlides()[index];
    if (!inputSlide) return;

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

    // Visible content (rendered areas) must be unchanged. Parsed slides
    // expose rendered area HTML rather than a `raw` field, so compare the
    // areas objects directly. The rendered HTML carries `data-source-line`
    // attributes (editor source-map offsets) that shift when blank-line
    // placement changes — the AI normalises blank lines around @area
    // markers, so strip those attributes and collapse whitespace before
    // comparing to avoid false positives that waste repair attempts.
    const inputAreasJson = JSON.stringify(normalizeAreasForCompare(inputSlide.areas));
    const outputAreasJson = JSON.stringify(normalizeAreasForCompare(slide.areas));
    if (inputAreasJson !== outputAreasJson) {
      errors.push({
        slide: index,
        code: "NOTES_PRESERVE_CONTENT",
        message: "Add speaker notes must not change the slide's visible content",
      });
    }

    // Output must contain a notes block. Parsed slides expose `notes`
    // directly (extracted from `<!-- notes: ... -->` during parsing).
    const outputNotes = slide.notes || "";
    if (!outputNotes) {
      errors.push({
        slide: index,
        code: "NOTES_MISSING",
        message: "Add speaker notes must produce a `<!-- notes: ... -->` block",
      });
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
   * Check text-block directives for unknown attributes.  The text-block parser
   * silently drops attributes it doesn't recognise (e.g. `style:`, `padding`,
   * `margin`), which means the AI can produce a directive that looks correct but
   * renders with none of the intended styling.  Flagging these as errors gives
   * the repair loop a chance to fix them.
   * @param {string} rawSlide - raw slide markdown (before text-block conversion)
   * @param {number} index - 0-based slide index
   * @param {ValidationError[]} errors
   */
  _checkTextBlockAttributes(rawSlide, index, errors) {
    const blocks = parseTextBlockDirectives(rawSlide);
    for (const block of blocks) {
      if (block.unknownAttrs && block.unknownAttrs.length > 0) {
        errors.push({
          slide: index,
          code: "UNKNOWN_TEXT_BLOCK_ATTR",
          message: `Slide ${index + 1} text-block uses unsupported attributes: ${block.unknownAttrs.join(", ")}. Supported: id, float, x, y, fontSize, color, backgroundColor, align, opacity, z, rotate, column-count, markdown, bold, italic, underline, strikethrough. Use key=value or key="value" syntax (not key: value). Freeform CSS (style, padding, margin) is not supported.`,
        });
      }
    }
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
        message: `Slide ${index + 1} has ${imgCount} images but uses header-content (use media-span-left, media-span-right, two-column, or full-image instead)`,
      });
    }
  }
}

/**
 * Normalize rendered area HTML for comparison by stripping `data-source-line`
 * attributes (editor source-map offsets that shift with blank-line changes)
 * and collapsing whitespace. This lets the addSpeakerNotes content-preservation
 * check compare visible content without false positives from line-number drift.
 * @param {Object<string, string>} areas
 * @returns {Object<string, string>}
 */
function normalizeAreasForCompare(areas) {
  if (!areas) return {};
  const out = {};
  for (const [name, html] of Object.entries(areas)) {
    out[name] = String(html)
      .replace(/\s*data-source-line="\d*"\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return out;
}
