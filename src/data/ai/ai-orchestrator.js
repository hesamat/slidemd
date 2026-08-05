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
 */

import { AiOutputValidator } from "./ai-output-validator.js";
import { buildRepairMessage } from "./ai-repair-message.js";
import { buildMessagesForIntent, isSingleSlideIntent } from "./ai-intent-registry.js";
import { isSingleSlide } from "./ai-operation.js";
import {
  buildDeckSummary,
  buildBatchMessages,
  BATCH_SIZE,
  splitSlidesForAi,
} from "./ai-prompt-builder.js";
import { estimateMaxTokens } from "./ai-token-estimator.js";
import { parseAiResponse, slidesToMarkdown } from "./ai-response-parser.js";
import { createEditPatch } from "../store/slide-patch.js";

const MAX_REPAIR_ATTEMPTS = 3;

/**
 * @typedef {Object} OrchestratorDeps
 * @property {object} provider — AiProviderClient instance
 * @property {(markdown: string) => { system: string, user: string }} [buildMessages] — override for testing
 * @property {number|null} [modelMaxOutput] — model's max completion tokens
 * @property {boolean} [useReasoning] — whether extended thinking is enabled
 * @property {string} [effort] — reasoning effort: "none" | "low" | "medium" | "high"
 */

export class AiOrchestrator {
  /**
   * @param {OrchestratorDeps} deps
   */
  constructor({ provider, modelMaxOutput = null, useReasoning = false, effort = "none" }) {
    this._provider = provider;
    this._modelMaxOutput = modelMaxOutput;
    this._useReasoning = useReasoning;
    this._effort = effort;
  }

  /**
   * Run a single-slide AI operation.
   * Returns a SlidePatch[] with one patch (before → after) for the target slide.
   * @param {import("./ai-operation.js").AiOperation} operation
   * @param {AbortSignal} [signal]
   * @returns {Promise<import("../store/slide-patch.js").SlidePatch[]>}
   */
  async runSingleSlideOperation(operation, signal) {
    const { intent, targetSlide, context } = operation;
    if (!isSingleSlideIntent(intent)) {
      throw new Error(`Intent "${intent}" is not a single-slide intent`);
    }

    const reasoningEffort = this._useReasoning ? this._effort : "none";
    const validator = new AiOutputValidator({ inputMarkdown: context });

    const { system, user } = buildMessagesForIntent(intent, { markdown: context });
    let messages = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];

    for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
      const maxTokens = estimateMaxTokens(context, "fix", {
        modelMaxOutput: this._modelMaxOutput,
        reasoningEffort,
      });

      const response = await this._provider.chat(
        {
          messages,
          maxTokens,
          responseFormat: null,
          reasoning: this._useReasoning ? { effort: this._effort } : null,
        },
        signal,
      );

      const contentText = response.content;
      const parsed = parseAiResponse(contentText);
      if (!parsed) {
        throw new Error("AI did not return valid JSON");
      }

      if (!parsed.slides || parsed.slides.length === 0) {
        throw new Error("AI returned no slides");
      }

      const afterMarkdown = slidesToMarkdown(parsed.slides);
      const result = validator.validate(afterMarkdown, intent, { expectedSlideCount: 1 });

      if (result.ok) {
        return [createEditPatch(targetSlide, context, afterMarkdown, "ai")];
      }

      console.warn(
        `[AI ${intent}] Attempt ${attempt}: ${result.errors.length} validation issue(s):`,
      );
      for (const err of result.errors) {
        console.warn(`  - ${err.message}`);
      }

      if (attempt < MAX_REPAIR_ATTEMPTS) {
        const repairMsg = buildRepairMessage(result.errors);
        messages = [
          ...messages,
          { role: "assistant", content: contentText },
          { role: "user", content: repairMsg },
        ];
        continue;
      }

      // Accept output after exhausting retries so the user doesn't lose the result
      console.warn(`[AI ${intent}] Accepting output after max attempts with validation issues`);
      return [createEditPatch(targetSlide, context, afterMarkdown, "ai")];
    }

    return [];
  }

  /**
   * Run a whole-deck AI operation (generate only).
   * Returns the enhanced markdown string.
   * @param {import("./ai-operation.js").AiOperation} operation
   * @param {AbortSignal} [signal]
   * @param {(completed: number, total: number, batch?: {start: number, end: number}) => void} [onProgress]
   * @returns {Promise<string|null>}
   */
  async runWholeDeckOperation(operation, signal, onProgress) {
    const { intent, context } = operation;
    if (intent !== "generate") {
      throw new Error(`Whole-deck operation only supports "generate" intent, got "${intent}"`);
    }

    const allSlides = splitSlidesForAi(context, "generate");
    const totalSlides = allSlides.length;

    // Single-call path for small decks
    if (totalSlides <= BATCH_SIZE) {
      const result = await this.#runWholeDeckSingleCall(operation, signal);
      return result;
    }

    // Batched path for larger decks
    return this.#runWholeDeckBatched(operation, signal, onProgress, totalSlides);
  }

  /**
   * Unified entry point.
   * @param {import("./ai-operation.js").AiOperation} operation
   * @param {AbortSignal} [signal]
   * @param {(completed: number, total: number, batch?: {start: number, end: number}) => void} [onProgress]
   * @returns {Promise<{patches?: import("../store/slide-patch.js").SlidePatch[], markdown?: string|null}>}
   */
  async runOperation(operation, signal, onProgress) {
    if (isSingleSlide(operation)) {
      const patches = await this.runSingleSlideOperation(operation, signal);
      return { patches };
    }
    const markdown = await this.runWholeDeckOperation(operation, signal, onProgress);
    return { markdown };
  }

  /**
   * Single-call path for whole-deck generate (≤8 slides).
   * @param {import("./ai-operation.js").AiOperation} operation
   * @param {AbortSignal} [signal]
   * @returns {Promise<string|null>}
   */
  async #runWholeDeckSingleCall(operation, signal) {
    const { intent, context } = operation;
    const reasoningEffort = this._useReasoning ? this._effort : "none";
    const validator = new AiOutputValidator({ inputMarkdown: context });

    const { system, user } = buildMessagesForIntent(intent, { markdown: context });
    let messages = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];

    for (let attempt = 1; attempt <= 2; attempt++) {
      const maxTokens = estimateMaxTokens(context, "generate", {
        modelMaxOutput: this._modelMaxOutput,
        reasoningEffort,
      });

      const response = await this._provider.chat(
        {
          messages,
          maxTokens,
          responseFormat: null,
          reasoning: this._useReasoning ? { effort: this._effort } : null,
        },
        signal,
      );

      const contentText = response.content;
      const parsed = parseAiResponse(contentText);
      if (!parsed) {
        throw new Error("AI did not return valid JSON");
      }

      const enhancedMarkdown = slidesToMarkdown(parsed.slides);
      const result = validator.validate(enhancedMarkdown, "generate");

      if (result.ok) {
        return enhancedMarkdown;
      }

      console.warn(`[AI generate] Attempt ${attempt}: ${result.errors.length} validation issue(s)`);

      if (attempt < 2) {
        const repairMsg = buildRepairMessage(result.errors);
        messages = [
          ...messages,
          { role: "assistant", content: contentText },
          { role: "user", content: repairMsg },
        ];
        continue;
      }

      // Accept after max attempts
      console.warn("[AI generate] Accepting output after max attempts with validation issues");
      return enhancedMarkdown;
    }

    return null;
  }

  /**
   * Batched path for whole-deck generate (>8 slides).
   * Uses 2-worker parallel processing with per-batch retry.
   * @param {import("./ai-operation.js").AiOperation} operation
   * @param {AbortSignal} [signal]
   * @param {Function} [onProgress]
   * @param {number} totalSlides
   * @returns {Promise<string|null>}
   */
  async #runWholeDeckBatched(operation, signal, onProgress, totalSlides) {
    const { context } = operation;
    const reasoningEffort = this._useReasoning ? this._effort : "none";
    const deckSummary = buildDeckSummary(context);

    // Build batch ranges
    const batches = [];
    for (let start = 0; start < totalSlides; start += BATCH_SIZE) {
      batches.push({ start, end: Math.min(start + BATCH_SIZE, totalSlides) });
    }

    const results = new Array(batches.length).fill(null);
    let completedCount = 0;

    // 2-worker parallel processing
    const worker = async () => {
      while (true) {
        const batchIdx = batches.findIndex((_, i) => results[i] === null && !batches[i]._claimed);
        if (batchIdx === -1) break;
        batches[batchIdx]._claimed = true;

        const batch = batches[batchIdx];
        try {
          const slides = await this.#processBatch(
            context,
            batch,
            totalSlides,
            deckSummary,
            reasoningEffort,
            signal,
          );
          results[batchIdx] = slides;
          completedCount++;
          onProgress?.(completedCount, batches.length, batch);
        } catch (err) {
          if (err.name === "AbortError" || err.name === "AiAbortError") return;
          console.error(`[AI generate] Batch ${batchIdx} failed:`, err);
          results[batchIdx] = [];
          completedCount++;
          onProgress?.(completedCount, batches.length, batch);
        }
      }
    };

    await Promise.all([worker(), worker()]);

    // Flatten results in order
    const allSlides = results.flat().filter(Boolean);
    if (allSlides.length === 0) return null;
    return slidesToMarkdown(allSlides);
  }

  /**
   * Process a single batch with retry on validation failure.
   * @param {string} markdown
   * @param {{start: number, end: number}} batch
   * @param {number} totalSlides
   * @param {string} deckSummary
   * @param {string} reasoningEffort
   * @param {AbortSignal} [signal]
   * @returns {Promise<Array>}
   */
  async #processBatch(markdown, batch, totalSlides, deckSummary, reasoningEffort, signal) {
    const batchMarkdown = markdown
      .split(/\n---\n/)
      .slice(batch.start, batch.end)
      .join("\n\n---\n\n");

    const { system, user } = buildBatchMessages(
      markdown,
      "generate",
      batch.start,
      batch.end,
      totalSlides,
      deckSummary,
    );

    let messages = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];

    for (let attempt = 1; attempt <= 2; attempt++) {
      const maxTokens = estimateMaxTokens(batchMarkdown, "generate", {
        modelMaxOutput: this._modelMaxOutput,
        reasoningEffort,
      });

      const response = await this._provider.chat(
        {
          messages,
          maxTokens,
          responseFormat: null,
          reasoning: this._useReasoning ? { effort: this._effort } : null,
        },
        signal,
      );

      const contentText = response.content;
      const parsed = parseAiResponse(contentText);
      if (!parsed) {
        if (attempt < 2) continue;
        throw new Error(`Batch parse error (slides ${batch.start + 1}-${batch.end})`);
      }

      const enhancedMarkdown = slidesToMarkdown(parsed.slides);
      const validator = new AiOutputValidator({ inputMarkdown: batchMarkdown });
      const result = validator.validate(enhancedMarkdown, "generate");

      if (result.ok) {
        return parsed.slides;
      }

      console.warn(`[AI generate batch] Attempt ${attempt}: ${result.errors.length} issue(s)`);

      if (attempt < 2) {
        const repairMsg = buildRepairMessage(result.errors);
        messages = [
          ...messages,
          { role: "assistant", content: contentText },
          { role: "user", content: repairMsg },
        ];
        continue;
      }

      // Accept partial output after max attempts
      return parsed.slides;
    }

    return [];
  }
}
