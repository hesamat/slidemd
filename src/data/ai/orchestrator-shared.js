/**
 * Shared configuration and utilities for AI orchestrators.
 */

/**
 * Build the reasoning request body for the provider. When the model exposes
 * effort selection, send { effort }. Otherwise (e.g. xiaomi/mimo-v2.5 which
 * supports reasoning but not effort levels), send { enabled: true } to turn
 * on reasoning with the provider's default parameters.
 * @param {boolean} useReasoning
 * @param {string} effort — "none" | "low" | "medium" | "high"
 * @param {boolean} effortSupported
 * @returns {{effort: string}|{enabled: boolean}|null}
 */
export function buildReasoningBody(useReasoning, effort, effortSupported) {
  if (!useReasoning) return null;
  if (!effortSupported) return { enabled: true };
  return { effort };
}

/**
 * Check if an error is likely a vision-not-supported error from the provider.
 * Used to decide whether to retry with text-only content.
 *
 * Requires BOTH an image/vision-related keyword AND a rejection phrase in
 * the message — a bare mention of "image" (e.g. because the sanitized
 * provider error quotes deck markdown, or the deck genuinely discusses
 * images) is not enough to conclude the model rejected vision input, and a
 * false positive here would trigger an unnecessary duplicate text-only plan
 * request and report a misleading "doesn't support image input" message.
 *
 * Does NOT match:
 * - Auth errors (401/403)
 * - Rate limits (429)
 * - Network errors (status 0)
 * - Abort errors
 *
 * @param {Error} err
 * @returns {boolean}
 */
export function isVisionError(err) {
  if (err.name === "AbortError" || err.name === "AiAbortError") return false;

  // AiHttpError has a status property
  const status = err.status;
  if (status === 401 || status === 403 || status === 429 || !status) return false;

  const msg = (err.message || "").toLowerCase();
  const visionKeywords = ["image", "vision", "multimodal", "multi-modal", "visual", "content type"];
  const rejectionPhrases = [
    "not support",
    "doesn't support",
    "does not support",
    "unsupported",
    "not supported",
    "invalid content",
    "not allowed",
    "cannot process",
    "can't process",
    "no endpoints",
    "endpoints found",
    "support image",
    "support vision",
    "image input",
    "vision input",
  ];
  return (
    visionKeywords.some((kw) => msg.includes(kw)) && rejectionPhrases.some((kw) => msg.includes(kw))
  );
}
