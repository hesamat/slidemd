/**
 * AI Token Estimator
 *
 * Rough token-count estimates for max_tokens calculation.
 * Uses the ~4 chars/token heuristic for English text.
 */

import { stripFrontmatter } from "./ai-prompt-builder.js";

/**
 * Estimate appropriate max_tokens based on input size and mode.
 * @param {string} markdown - The original markdown.
 * @param {"fix"|"generate"} mode - Enhancement mode.
 * @param {object} [opts]
 * @param {number|null} [opts.modelMaxOutput] - Model's max completion tokens (from OpenRouter).
 * @param {boolean} [opts.useReasoning] - Whether extended thinking is enabled (legacy).
 * @param {string} [opts.reasoningEffort] - One of "none" | "low" | "medium" | "high".
 * @returns {number}
 */
export function estimateMaxTokens(markdown, mode, opts) {
  const cleaned = stripFrontmatter(markdown, mode);
  const inputTokens = Math.ceil(cleaned.length / 4);
  const multiplier = mode === "generate" ? 1.8 : 1.2;
  const effort = opts?.reasoningEffort ?? (opts?.useReasoning ? "high" : "none");
  const reasoningMultipliers = { none: 1, low: 1.5, medium: 2, high: 3 };
  const reasoningMultiplier = reasoningMultipliers[effort] ?? 1;
  const estimated = Math.ceil(inputTokens * multiplier * reasoningMultiplier);
  // Reasoning models share one budget between hidden thinking and visible
  // output. A floor that's too low causes the model to exhaust it during
  // thinking and return content: null with finish_reason: "length". OpenAI
  // recommends reserving ~25k+ for reasoning+output; community reports
  // suggest 30k+ for non-trivial tasks. Use 32k for medium, 40k for high.
  let floor;
  if (effort === "high") {
    floor = 40000;
  } else if (effort === "medium") {
    floor = 32000;
  } else {
    // Generate batch responses can be long (full slide bodies, code, notes,
    // plus JSON overhead). Use a 32k floor so 8-slide batches do not hit
    // the cap and truncate. Fix/polish single-slide responses are shorter.
    floor = mode === "generate" ? 32000 : 16000;
  }
  return Math.min(Math.max(floor, estimated), opts?.modelMaxOutput || 128000);
}

/**
 * Rough input/output token estimate for the pre-flight cost display.
 * Uses the same ~4 chars/token heuristic as estimateMaxTokens.
 * @param {string} markdown - The original markdown.
 * @param {"fix"|"generate"} mode - Enhancement mode.
 * @returns {{ input: number, output: number }}
 */
export function estimateTokenCounts(markdown, mode = "generate") {
  const cleaned = stripFrontmatter(markdown, mode);
  const input = Math.ceil(cleaned.length / 4);
  const multiplier = mode === "generate" ? 1.8 : 1.2;
  const output = Math.ceil(input * multiplier);
  return { input, output };
}
