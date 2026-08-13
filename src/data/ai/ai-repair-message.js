/**
 * Build a focused repair message from validation errors.
 * This is sent back to the LLM as a follow-up user message when validation fails.
 *
 * The message template lives in `src/data/prompts/repair-message.md`; this
 * module formats the per-error issue list (grouped by slide) and appends
 * error-code-specific guidance, filling the {{issues}} and {{guidance}} slots.
 *
 * Note: no strict placeholder check here — error messages embed model output
 * verbatim (e.g. a hallucinated layout name containing `{{...}}`) and must
 * never abort the repair loop.
 */

import { getFragment } from "./ai-prompt-fragments.js";
import { replacePlaceholders } from "./ai-prompt-composer.js";
import { LayoutData } from "../layout-data.js";
import { KNOWN_TEXT_BLOCK_ATTRIBUTES } from "../../core/text-block-directive.js";

/**
 * Actionable, code-specific guidance appended once per distinct error code
 * present in the batch. Kept short — the AI reads this alongside the full
 * deck, so the repair message must stay a focused checklist, not a repeat
 * of the system prompt rules.
 */
const CODE_GUIDANCE = new Map([
  [
    "SLIDE_CONTENT_OVERFLOW",
    "Reduce content density — trim bullets, move detail to speaker notes, or split the slide.",
  ],
  // getValidLayoutNames() applies the same hasLayout() filter as
  // getAllowedLayoutList() (see ai-prompt-fragments.js) so the two lists
  // can't drift — a custom layout with an empty/falsy stored grid template
  // would otherwise be advertised here as valid and rejected on retry.
  ["UNKNOWN_LAYOUT", () => `Valid layouts: ${LayoutData.getValidLayoutNames().join(", ")}.`],
  // Each INVALID_AREA issue message above already states that slide's
  // allowed areas ("... allows only: ..."), so this points back at the
  // issue list itself rather than repeating a layout→area table here.
  ["INVALID_AREA", "Each area issue above lists that slide's allowed @areas — use only those."],
  ["MISSING_LAYOUT", "Add a `layout:` directive at the top of each slide."],
  [
    "UNKNOWN_TEXT_BLOCK_ATTR",
    () => `Supported text-block attributes: ${[...KNOWN_TEXT_BLOCK_ATTRIBUTES].join(", ")}.`,
  ],
  ["MALFORMED_TEXT_BLOCK", "Wrap text-block attributes in braces: `::: text-block { ... }`."],
]);

/**
 * Group errors by slide, preserving the order slides first appear in.
 * @param {ValidationError[]} errors
 * @returns {Array<[number, ValidationError[]]>}
 */
function groupBySlide(errors) {
  const order = [];
  const bySlide = new Map();
  for (const err of errors) {
    if (!bySlide.has(err.slide)) {
      bySlide.set(err.slide, []);
      order.push(err.slide);
    }
    bySlide.get(err.slide).push(err);
  }
  return order.map((slide) => [slide, bySlide.get(slide)]);
}

/**
 * Build the "Guidance:" section — one line per distinct error code present,
 * in order of first occurrence. Codes with no guidance entry are skipped.
 * @param {ValidationError[]} errors
 * @returns {string} — empty string when no error code has guidance
 */
function buildGuidance(errors) {
  const seen = new Set();
  const lines = [];
  for (const err of errors) {
    if (seen.has(err.code) || !CODE_GUIDANCE.has(err.code)) continue;
    seen.add(err.code);
    const entry = CODE_GUIDANCE.get(err.code);
    lines.push(`- ${typeof entry === "function" ? entry() : entry}`);
  }
  return lines.length > 0 ? `\n\nGuidance:\n${lines.join("\n")}` : "";
}

/**
 * @param {ValidationError[]} errors
 * @returns {string} — a concise message telling the LLM exactly what to fix
 */
export function buildRepairMessage(errors) {
  const lines = [];
  for (const [slide, slideErrors] of groupBySlide(errors)) {
    const location = slide >= 0 ? `Slide ${slide + 1}` : "Deck";
    if (slideErrors.length === 1) {
      lines.push(`- ${location}: ${slideErrors[0].message}`);
    } else {
      lines.push(`- ${location}:`);
      for (const err of slideErrors) {
        lines.push(`  - ${err.message}`);
      }
    }
  }
  // The template places the blank line after "issues:" through the
  // "{{issues}}" placeholder itself, so an empty error list renders the same
  // bytes as a non-empty one (one blank line, not two).
  const issues = lines.length > 0 ? `\n${lines.join("\n")}` : "";
  const guidance = buildGuidance(errors);
  return replacePlaceholders(getFragment("repair-message.md"), { issues, guidance }).trim();
}
