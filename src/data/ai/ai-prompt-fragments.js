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

/**
 * Parse a snippet fragment into a { name: body } map using full
 * `<!-- variant: name -->` markers. Throws on duplicate markers.
 * @param {string} fragment
 * @returns {Map<string, string>}
 */
export function parseVariants(fragment) {
  const variants = new Map();
  const markers = [];
  for (const match of fragment.matchAll(VARIANT_MARKER_RE)) {
    markers.push({ name: match[1], start: match.index, end: match.index + match[0].length });
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
    throw new Error(
      `Variant "${name}" not found in prompt fragment (available: ${[...variants.keys()].join(", ")})`,
    );
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

const ALLOWED_AREAS = ["title", "header", "main", "media", "secondary", "sidebar", "footer"];

/**
 * Build the layout list injected into the system prompt.
 *
 * Uses a per-layout line format (`layout: @area1, @area2, ...`) rather than a
 * wide cross-reference table. The table format (8 columns × 12 rows) was hard
 * for the AI to scan accurately — it frequently used `@secondary` for
 * `two-column` (which only has `@media`) or dropped `@main` from `media-span`.
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
