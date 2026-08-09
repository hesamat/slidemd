/**
 * Build a focused repair message from validation errors.
 * This is sent back to the LLM as a follow-up user message when validation fails.
 *
 * The message template lives in `src/data/prompts/repair-message.md`; this
 * module only formats the per-error issue list and fills the {{issues}} slot.
 *
 * Note: no strict placeholder check here — error messages embed model output
 * verbatim (e.g. a hallucinated layout name containing `{{...}}`) and must
 * never abort the repair loop.
 */

import { getFragment } from "./ai-prompt-fragments.js";
import { replacePlaceholders } from "./ai-prompt-composer.js";

/**
 * @param {ValidationError[]} errors
 * @returns {string} — a concise message telling the LLM exactly what to fix
 */
export function buildRepairMessage(errors) {
  const lines = [];
  for (const err of errors) {
    const location = err.slide >= 0 ? `Slide ${err.slide + 1}` : "Deck";
    lines.push(`- ${location}: ${err.message}`);
  }
  // The template places the blank line after "issues:" through the
  // "{{issues}}" placeholder itself, so an empty error list renders the same
  // bytes as a non-empty one (one blank line, not two).
  const issues = lines.length > 0 ? `\n${lines.join("\n")}` : "";
  return replacePlaceholders(getFragment("repair-message.md"), { issues }).trim();
}
