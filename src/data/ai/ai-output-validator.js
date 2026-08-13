import { MarkdownParser, splitSlides } from "../markdown-parser.js";
import { LayoutData } from "../layout-data.js";
import { LayoutParser } from "../layout-parser.js";
import {
  parseTextBlockDirectives,
  KNOWN_TEXT_BLOCK_ATTRIBUTES,
} from "../../core/text-block-directive.js";
import { getSchema } from "./ai-output-schema.js";

/**
 * Base line budget for a content area that fills the entire slide. Derived
 * areas scale down from this based on their fraction of the grid.
 */
const BASE_LINES_PER_SLIDE = 20;

/**
 * Multipliers applied by area type. Compact areas (header, footer, title)
 * get a lower multiplier because they hold short labels, not body content.
 * Media areas get a higher multiplier because image/mermaid markdown is
 * verbose — a single image tag or diagram may span several lines.
 */
const AREA_TYPE_MULTIPLIERS = {
  header: 0.15,
  footer: 0.15,
  title: 0.3,
  media: 2.0,
};

/** Areas that are always compact regardless of grid size. */
const COMPACT_AREAS = new Set(["header", "footer", "title"]);

/** Cache of computed limits per layout spec, cleared on layout changes. */
const limitsCache = new Map();

/**
 * Parse a CSS grid track list (columns or rows) into numeric fractions.
 * - `1fr` / `2fr` → the fr value (1, 2)
 * - `minmax(0, 1fr)` → 1
 * - `auto` → 0.1 (compact, negligible for text capacity)
 * - fixed sizes (`300px`, `0.08fr`) → parsed value or 0.3 for pure px
 * @param {string} trackStr - e.g. "1fr 1fr" or "auto minmax(0, 1fr) auto"
 * @returns {number[]}
 */
function parseTrackFractions(trackStr) {
  // Split on whitespace but keep parenthesised groups (e.g. `minmax(0, 1fr)`)
  // intact — a naive split breaks `minmax(0, 1fr)` into two tokens.
  const tokens = trackStr.trim().match(/[^()\s]+\([^)]*\)|[^\s]+/g) || [];
  return tokens.map((tok) => {
    const frMatch = tok.match(/([\d.]+)fr$/);
    if (frMatch) return Number(frMatch[1]);
    if (tok === "auto") return 0.1;
    const minmaxMatch = tok.match(/minmax\([^,]+,\s*([\d.]+)fr\)/);
    if (minmaxMatch) return Number(minmaxMatch[1]);
    // Fixed-size tracks (px, %, etc.) — treat as moderate but small.
    return 0.3;
  });
}

/**
 * Build a map from area name → list of {col, row} cells from the
 * grid-template-areas string.
 * @param {string} gridTemplateAreas - e.g. '"header header" "main media"'
 * @returns {Record<string, Array<{col: number, row: number}>>}
 */
function buildAreaCellMap(gridTemplateAreas) {
  const rowMatches = gridTemplateAreas.match(/"[^"]*"|'[^']*'/g) || [];
  const areaCells = {};
  for (let rowIdx = 0; rowIdx < rowMatches.length; rowIdx++) {
    const cells = rowMatches[rowIdx].slice(1, -1).split(/\s+/).filter(Boolean);
    for (let colIdx = 0; colIdx < cells.length; colIdx++) {
      const name = cells[colIdx];
      if (/^\.+$/.test(name)) continue;
      if (!areaCells[name]) areaCells[name] = [];
      areaCells[name].push({ col: colIdx, row: rowIdx });
    }
  }
  return areaCells;
}

/**
 * Compute per-area line limits from the layout's grid geometry.
 *
 * Instead of hardcoding a table of layout names → limits (which drifts when
 * layouts are added or renamed), this derives limits from the grid template:
 * each area's maxLines is proportional to its fraction of the total grid
 * space, adjusted by area type. Special cases are detected structurally:
 * - If the layout has no `main` area, main gets 0 (content shouldn't be there).
 * - If the layout has a single area, it gets a low limit (full-bleed image).
 *
 * @param {string} layoutName - layout preset name or grid template string
 * @returns {Record<string, {maxLines: number}>}
 */
function computeAreaLimits(layoutName) {
  const cached = limitsCache.get(layoutName);
  if (cached) return cached;

  const gridTemplate = LayoutParser.resolvePreset(layoutName);
  const parsed = LayoutParser.parse(gridTemplate);
  const { gridTemplateAreas, gridTemplateColumns, gridTemplateRows, orderedAreas } = parsed;

  // Single-area layout (e.g. full-image) — the area is for media, not text.
  if (orderedAreas.length === 1) {
    const limits = { [orderedAreas[0]]: { maxLines: 4 } };
    limitsCache.set(layoutName, limits);
    return limits;
  }

  const colFr = parseTrackFractions(gridTemplateColumns);
  const rowFr = parseTrackFractions(gridTemplateRows);
  const totalCol = colFr.reduce((s, f) => s + f, 0) || 1;
  const totalRow = rowFr.reduce((s, f) => s + f, 0) || 1;

  const areaCells = buildAreaCellMap(gridTemplateAreas);
  const limits = {};

  for (const areaName of orderedAreas) {
    const cells = areaCells[areaName] || [];
    if (cells.length === 0) continue;

    // Sum the fraction of grid space this area occupies.
    let fraction = 0;
    for (const { col, row } of cells) {
      fraction += (colFr[col] / totalCol) * (rowFr[row] / totalRow);
    }

    const multiplier = AREA_TYPE_MULTIPLIERS[areaName] ?? 1.0;
    let maxLines = Math.round(BASE_LINES_PER_SLIDE * fraction * multiplier);

    if (COMPACT_AREAS.has(areaName)) {
      maxLines = Math.max(2, Math.min(6, maxLines));
    } else {
      maxLines = Math.max(1, Math.min(24, maxLines));
    }

    limits[areaName] = { maxLines };
  }

  // If the layout has no `main` area, content routed to @main is misplaced.
  if (!limits.main) {
    limits.main = { maxLines: 0 };
  }

  limitsCache.set(layoutName, limits);
  return limits;
}

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
   * @param {boolean} [opts.skipOverflow] — skip the content-volume/overflow check
   *   (used by polish, which must preserve existing content rather than trim it)
   * @returns {ValidationResult}
   */
  validate(outputMarkdown, intent, opts = {}) {
    const schema = getSchema(intent);
    const errors = [];
    const warnings = [];
    this._skipOverflow = !!opts.skipOverflow;

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
    const inputRawSlideTexts = this._inputMarkdown ? splitSlides(this._inputMarkdown) : [];

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
      const inputRawSlide = inputRawSlideTexts[i] || "";
      this._checkTextBlockAttributes(rawSlide, inputRawSlide, i, errors, intent);

      if (schema.checkContentRules) {
        const rawSlide = rawSlideTexts[i] || "";
        this._checkContentRules(slide, rawSlide, i, errors, warnings, intent);
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
   * renders with none of the intended styling.  For generate intents this is a
   * hard error; for preserve-oriented intents (fix/polish/etc.) only unknown
   * attributes that were not already present in the input are flagged, so the
   * model can obey the "preserve existing text-block blocks" instruction.
   * @param {string} rawSlide - raw slide markdown (before text-block conversion)
   * @param {string} inputRawSlide - raw input slide markdown for comparison
   * @param {number} index - 0-based slide index
   * @param {ValidationError[]} errors
   * @param {string} intent
   */
  _checkTextBlockAttributes(rawSlide, inputRawSlide, index, errors, intent) {
    const blocks = parseTextBlockDirectives(rawSlide);
    const inputBlocks = parseTextBlockDirectives(inputRawSlide);
    const inputUnknownSet = new Set(inputBlocks.flatMap((b) => b.unknownAttrs || []));
    const isPreserve = intent !== "generate";

    for (const block of blocks) {
      const unknownAttrs = block.unknownAttrs || [];
      if (unknownAttrs.length === 0) continue;

      const newUnknowns = isPreserve
        ? unknownAttrs.filter((a) => !inputUnknownSet.has(a))
        : unknownAttrs;
      if (newUnknowns.length > 0) {
        errors.push({
          slide: index,
          code: "UNKNOWN_TEXT_BLOCK_ATTR",
          message: `Slide ${index + 1} text-block uses unsupported attributes: ${newUnknowns.join(", ")}. Supported: ${[...KNOWN_TEXT_BLOCK_ATTRIBUTES].join(", ")}. Use key=value or key="value" syntax (not key: value). Freeform CSS (style, padding, margin) is not supported.`,
        });
      }
    }
    // Detect malformed text-block directives: the opening line must use
    // braces around attributes (::: text-block { ... }). Without braces the
    // directive is silently not parsed and passes through as raw text.
    const malformedRe = /^:::\s*text-block(?:[ \t]+([^\n]*?))?[ \t]*$/gim;
    let match;
    let hasMalformed = false;
    while ((match = malformedRe.exec(rawSlide)) !== null) {
      const rest = (match[1] || "").trim();
      if (rest && !rest.startsWith("{")) {
        hasMalformed = true;
        break;
      }
    }
    if (hasMalformed) {
      errors.push({
        slide: index,
        code: "MALFORMED_TEXT_BLOCK",
        message: `Slide ${index + 1} has a text-block directive without braces. Use ::: text-block { ... } with attributes inside { }.`,
      });
    }
  }

  /**
   * Per-slide content rules (#150):
   * - header-default-h1: if a slide has a header area, its first heading should be h1 (warning, not error)
   * - no-header-on-multi-image: if a slide has >1 image, layout must not be header-content (error)
   * - content volume: detect slides that are likely to overflow their layout areas
   */
  _checkContentRules(slide, rawSlide, index, errors, warnings, intent) {
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

    // content volume / likely overflow
    // Only enforce for the generate intent — fix/enhance are conservative
    // modes whose purpose is to preserve the user's existing content, so
    // flagging an already-dense slide as overflow would pressure the AI to
    // delete content the user asked it to keep. Polish also uses the
    // generate validation path but sets skipOverflow because it must
    // preserve the same slide count and content.
    if (intent === "generate" && !this._skipOverflow) {
      this._checkContentVolume(slide, rawSlide, index, errors);
    }
  }

  /**
   * Detect slide content that is likely to overflow its layout areas based on
   * per-area line/bullet/code/table limits. These are conservative heuristics
   * meant to catch overflows before rendering, not exact pixel checks.
   * @param {object} slide - parsed slide
   * @param {string} rawSlide - raw markdown for the slide
   * @param {number} index - 0-based slide index
   * @param {ValidationError[]} errors
   */
  _checkContentVolume(slide, rawSlide, index, errors) {
    const layout = slide.layout || "default";
    const limits = computeAreaLimits(layout);
    const areaContents = this._extractAreaContents(rawSlide);

    for (const [areaName, content] of Object.entries(areaContents)) {
      const areaLimits = limits[areaName];
      if (!areaLimits) continue;

      const metrics = this._measureAreaContent(content);

      if (areaLimits.maxLines != null && metrics.lineCount > areaLimits.maxLines) {
        errors.push({
          slide: index,
          code: "SLIDE_CONTENT_OVERFLOW",
          message: `Slide ${index + 1} @${areaName} has too much content (${metrics.lineCount} lines, max ${areaLimits.maxLines}). Trim to one key idea, move detail to speaker notes, or split into multiple slides.`,
        });
      }
    }
  }

  /**
   * Split raw slide markdown into content keyed by @area marker.
   * @param {string} rawSlide
   * @returns {Record<string, string>}
   */
  _extractAreaContents(rawSlide) {
    const areas = {};
    const lines = rawSlide.split("\n");
    // Per the parser contract, content before the first @area marker flows
    // into @main. Start there so it is measured.
    let currentArea = "main";
    const buffer = [];

    const flush = () => {
      const text = buffer.join("\n").trim();
      if (text) {
        areas[currentArea] = areas[currentArea] ? `${areas[currentArea]}\n${text}` : text;
      }
      buffer.length = 0;
    };

    for (const line of lines) {
      const markerMatch = line.trim().match(/^@([a-zA-Z0-9_-]+)$/);
      if (markerMatch) {
        flush();
        currentArea = markerMatch[1];
      } else {
        buffer.push(line);
      }
    }
    flush();
    return areas;
  }

  /**
   * Count visible content lines, bullets, code lines, and table rows in an
   * area's raw markdown.
   * @param {string} content
   * @returns {{lineCount: number, bulletCount: number, codeLineCount: number, tableRowCount: number}}
   */
  _measureAreaContent(content) {
    const lines = content.split("\n");
    let lineCount = 0;
    let bulletCount = 0;
    let codeLineCount = 0;
    let tableRowCount = 0;
    let inCode = false;
    let inComment = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.length === 0) continue;

      // Track multi-line HTML comments (<!-- notes: ... --> spanning lines)
      if (inComment) {
        if (line.includes("-->")) inComment = false;
        continue;
      }
      if (line.startsWith("<!--")) {
        if (!line.includes("-->")) inComment = true;
        continue;
      }

      if (line === ":::" || /^:::\s+/.test(line)) continue; // text-block directive markers
      if (
        /^(layout|theme|background|media-full-bleed|media-span|hidden|code-font-size|align|area-style(?:-[a-zA-Z0-9_-]+)?)\s*:/i.test(
          line,
        )
      ) {
        continue;
      }

      if (line.startsWith("```")) {
        inCode = !inCode;
        continue;
      }

      if (inCode) {
        codeLineCount++;
        lineCount++;
        continue;
      }

      if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
        bulletCount++;
        lineCount++;
        continue;
      }

      // Table rows: must contain a pipe and have content on both sides.
      // Skip separator-only rows (|---|---|) — they carry no content.
      if (line.includes("|") && !line.startsWith("\\")) {
        if (/^\|?[\s-]*-{2,}[\s|:-]*$/.test(line)) continue; // separator row
        tableRowCount++;
        lineCount++;
        continue;
      }

      lineCount++;
    }

    return { lineCount, bulletCount, codeLineCount, tableRowCount };
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
