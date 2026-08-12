/**
 * AI Prompt Fragments
 *
 * Single source of truth for prompt fragment imports, layout-list
 * generation, and message composition. All modules that compose prompts
 * import from here instead of importing `?raw` fragments directly.
 */

import { AiPromptComposer, collectPlaceholders } from "./ai-prompt-composer.js";
import { LayoutData } from "../layout-data.js";

import systemPrompt from "../prompts/system-prompt.md?raw";
import fixPrompt from "../prompts/fix-prompt.md?raw";
import generatePrompt from "../prompts/generate-prompt.md?raw";
import polishPrompt from "../prompts/polish-prompt.md?raw";
import addSpeakerNotesPrompt from "../prompts/add-speaker-notes-prompt.md?raw";
import remixPlanPrompt from "../prompts/remix-plan-prompt.md?raw";
import reimagineOutlinePrompt from "../prompts/reimagine-outline-prompt.md?raw";
import reimagineBreakdownPrompt from "../prompts/reimagine-breakdown-prompt.md?raw";
import flowGuidance from "../prompts/flow-guidance.md?raw";
import speakerNotesGuidance from "../prompts/speaker-notes-guidance.md?raw";
import visualIdentityGuidance from "../prompts/visual-identity-guidance.md?raw";
import remixVisualIdentityGuidance from "../prompts/remix-visual-identity-guidance.md?raw";
import imagesGuidance from "../prompts/images-guidance.md?raw";
import batchPagination from "../prompts/batch-pagination.md?raw";
import creativeGuidance from "../prompts/creative-guidance.md?raw";
import repairMessage from "../prompts/repair-message.md?raw";

export const FRAGMENTS = {
  "system-prompt.md": systemPrompt,
  "fix-prompt.md": fixPrompt,
  "generate-prompt.md": generatePrompt,
  "polish-prompt.md": polishPrompt,
  "add-speaker-notes-prompt.md": addSpeakerNotesPrompt,
  "remix-plan-prompt.md": remixPlanPrompt,
  "reimagine-outline-prompt.md": reimagineOutlinePrompt,
  "reimagine-breakdown-prompt.md": reimagineBreakdownPrompt,
  "flow-guidance.md": flowGuidance,
  "speaker-notes-guidance.md": speakerNotesGuidance,
  "visual-identity-guidance.md": visualIdentityGuidance,
  "remix-visual-identity-guidance.md": remixVisualIdentityGuidance,
  "images-guidance.md": imagesGuidance,
  "batch-pagination.md": batchPagination,
  "creative-guidance.md": creativeGuidance,
  "repair-message.md": repairMessage,
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
 * Build a compact JSON serialization of the visual system for the breakdown
 * prompt's `{{visualSystem}}` placeholder.
 * @param {import("./visual-system-schema.js").VisualSystem|null} vs
 * @returns {string}
 */
export function serializeVisualSystemForBreakdown(vs) {
  if (!vs) return "{}";
  return JSON.stringify(vs);
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
export function buildAvailableImagesBrief(keptImageSrcs) {
  if (!keptImageSrcs || keptImageSrcs.length === 0) return "";
  const lines = keptImageSrcs.map((src) => `- ${src}`).join("\n");
  return `\nAvailable images from the original deck — insert with \`<img src="path">\` where appropriate (use the exact path listed):\n${lines}\n`;
}

/**
 * Build the visual system brief + beat→treatment mapping for the generate
 * prompt's options suffix. When a visual system is present, this overrides
 * the generate prompt's generic "Pick ONE coherent visual theme" instruction
 * with specific design-language guidance.
 *
 * Returns an empty string when no visual system is provided so the existing
 * generic visual-styling guidance applies.
 *
 * @param {import("./visual-system-schema.js").VisualSystem|null} vs
 * @returns {string}
 */
export function buildVisualSystemBrief(vs) {
  if (!vs) return "";

  // The visual system is for structural guidance only. The app handles its own
  // colors, so we explicitly tell the generate AI not to use the palette.
  return `
Visual system — use the following design language for composition, imagery, and rhythm, but do NOT use the palette colors in \`background:\`, \`theme:\`, \`color\`, or \`backgroundColor\` directives. The app provides its own neutral color scheme.

- Composition: ${vs.composition.density} density, ${vs.composition.whitespace} whitespace, ${vs.composition.alignment} alignment
- Imagery: ${vs.imagery.role}; mood: ${vs.imagery.mood}; treatment: ${vs.imagery.treatment}

Do not output \`background:\`, \`theme:\`, or colored text. Use bold, headings, tables, diagrams, and layout to create emphasis, not color.

Each slide brief includes a \`| beat: ...\` suffix that defines the slide's structural role. Use it to vary layout and density, not to inject color.
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
  const layouts = LayoutData.getAllLayouts().filter((name) => LayoutData.hasLayout(name));
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
 * Only replaces directives outside fenced code blocks.
 *
 * @param {string} markdown
 * @returns {string}
 */
export function stripThemeAndBackground(markdown) {
  return stripDirectives(markdown, /^(theme|background):\s*.*$/);
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
  if (mode === "generate") {
    // Generate mode: keep background and theme so AI sees the originals
    return stripDirectives(markdown, /^(layout|media-span|hidden|code-font-size):\s*.*$/);
  }
  // Fix mode: keep layout so AI preserves it; strip theme/background/hidden/code-font-size
  return stripDirectives(markdown, /^(theme|background|media-span|hidden|code-font-size):\s*.*$/);
}

function stripDirectives(markdown, pattern) {
  const lines = markdown.split("\n");
  const result = [];
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      result.push(line);
      continue;
    }
    if (inFence) {
      result.push(line);
      continue;
    }
    if (pattern.test(line)) {
      result.push("");
      continue;
    }
    result.push(line);
  }
  return result
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
