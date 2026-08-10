/**
 * AiOrchestrator
 *
 * The single entry point for all AI operations. Owns context selection,
 * the LLM call, validation, and the repair loop. Returns results without
 * applying them — the caller is responsible for applying patches or
 * replacing the deck.
 *
 * Single-slide operations return SlidePatch[] (one patch for the target slide).
 * Whole-deck operations return the enhanced markdown string.
 *
 * This is now a facade that delegates to focused sub-orchestrators:
 * - SingleSlideOrchestrator — single-slide AI operations
 * - WholeDeckOrchestrator — plain generate/polish (single-call + batched)
 * - RemixReimagineOrchestrator — remix and reimagine plan→execute flows
 *
 * Shared utilities (buildReasoningBody, isVisionError) live in
 * ./orchestrator-shared.js and are re-exported here for backward compatibility.
 */

import { isSingleSlide } from "./ai-operation.js";
import { SingleSlideOrchestrator } from "./single-slide-orchestrator.js";
import { WholeDeckOrchestrator } from "./whole-deck-orchestrator.js";
import { RemixReimagineOrchestrator } from "./remix-reimagine-orchestrator.js";

// Re-export isVisionError for backward compatibility (ai-sidebar.js imports it
// from this module).
export { isVisionError } from "./orchestrator-shared.js";

/**
 * @typedef {Object} OrchestratorDeps
 * @property {object} provider — AiProviderClient instance
 * @property {number|null} [modelMaxOutput] — model's max completion tokens
 * @property {boolean} [useReasoning] — whether extended thinking is enabled
 * @property {string} [effort] — reasoning effort: "none" | "low" | "medium" | "high"
 * @property {boolean} [effortSupported] — whether the model exposes effort selection; when false and useReasoning is true, send { enabled: true } instead of { effort }
 */

export class AiOrchestrator {
  /**
   * @param {OrchestratorDeps} deps
   */
  constructor({
    provider,
    modelMaxOutput = null,
    useReasoning = false,
    effort = "none",
    effortSupported = true,
  }) {
    this._provider = provider;
    this._modelMaxOutput = modelMaxOutput;
    this._useReasoning = useReasoning;
    this._effort = effort;
    this._effortSupported = effortSupported;

    const sharedDeps = { provider, modelMaxOutput, useReasoning, effort, effortSupported };

    this._singleSlide = new SingleSlideOrchestrator(sharedDeps);
    this._wholeDeck = new WholeDeckOrchestrator(sharedDeps);
    this._remixReimagine = new RemixReimagineOrchestrator({
      ...sharedDeps,
      wholeDeckOrchestrator: this._wholeDeck,
    });
  }

  /**
   * Run a single-slide AI operation.
   * Returns a SlidePatch[] with one patch (before → after) for the target slide.
   * @param {import("./ai-operation.js").AiOperation} operation
   * @param {AbortSignal} [signal]
   * @param {object} [callbacks]
   * @param {(message: string, level?: "info"|"warn"|"error") => void} [callbacks.onLog]
   * @returns {Promise<import("../store/slide-patch.js").SlidePatch[]>}
   */
  async runSingleSlideOperation(operation, signal, callbacks = {}) {
    return this._singleSlide.runSingleSlideOperation(operation, signal, callbacks);
  }

  /**
   * Run a whole-deck AI operation (generate only).
   * Returns the enhanced markdown string.
   * @param {import("./ai-operation.js").AiOperation} operation
   * @param {AbortSignal} [signal]
   * @param {object} [callbacks]
   * @param {(completed: number, total: number, batch?: {start: number, end: number}) => void} [callbacks.onProgress]
   * @param {(message: string, level?: "info"|"warn"|"error") => void} [callbacks.onLog]
   * @returns {Promise<string|null>}
   */
  async runWholeDeckOperation(operation, signal, callbacksArg = {}) {
    const callbacks =
      typeof callbacksArg === "function" ? { onProgress: callbacksArg } : callbacksArg || {};
    const { intent, context } = operation;
    if (intent !== "generate") {
      throw new Error(`Whole-deck operation only supports "generate" intent, got "${intent}"`);
    }

    // Remix and reimagine use a two-phase plan→execute flow. The plan phase
    // produces a restructuring plan, which is converted to a virtual deck and
    // fed through the existing single-call/batched path.
    if (operation.opts?.mode === "reimagine") {
      return this._remixReimagine.runReimagine(operation, signal, callbacks);
    }
    if (operation.opts?.mode === "remix") {
      return this._remixReimagine.runRemix(operation, signal, callbacks);
    }

    return this._wholeDeck.runWholeDeckOperation(operation, signal, callbacks);
  }

  /**
   * Unified entry point.
   * @param {import("./ai-operation.js").AiOperation} operation
   * @param {AbortSignal} [signal]
   * @param {object} [callbacks]
   * @param {(completed: number, total: number, batch?: {start: number, end: number}) => void} [callbacks.onProgress]
   * @param {(message: string, level?: "info"|"warn"|"error") => void} [callbacks.onLog]
   * @returns {Promise<{patches?: import("../store/slide-patch.js").SlidePatch[], markdown?: string|null}>}
   */
  async runOperation(operation, signal, callbacksArg = {}) {
    const callbacks =
      typeof callbacksArg === "function" ? { onProgress: callbacksArg } : callbacksArg || {};
    if (isSingleSlide(operation)) {
      const patches = await this.runSingleSlideOperation(operation, signal, callbacks);
      return { patches };
    }
    const markdown = await this.runWholeDeckOperation(operation, signal, callbacks);
    return { markdown };
  }
}
