/**
 * AiOperation
 *
 * A value object describing a single AI operation. Created by the caller
 * (EditController or PptxImporter) and passed to AiOrchestrator.runOperation().
 *
 * @typedef {Object} AiOperation
 * @property {string} intent — "enhanceSlide" | "addSpeakerNotes" | "generate"
 * @property {number|null} targetSlide — 0-based slide index for single-slide intents, null for whole-deck
 * @property {string} context — the markdown to send to the LLM
 * @property {object} [opts] — whole-deck options include:
 *   - mode: "polish" | "remix" | "reimagine"
 *   - flow: "story" | "technical" | "persuasive" | "instructional"
 *   - addSpeakerNotes: boolean
 *   - includeImages: boolean
 *   - preserveVisualIdentity: boolean
 *   - visualSystem: object|null (reimagine execute)
 *   Synthetic execute-only flags injected by the remix/reimagine orchestrator
 *   into the synthetic operation it forwards to WholeDeckOrchestrator:
 *   - enforcePreserveIdentity: boolean (remix execute) — enables the
 *     validator's per-slide theme/background preservation checks
 *   - restrictImageSources: boolean (remix/reimagine execute) — output
 *     `<img>`/`background: url(...)` must resolve to deck images
 *   - allowedImageSrcs: string[] (remix/reimagine execute) — explicit image
 *     allowlist unioned with srcs derived from the virtual deck
 * @property {number} timestamp — creation time (set automatically)
 */

/**
 * Create a new AiOperation.
 * @param {string} intent
 * @param {number|null} targetSlide
 * @param {string} context
 * @param {object} [opts]
 * @returns {AiOperation}
 */
export function createOperation(intent, targetSlide, context, opts = {}) {
  return {
    intent,
    targetSlide,
    context,
    opts,
    timestamp: Date.now(),
  };
}

/**
 * Check if an operation targets a single slide (vs whole-deck).
 * @param {AiOperation} op
 * @returns {boolean}
 */
export function isSingleSlide(op) {
  return op.targetSlide !== null && op.targetSlide !== undefined;
}
