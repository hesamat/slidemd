/**
 * Build a focused repair message from validation errors.
 * This is sent back to the LLM as a follow-up user message when validation fails.
 *
 * @param {ValidationError[]} errors
 * @returns {string} — a concise message telling the LLM exactly what to fix
 */
export function buildRepairMessage(errors) {
  const lines = ["The previous output had these issues:"];
  for (const err of errors) {
    const location = err.slide >= 0 ? `Slide ${err.slide + 1}` : "Deck";
    lines.push(`- ${location}: ${err.message}`);
  }
  lines.push("");
  lines.push("Fix these issues and return the complete corrected output.");
  return lines.join("\n");
}
