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

/**
 * Actionable, code-specific guidance appended once per distinct error code
 * present in the batch. Kept short — the AI reads this alongside the full
 * deck, so the repair message must stay a focused checklist, not a repeat
 * of the system prompt rules.
 */
const CODE_GUIDANCE = new Map([
  [
    "SLIDE_CONTENT_OVERFLOW",
    "For long lists or tables, use a multi-column text block (`::: text-block { column-count=N markdown=true } ... :::`) first. If still too dense, trim redundant/tangential content or move it to speaker notes. Do not delete list/table items or split the slide.",
  ],
  // The system prompt already lists every valid layout name with its
  // allowed @areas (both orchestrators append this repair message to the
  // same conversation, so that list is still present). Point back at it
  // instead of re-listing names in a different format — repeating the
  // list here would also grow the repair message with the layout count
  // and omit that a custom CSS grid-template string is a valid `layout:`
  // value too (AiOutputValidator._isValidLayout).
  [
    "UNKNOWN_LAYOUT",
    'Use one of the layouts listed in the system prompt above (each shows its allowed @areas), or a custom CSS grid-template string, e.g. `"header header" "main media" / 1fr 1fr`.',
  ],
  // Each INVALID_AREA issue message above already states that slide's
  // allowed areas ("... allows only: ..."), so this points back at the
  // issue list itself rather than repeating a layout→area table here.
  ["INVALID_AREA", "Each area issue above lists that slide's allowed @areas — use only those."],
  ["MISSING_LAYOUT", "Add a `layout:` directive at the top of each slide."],
  // Each UNKNOWN_TEXT_BLOCK_ATTR issue message above already lists the full
  // supported-attribute set ("Supported: ..."), so this points back at the
  // issue list instead of repeating that ~20-name list a second time.
  [
    "UNKNOWN_TEXT_BLOCK_ATTR",
    "Each text-block issue above lists the supported attributes — use only those.",
  ],
  ["MALFORMED_TEXT_BLOCK", "Wrap text-block attributes in braces: `::: text-block { ... }`."],
  [
    "IDENTITY_DIRECTIVE_DROPPED",
    "Restore the input's `theme:`/`background:` directives on the slides listed above — visual identity must be preserved.",
  ],
  [
    "IDENTITY_DIRECTIVE_ADDED",
    "Remove the `theme:`/`background:` directives that are not present in the input — do not add new ones.",
  ],
  [
    "FABRICATED_IMAGE_SRC",
    "Only reuse images that were sent to you with the request (the `[Image N]` vision entries) or that already belong to the slide you are rewriting. Do not adopt other slides' backgrounds or unseen images, and never fabricate image URLs.",
  ],
  [
    "PRESERVED_IMAGE_SRC_DROPPED",
    "Keep every input image on the slides listed above — as `<img>` or `background: url(...)`. Do not silently drop a source image when visual identity is preserved.",
  ],
]);

/**
 * Group errors by slide, preserving the order slides first appear in.
 *
 * This clusters same-slide errors together, which can reorder a later
 * error ahead of an unrelated error that appeared between them in the
 * input array (e.g. a deck-level error sandwiched between two per-slide
 * errors for the same slide). That's intentional — a focused per-slide
 * checklist is more actionable than strict input-order — and safe: both
 * callers (`single-slide-orchestrator.js`, `whole-deck-orchestrator.js`)
 * only forward the resulting string to the model, nothing parses it. In
 * practice `AiOutputValidator.validate()` always pushes its deck-level
 * (`slide: -1`) errors before any per-slide errors, so grouping doesn't
 * change the Deck-vs-Slide ordering for real validator output.
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
