/**
 * Build a focused repair message from validation errors.
 * This is sent back to the LLM as a follow-up user message when validation fails.
 *
 * The message template lives in `src/data/prompts/repair-message.md`; this
 * module only formats the per-error issue list and fills the {{issues}} slot.
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
  return replacePlaceholders(
    getFragment("repair-message.md"),
    { issues: lines.join("\n") },
    { strict: true },
  ).trim();
}
