/**
 * AI Prompt Fragments
 *
 * Single source of truth for prompt fragment imports, layout-list
 * generation, and message composition. All modules that compose prompts
 * import from here instead of importing `?raw` fragments directly.
 */

import { AiPromptComposer, collectPlaceholders } from "./ai-prompt-composer.js";
import { LayoutData } from "../layout-data.js";
import { splitBackgroundValue, findFencedRanges } from "../image-markdown-parser.js";
import { splitSlides } from "../markdown-parser.js";
import { extractVisualSystemFromMarkdown } from "./visual-system-schema.js";
import { isColorDark } from "../pptx-color-utils.js";

import systemPrompt from "../prompts/system-prompt.md?raw";
import fixPrompt from "../prompts/fix-prompt.md?raw";
import generatePrompt from "../prompts/generate-prompt.md?raw";
import polishPrompt from "../prompts/polish-prompt.md?raw";
import addSpeakerNotesPrompt from "../prompts/add-speaker-notes-prompt.md?raw";
import remixPlanPrompt from "../prompts/remix-plan-prompt.md?raw";
import reimagineOutlinePrompt from "../prompts/reimagine-outline-prompt.md?raw";
import reimagineBreakdownPrompt from "../prompts/reimagine-breakdown-prompt.md?raw";
import reimagineFlowTechniques from "../prompts/reimagine-flow-techniques.md?raw";
import flowGuidance from "../prompts/flow-guidance.md?raw";
import remixFlowGuidance from "../prompts/remix-flow-guidance.md?raw";
import speakerNotesGuidance from "../prompts/speaker-notes-guidance.md?raw";
import visualIdentityGuidance from "../prompts/visual-identity-guidance.md?raw";
import remixVisualIdentityGuidance from "../prompts/remix-visual-identity-guidance.md?raw";
import visualStylingNote from "../prompts/visual-styling-note.md?raw";
import imagesGuidance from "../prompts/images-guidance.md?raw";
import batchPagination from "../prompts/batch-pagination.md?raw";
import creativeGuidance from "../prompts/creative-guidance.md?raw";
import repairMessage from "../prompts/repair-message.md?raw";
import densityBudgets from "../prompts/density-budgets.md?raw";

const DEFAULT_DARK_BG = "#1a1a2e";
const DEFAULT_LIGHT_BG = "#ffffff";

/**
 * Pattern for a single CSS color token: hex (3/6/8 digits), rgb(), rgba(),
 * hsl(), or hsla().  Named CSS colors are intentionally rejected — the AI
 * should use explicit hex/rgb/hsl values or CSS gradients.
 */
const COLOR_TOKEN_RE =
  /^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|rgb\([^)]*\)|rgba\([^)]*\)|hsl\([^)]*\)|hsla\([^)]*\))$/;

/**
 * Pattern for a `url(...)` token — only quotes or unquoted paths, no
 * `javascript:` or `data:` schemes.
 */
/**
 * Block dangerous URL schemes in CSS `url()` tokens. The negative lookahead
 * permits `data:image/(avif|bmp|gif|jpeg|jpg|png|webp)` and rejects all other
 * `data:` variants (text, html, svg, etc.).
 */
const DANGEROUS_BG_SCHEMES =
  /^(javascript|vbscript|data(?![a-z]*:image\/(?:avif|bmp|gif|jpeg|jpg|png|webp)(?:[;,]|$))):/i;

/**
 * Validate a single CSS `url(...)` token. Strips optional quotes, trims
 * whitespace, and percent-decodes `:` to catch `%3a` bypasses.
 * @param {string} token
 * @returns {boolean}
 */
function isSafeUrlToken(token) {
  const m = token.match(/^url\(\s*(['"]?)([\s\S]*?)\1\s*\)$/i);
  if (!m) return false;
  const inner = m[2].trim();
  if (!inner) return false;
  const decoded = inner.replace(/%3a/gi, ":");
  return !DANGEROUS_BG_SCHEMES.test(decoded);
}

/**
 * Pattern for CSS background position/size keywords and numeric values.
 * These are valid in the `background:` shorthand alongside colors and images
 * (e.g. `url(img.png) center/cover #fff`).
 */
const POSITION_KEYWORD_RE =
  /^(repeat-x|repeat-y|no-repeat|repeat|round|space|cover|contain|center|top|bottom|left|right|fixed|local|scroll|border-box|padding-box|content-box|auto|initial|inherit|unset)$/i;
const NUMERIC_RE = /^[\d.]+(%|px|em|rem|vh|vw)?$/i;
// Position/size shorthand: `center/cover`, `50%/cover`, `left 50%/100px`, etc.
const POSITION_SIZE_RE = /^[\w.]+(%|px|em|rem|vh|vw)?\/[\w.]+(%|px|em|rem|vh|vw|auto)?$/i;

/**
 * Check if a token is a CSS gradient with potentially nested function calls
 * (e.g. `linear-gradient(135deg, rgba(0,0,0,.5), transparent)`).
 * The simple regex `[^)]*` fails on nested parens, so we do a structural check:
 * the token starts with a gradient function name followed by `(`, the
 * parentheses are balanced, and the content does not contain dangerous
 * schemes (`javascript:`, `data:`, `expression(`).
 *
 * @param {string} token
 * @returns {boolean}
 */
function isGradientToken(token) {
  const match = token.match(/^(linear-gradient|radial-gradient|conic-gradient)\(/i);
  if (!match) return false;
  let depth = 0;
  for (const ch of token) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth < 0) return false;
  }
  if (depth !== 0) return false;
  // Reject gradients that embed dangerous URL schemes or expression().
  if (/javascript:|data:|expression\(/i.test(token)) return false;
  return true;
}

/**
 * Validate a `background:` value from AI output before writing it into
 * markdown.  Accepts:
 * - Solid hex colors (`#abc`, `#aabbcc`, `#aabbccff`)
 * - `rgb()`, `rgba()`, `hsl()`, `hsla()` colors
 * - Named CSS colors (`white`, `red`, etc.)
 * - CSS gradients (`linear-gradient(...)`, etc.) with nested functions
 * - `url(...)` image references (no `javascript:` or `data:` schemes)
 * - Background position/size keywords (`center`, `cover`, `top`, etc.)
 * - Numeric position values (`50%`, `100px`, etc.)
 * - Position/size shorthand (`50%/cover`, `center/cover`, etc.)
 * - Combinations of the above separated by spaces
 *
 * Returns the value if valid, or `null` if it contains anything that is not
 * a recognised safe CSS background token.  Callers should replace `null`
 * with a fallback color.
 *
 * @param {string} value
 * @returns {string|null}
 */
function validateBackgroundValue(value) {
  const v = String(value || "").trim();
  if (!v) return null;

  // Split on whitespace and layer commas, but respect parentheses
  // (gradients, url(), rgb() — their internal commas must not split).
  const tokens = [];
  let depth = 0;
  let current = "";
  for (const ch of v) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if ((ch === " " || ch === ",") && depth === 0) {
      if (current) tokens.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);

  for (const token of tokens) {
    if (
      !COLOR_TOKEN_RE.test(token) &&
      !isSafeUrlToken(token) &&
      !isGradientToken(token) &&
      !POSITION_KEYWORD_RE.test(token) &&
      !NUMERIC_RE.test(token) &&
      !POSITION_SIZE_RE.test(token)
    ) {
      return null;
    }
  }
  return v;
}

export const FRAGMENTS = {
  "system-prompt.md": systemPrompt,
  "fix-prompt.md": fixPrompt,
  "generate-prompt.md": generatePrompt,
  "polish-prompt.md": polishPrompt,
  "add-speaker-notes-prompt.md": addSpeakerNotesPrompt,
  "remix-plan-prompt.md": remixPlanPrompt,
  "reimagine-outline-prompt.md": reimagineOutlinePrompt,
  "reimagine-breakdown-prompt.md": reimagineBreakdownPrompt,
  "reimagine-flow-techniques.md": reimagineFlowTechniques,
  "flow-guidance.md": flowGuidance,
  "remix-flow-guidance.md": remixFlowGuidance,
  "speaker-notes-guidance.md": speakerNotesGuidance,
  "visual-identity-guidance.md": visualIdentityGuidance,
  "remix-visual-identity-guidance.md": remixVisualIdentityGuidance,
  "visual-styling-note.md": visualStylingNote,
  "images-guidance.md": imagesGuidance,
  "batch-pagination.md": batchPagination,
  "creative-guidance.md": creativeGuidance,
  "repair-message.md": repairMessage,
  "density-budgets.md": densityBudgets,
};

/**
 * Get a raw fragment by filename, e.g. "system-prompt.md".
 * @param {string} name
 * @returns {string}
 */
export function getFragment(name) {
  const fragment = FRAGMENTS[name];
  if (!fragment) throw new Error(`Unknown prompt fragment: ${name}`);
  return fragment;
}

const VARIANT_MARKER_RE = /<!--\s*variant:\s*([\w-]+)\s*-->/g;

// Parse results are memoized per fragment content; parsing is deterministic
// for a given string, and snippet fragments are re-extracted on every call.
const variantCache = new Map();

/**
 * Parse a snippet fragment into a { name: body } map using full
 * `<!-- variant: name -->` markers. Throws on duplicate markers and on
 * non-whitespace text before the first marker (such text would otherwise be
 * silently dropped from the prompt).
 * @param {string} fragment
 * @returns {Map<string, string>}
 */
export function parseVariants(fragment) {
  const cached = variantCache.get(fragment);
  if (cached) return cached;

  const variants = new Map();
  const markers = [];
  for (const match of fragment.matchAll(VARIANT_MARKER_RE)) {
    markers.push({ name: match[1], start: match.index, end: match.index + match[0].length });
  }
  const preamble = markers.length > 0 ? fragment.slice(0, markers[0].start).trim() : "";
  if (preamble) {
    throw new Error(
      `Text before the first variant marker would be dropped from the prompt: "${preamble.slice(0, 60)}"`,
    );
  }
  for (let i = 0; i < markers.length; i++) {
    const { name } = markers[i];
    const end = i + 1 < markers.length ? markers[i + 1].start : fragment.length;
    const body = fragment.slice(markers[i].end, end).trim();
    if (variants.has(name)) {
      throw new Error(`Duplicate variant "${name}" in prompt snippet`);
    }
    variants.set(name, body);
  }
  variantCache.set(fragment, variants);
  return variants;
}

/**
 * Check whether a snippet fragment contains a `<!-- variant: name -->` section.
 * @param {string} fragment
 * @param {string} name
 * @returns {boolean}
 */
export function hasVariant(fragment, name) {
  return parseVariants(fragment).has(name);
}

/**
 * Extract a `<!-- variant: name -->` section from a snippet fragment.
 * @param {string} fragment
 * @param {string} name
 * @returns {string}
 */
export function extractVariant(fragment, name) {
  const variants = parseVariants(fragment);
  const body = variants.get(name);
  if (body === undefined) {
    const available =
      variants.size > 0
        ? ` (available: ${[...variants.keys()].join(", ")})`
        : " (no variants found)";
    throw new Error(`Variant "${name}" not found in prompt fragment${available}`);
  }
  return body;
}

/**
 * Build the `{{imagesSection}}` fragment for the remix plan prompt. The
 * keepImages / image-assessment guidance is only relevant (and only
 * truthful) when images are actually attached to the request — omitting it
 * for text-only plans stops the model from hallucinating keepImages against
 * pictures it never saw.
 * @param {boolean} imagesSent
 * @returns {string}
 */
export function buildImagesSectionForPrompt(imagesSent) {
  return extractVariant(getFragment("images-guidance.md"), imagesSent ? "sent" : "not-sent");
}

/**
 * Build the `{{visualIdentityGuidance}}` fragment for the remix plan prompt.
 * @param {boolean} preserveVisualIdentity
 * @returns {string}
 */
export function buildRemixVisualIdentityGuidance(preserveVisualIdentity) {
  return extractVariant(
    getFragment("remix-visual-identity-guidance.md"),
    preserveVisualIdentity ? "preserve" : "discard",
  );
}

/**
 * Build the `{{flowGuidance}}` substitution for the remix plan prompt.
 * Flow-specific restructuring priorities (keep/reorder/merge/rewrite bias)
 * for the plan phase. Returns an empty string when the flow is unknown or
 * not provided, so the plan prompt stays flow-blind for callers that do not
 * supply a flow.
 * @param {string} [flow] — one of "instructional", "story", "technical", "persuasive"
 * @returns {string}
 */
export function buildRemixFlowGuidance(flow) {
  const fragment = getFragment("remix-flow-guidance.md");
  return flow && hasVariant(fragment, flow) ? extractVariant(fragment, flow) : "";
}

/**
 * Build the {{visualStylingNote}} substitution for generate prompts.
 * Variant selection:
 * - "present" — a visual system is provided (reimagine): emit `theme:` and
 *   `background:` for every slide, using the visual direction below for
 *   layout/background choices but picking any professional colors or images.
 * - "absent-preserve" — no visual system, but the deck's existing identity
 *   must be kept (remix preserve mode): keep the original theme/background/
 *   color directives instead of emitting neutral styling.
 * - "absent" — default: the app provides its own neutral color scheme and no
 *   custom `background:`/`theme:`/color directives may be emitted.
 * - "remix-discard" — used when remix discards the original visual identity:
 *   the AI may choose a new professional color scheme, `theme:`, `background:`,
 *   and colored text. Vary backgrounds across the deck.
 * @param {boolean} hasVisualSystem
 * @param {boolean} [preserveVisualIdentity]
 * @param {string} [mode] — "remix", "reimagine", "polish", "generate", etc.
 * @returns {string}
 */
export function buildVisualStylingNote(
  hasVisualSystem,
  preserveVisualIdentity = false,
  mode = null,
) {
  const variant = hasVisualSystem
    ? "present"
    : mode === "remix" && !preserveVisualIdentity
      ? "remix-discard"
      : preserveVisualIdentity
        ? "absent-preserve"
        : "absent";
  return extractVariant(getFragment("visual-styling-note.md"), variant);
}

/**
 * Build the {{densityBudgets}} substitution for generate and polish prompts.
 * The "full" variant is used by generate-prompt.md (standalone density section);
 * the "compact" variant is used by polish-prompt.md (inline in crowded-slides bullet).
 * @param {"full"|"compact"} variant
 * @returns {string}
 */
export function buildDensityBudgets(variant) {
  return extractVariant(getFragment("density-budgets.md"), variant);
}

/**
 * Build a compact JSON serialization of the visual system for the breakdown
 * prompt's `{{visualSystem}}` placeholder. Includes the freeform visual
 * direction string.
 * @param {import("./visual-system-schema.js").VisualSystem|null} vs
 * @returns {string}
 */
export function serializeVisualSystemForBreakdown(vs) {
  if (!vs) return "{}";
  const out = { visualDirection: vs.visualDirection };
  return JSON.stringify(out, null, 2);
}

/**
 * Build the `{{keptImages}}` section for the breakdown prompt.
 * Lists the kept image paths from the original deck so the breakdown AI
 * can reference them via `reuse:<path>` in `imageQuery`.
 * @param {string[]} keptImageSrcs — original markdown src paths of kept images
 * @returns {string}
 */
export function buildKeptImagesList(keptImageSrcs) {
  if (!keptImageSrcs || keptImageSrcs.length === 0) {
    return "No images from the original deck were kept. Omit imageQuery for all slides.";
  }
  const lines = keptImageSrcs.map((src) => `- ${src}`).join("\n");
  return `Kept images from the original deck (only allowed as \`reuse:<path>\` in imageQuery):\n${lines}`;
}

/**
 * Build the available-images brief for the generate prompt's options suffix.
 * Lists the kept image paths so the Generate AI can insert them where
 * appropriate. Returns an empty string when no images are available.
 * @param {string[]} keptImageSrcs — original markdown src paths of kept images
 * @returns {string}
 */
const VISUAL_DIRECTION_BEGIN = "<<<USER-VISUAL-DIRECTION>>>";
const VISUAL_DIRECTION_END = "<<<END-USER-VISUAL-DIRECTION>>>";

function escapePromptUserString(s) {
  if (!s) return "";
  return s
    .replace(/<<<|>>>/g, "")
    .replace(/`/g, "'")
    .replace(/\n+/g, " ");
}

function wrapUserString(s) {
  const safe = escapePromptUserString(s);
  if (!safe) return "None";
  return `${VISUAL_DIRECTION_BEGIN}\n${safe}\n${VISUAL_DIRECTION_END}`;
}

export function buildAvailableImagesBrief(keptImageSrcs) {
  if (!keptImageSrcs || keptImageSrcs.length === 0) return "";
  const json = JSON.stringify(keptImageSrcs);
  return `\nAvailable images from the original deck — insert with \`<img src="path">\` where appropriate (use the exact path listed):\n${json}\n`;
}

/**
 * Build the minimal visual system brief for the generate prompt's options
 * suffix. When a visual system is present, this provides the freeform visual
 * direction to inform the model's `layout:`, `theme:`, and `background:`
 * choices.
 *
 * Returns an empty string when no visual system is provided so the existing
 * generic visual-styling guidance applies.
 *
 * @param {import("./visual-system-schema.js").VisualSystem|null} vs
 * @returns {string}
 */
export function buildVisualSystemBrief(vs) {
  if (!vs) return "";

  return `
Visual direction for this deck:

${wrapUserString(vs.visualDirection)}
`;
}

const ALLOWED_AREAS = ["title", "header", "main", "media", "secondary", "sidebar", "footer"];

/**
 * Build the layout list injected into the system prompt.
 *
 * Uses a per-layout line format (`layout: @area1, @area2, ...`) rather than a
 * wide cross-reference table. The table format (8 columns × 12 rows) was hard
 * for the AI to scan accurately — it frequently used `@secondary` for
 * `two-column` (which only has `@media`) or dropped `@main` from
 * `media-span-left`/`media-span-right`.
 * The per-layout format makes each layout's allowed areas unambiguous.
 *
 * @returns {string}
 */
export function getAllowedLayoutList() {
  const layouts = LayoutData.getValidLayoutNames();
  const lines = [];
  for (const layout of layouts) {
    const allowedAreas = LayoutData.getAreaNames(layout);
    const areaTags = ALLOWED_AREAS.filter((a) => allowedAreas.includes(a)).map((a) => `@${a}`);
    lines.push(`${layout}: ${areaTags.join(", ")}`);
  }
  return lines.join("\n");
}

/**
 * Compose system + user messages from fragments, auto-filling the shared
 * `{{layoutList}}` substitution when the fragments reference it. Callers
 * pass only their intent-specific substitutions.
 * @param {string} systemFragment
 * @param {string} userFragment
 * @param {Object<string, string>} substitutions
 * @returns {{ system: string, user: string }}
 */
export function composeMessages(systemFragment, userFragment, substitutions = {}) {
  const placeholders = collectPlaceholders(systemFragment, userFragment);
  const filled = { ...substitutions };
  if (placeholders.has("layoutList")) filled.layoutList ??= getAllowedLayoutList();
  return new AiPromptComposer({ systemFragment, userFragment }).compose(filled);
}

/**
 * Strip `theme:` and `background:` directives from markdown.
 * Only replaces directives outside fenced code blocks. Leading whitespace and
 * case are tolerated — the markdown parser accepts both (`^\s*${name}\s*:` with
 * the `i` flag), so an indented `  theme: dark` would otherwise render while
 * surviving the strip.
 *
 * @param {string} markdown
 * @returns {string}
 */
export function stripThemeAndBackground(markdown) {
  return stripDirectives(markdown, /^\s*(theme|background)\s*:\s*.*$/i);
}

/**
 * Strip visual-identity directives from AI output while keeping image
 * backgrounds. `theme:` lines and color/gradient `background:` directives are
 * removed, but `background: url(...)` values are kept — the execute-phase
 * validator (restrictImageSources) guarantees those URLs resolve to deck
 * images, so an image background is content, not identity, and stripping it
 * would silently empty a full-bleed slide the model deliberately composed.
 *
 * A single background layer can mix a color with an image (e.g.
 * `background: #fff url(images/hero.png)`), so a value is split via
 * `splitBackgroundValue` rather than classified as "image" wholesale just
 * because it contains `url(` anywhere — otherwise a stale/invented color
 * riding alongside a legitimate image would survive this strip and
 * contradict discard mode's "no stale visual directives" guarantee.
 *
 * Used for the final deck in reimagine (always) and remix discard mode.
 *
 * @param {string} markdown
 * @returns {string}
 */
export function stripVisualIdentity(markdown) {
  return stripDirectivesWith(markdown, (line) => {
    const match = line.match(/^\s*(theme|background|area-bg-[\w-]+)\s*:\s*(.*)$/i);
    if (!match) return false;
    const name = match[1].toLowerCase();
    if (name === "theme") return true; // strip theme entirely
    // background: and area-bg-<name>: follow the same rule — a per-area
    // background is also visual identity, so pure colors/gradients are
    // stripped while image layers (content) survive, mirroring background.
    const { colorPart, imagePart, hasImage } = splitBackgroundValue(match[2]);
    if (!hasImage) return true; // pure color/gradient — strip
    if (!colorPart) return false; // pure image — keep the line as-is
    return `${name}: ${imagePart}`; // mixed — drop the smuggled color, keep the image
  });
}

/**
 * Returns a readable theme for a solid-hex background or the first hex color
 * found in a gradient/string.
 * @param {string} color
 * @returns {"light"|"dark"|null}
 */
function themeForColor(color) {
  const value = String(color || "").trim();
  if (!value) return null;
  // isColorDark handles both solid hex colors and gradient strings (it
  // extracts all hex colors from a gradient and picks the darkest one).
  // Passing the full value avoids the previous behavior of matching only
  // the first hex color in a gradient, which could misclassify a gradient
  // whose first stop is light but whose overall mass is dark.
  // Return null for values with no hex color so callers keep the existing theme.
  if (!/#[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?/i.test(value)) return null;
  return isColorDark(value) ? "dark" : "light";
}

/**
 * Apply a visual system to generated markdown. The visual system is now a
 * descriptive style guide, not a strict color palette, so this pass does not
 * restrict colors. It only:
 *
 * - leaves `theme:` and `background:` values (including arbitrary colors,
 *   gradients, and images) untouched,
 * - infers `theme:` from the first hex color in a `background:` gradient/color
 *   when `theme:` is missing or obviously mismatched,
 * - adds a sensible fallback (`theme: dark` and a real dark background color)
 *   when either directive is missing, and replaces invalid values such as
 *   `transparent` or `none` so slides do not end up see-through.
 *
 * @param {string} markdown
 * @param {import("./visual-system-schema.js").VisualSystem} visualSystem
 * @returns {string}
 */
export function applyVisualSystemIdentity(markdown, visualSystem) {
  if (!visualSystem) return markdown;

  const slides = splitSlides(markdown);

  const fixed = slides.map((slide) => {
    const lines = slide.split("\n");
    const commentLines = [];
    const directiveOrder = [];
    const directiveMap = new Map();
    const body = [];
    let inLeading = true;
    const anyDirective = /^\s*([a-zA-Z][\w-]*)\s*:\s*(.*)$/i;
    const htmlComment = /^\s*<!--/;
    const visualSystemComment = /^\s*<!--\s*visual-system:/i;

    for (const line of lines) {
      if (inLeading && line.trim() === "") continue;
      if (inLeading && htmlComment.test(line)) {
        // Drop any stray AI-generated visual-system comments so they do not
        // leak into the rendered slide body.
        if (visualSystemComment.test(line)) continue;
        commentLines.push(line);
        continue;
      }
      const match = line.match(anyDirective);
      if (inLeading && match) {
        const name = match[1].toLowerCase();
        // Avoid duplicating directives when the AI emits the same directive
        // twice (e.g. `layout: title-slide` on two consecutive lines).
        // directiveMap.set overwrites the value, but directiveOrder must not
        // record the name a second time or the rebuild loop will emit it twice.
        if (!directiveMap.has(name)) directiveOrder.push(name);
        directiveMap.set(name, { line, value: match[2].trim() });
        continue;
      }
      inLeading = false;
      body.push(line);
    }

    let backgroundValue = directiveMap.get("background")?.value;
    let themeValue = directiveMap.get("theme")?.value;

    // If a background color/gradient is present, make sure `theme:` is legible.
    if (backgroundValue) {
      const { colorPart } = splitBackgroundValue(backgroundValue);
      const inferred = themeForColor(colorPart);

      if (inferred && (!themeValue || themeValue.toLowerCase() !== inferred)) {
        themeValue = inferred;
      }
    }

    // Fall back to a real, legible dark theme if the model omitted directives.
    if (!themeValue) themeValue = "dark";

    const { imagePart } = splitBackgroundValue(backgroundValue || "");
    const validBackground = validateBackgroundValue(backgroundValue || "");
    // Discard image parts that are just layout keywords (e.g. "none",
    // "cover", "center") or contain dangerous URL schemes — only keep
    // real, validated url(...) references.
    const safeImagePart = imagePart && isSafeUrlToken(imagePart) ? imagePart : "";
    if (!validBackground) {
      const fallbackColor =
        themeValue.toLowerCase() === "light" ? DEFAULT_LIGHT_BG : DEFAULT_DARK_BG;
      backgroundValue = safeImagePart || fallbackColor;
    } else {
      backgroundValue = validBackground;
    }

    const leading = [...commentLines];
    for (const name of directiveOrder) {
      if (name === "theme" || name === "background") continue;
      leading.push(directiveMap.get(name).line);
    }
    // Ensure theme comes before background in the leading block.
    leading.push(`theme: ${themeValue}`);
    leading.push(`background: ${backgroundValue}`);

    if (body.length === 0 && leading.length === 0) return slide.trim();
    if (body.length === 0) return leading.join("\n").trim();
    return [...leading, "", ...body].join("\n").trim();
  });

  return fixed.join("\n\n---\n\n");
}

/**
 * Strip frontmatter directives from markdown.
 * Only replaces directives outside fenced code blocks.
 *
 * Fix mode: keeps layout (so AI preserves it), strips theme/background/hidden/code-font-size
 *   (restored post-AI via injectDirectives/restoreDirectives).
 * Generate mode: strips layout, hidden, code-font-size — keeps background and theme
 *   so the AI can see the originals and make informed decisions.
 *
 * @param {string} markdown
 * @param {"fix"|"generate"} mode
 * @returns {string}
 */
export function stripFrontmatter(markdown, mode) {
  // Remove the top-level visual-system HTML comment if present; the prompt
  // builder injects the visual system separately via opts.visualSystem.
  const { markdown: withoutComment } = extractVisualSystemFromMarkdown(markdown);

  if (mode === "generate") {
    // Generate mode: keep background and theme so AI sees the originals
    return stripDirectives(
      withoutComment,
      /^\s*(layout|media-full-bleed|media-span|hidden|code-font-size)\s*:\s*.*$/i,
    );
  }
  // Fix mode: keep layout so AI preserves it; strip theme/background/hidden/code-font-size
  return stripDirectives(
    withoutComment,
    /^\s*(theme|background|media-full-bleed|media-span|hidden|code-font-size)\s*:\s*.*$/i,
  );
}

function stripDirectives(markdown, pattern) {
  return stripDirectivesWith(markdown, (line) => pattern.test(line));
}

/**
 * Strip or rewrite leading-block directives via `processLine`, replacing
 * stripped lines with a single blank separator and collapsing blank-line runs.
 * Only processes the slide's leading directive block (blank lines and
 * `name: value` lines before the first body line); content lines such as a
 * sentence starting with "Background:" are left untouched. Fence content is
 * kept verbatim so code samples (e.g. two blank lines between Python
 * functions) are never reformatted.
 * @param {string} markdown
 * @param {(line: string) => boolean|string} processLine — return `true` to
 *   strip the line, `false` to keep it unchanged, or a string to replace it
 *   (e.g. rewriting a mixed color+image `background:` line to drop only the
 *   color part).
 * @returns {string}
 */
function stripDirectivesWith(markdown, processLine) {
  const lines = markdown.split("\n");
  const out = [];
  let pendingBlank = false;
  let inLeadingBlock = true;
  // Any directive-looking line keeps the leading block open so a
  // non-stripped directive (e.g. `layout:`) does not end the block early
  // and strand a later `theme:`/ `background:` line in the body.
  const anyDirective = /^\s*[a-zA-Z][\w-]*\s*:/i;

  // Fence-aware: `~~~` and ` ``` ` fences are kept verbatim, and a bare `---`
  // inside a fence must not be treated as a slide separator.
  const fences = findFencedRanges(markdown);
  const inFenceAt = (offset) => fences.some((r) => offset >= r.start && offset < r.end);
  let offset = 0;

  const flushBlank = () => {
    if (pendingBlank) {
      out.push("");
      pendingBlank = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = offset;
    const lineEnd = offset + line.length + (i < lines.length - 1 ? 1 : 0);
    const lineInFence = inFenceAt(lineStart);

    if (lineInFence) {
      // Preserve fenced content exactly, including blank lines and `---`.
      flushBlank();
      out.push(line);
      offset = lineEnd;
      // A fence ends the leading directive block.
      inLeadingBlock = false;
      continue;
    }

    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      // A fence opener ends the leading block and is kept verbatim.
      inLeadingBlock = false;
      flushBlank();
      out.push(line);
      offset = lineEnd;
      continue;
    }

    if (line.trim() === "") {
      pendingBlank = true;
      offset = lineEnd;
      continue;
    }

    // Slide separator — each slide has its own leading directive block.
    // A bare `---` outside fences is treated as a separator.
    if (line.trim() === "---") {
      flushBlank();
      inLeadingBlock = true;
      out.push(line);
      offset = lineEnd;
      continue;
    }

    if (inLeadingBlock) {
      if (!anyDirective.test(line)) {
        // First non-blank, non-directive line ends the leading block.
        inLeadingBlock = false;
      } else {
        const result = processLine(line);
        if (result === true) {
          pendingBlank = true;
          offset = lineEnd;
          continue;
        }
        if (typeof result === "string") {
          flushBlank();
          out.push(result);
          offset = lineEnd;
          continue;
        }
        // result === false: keep the directive line as-is and continue the
        // leading block so subsequent directives can still be stripped.
      }
    }

    flushBlank();
    out.push(line);
    offset = lineEnd;
  }
  return out.join("\n").trim();
}
