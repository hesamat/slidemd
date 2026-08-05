/**
 * AI Token Estimator
 *
 * Rough token-count estimates for prompt sizing and max_tokens calculation.
 * Uses the ~4 chars/token heuristic for English text.
 */

import { stripFrontmatter } from "./ai-prompt-builder.js";

/**
 * Estimate token count (rough: 1 token ≈ 4 chars for English).
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

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
  const inputTokens = estimateTokens(cleaned);
  const multiplier = mode === "generate" ? 1.8 : 1.2;
  const effort = opts?.reasoningEffort ?? (opts?.useReasoning ? "high" : "none");
  const reasoningMultipliers = { none: 1, low: 1.5, medium: 2, high: 3 };
  const reasoningMultiplier = reasoningMultipliers[effort] ?? 1;
  const estimated = Math.ceil(inputTokens * multiplier * reasoningMultiplier);
  // Reasoning takes budget; use a higher floor when more reasoning is requested.
  const floor = effort === "none" || effort === "low" ? 16000 : 24000;
  return Math.min(Math.max(floor, estimated), opts?.modelMaxOutput || 128000);
}
