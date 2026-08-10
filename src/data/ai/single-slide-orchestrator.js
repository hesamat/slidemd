/**
 * SingleSlideOrchestrator
 *
 * Handles single-slide AI operations (enhanceSlide, addSpeakerNotes, etc.).
 * Builds the prompt, calls the provider, validates the output, and runs the
 * repair loop. Returns a SlidePatch[] with one patch for the target slide.
 *
 * Extracted from AiOrchestrator.
 */

import { AiOutputValidator } from "./ai-output-validator.js";
import { Logger } from "../../core/logger.js";
import { buildRepairMessage } from "./ai-repair-message.js";
import { buildMessagesForIntent, isSingleSlideIntent } from "./ai-intent-registry.js";
import { estimateMaxTokens } from "./ai-token-estimator.js";
import { parseAiResponse, slidesToMarkdown } from "./ai-response-parser.js";
import { extractDirectives, injectDirectives } from "./ai-directive-utils.js";
import { createEditPatch } from "../store/slide-patch.js";
import { buildReasoningBody } from "./orchestrator-shared.js";

const MAX_REPAIR_ATTEMPTS = 3;

export class SingleSlideOrchestrator {
  /**
   * @param {object} deps
   * @param {object} deps.provider — AiProviderClient instance
   * @param {number|null} [deps.modelMaxOutput] — model's max completion tokens
   * @param {boolean} [deps.useReasoning] — whether extended thinking is enabled
   * @param {string} [deps.effort] — reasoning effort: "none" | "low" | "medium" | "high"
   * @param {boolean} [deps.effortSupported] — whether the model exposes effort selection
   */
  constructor({ provider, modelMaxOutput = null, useReasoning = false, effort = "none", effortSupported = true }) {
    this._provider = provider;
    this._modelMaxOutput = modelMaxOutput;
    this._useReasoning = useReasoning;
    this._effort = effort;
    this._effortSupported = effortSupported;
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
    const { onLog } = callbacks;
    const log = (message, level = "info") => {
      if (onLog) {
        onLog(message, level);
      } else if (level === "warn" || level === "error") {
        Logger.warn(message);
      }
    };
    const { intent, targetSlide, context } = operation;
    if (!isSingleSlideIntent(intent)) {
      throw new Error(`Intent "${intent}" is not a single-slide intent`);
    }

    const reasoningEffort = this._useReasoning ? this._effort : "none";
    const validator = new AiOutputValidator({ inputMarkdown: context });

    // Extract background/theme directives before sending to the AI.
    // The AI often drops these even when they're in the input; we re-inject
    // them after the response so the slide keeps its visual styling.
    // Pass the single-slide context as a one-element array so extractDirectives
    // uses the fence-aware split consistently.
    const origDirectives = extractDirectives(context, [context]);

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
          reasoning: buildReasoningBody(this._useReasoning, this._effort, this._effortSupported),
        },
        signal,
      );

      const contentText = response.content;
      const finishReason = response.raw?.finish_reason ?? response.raw?.choices?.[0]?.finish_reason;
      if (finishReason === "length") {
        throw new Error(
          `Response truncated \u2014 the AI hit its output token limit (${maxTokens} tokens). ` +
            "Try switching to a model with a higher output token limit.",
        );
      }

      const parsed = parseAiResponse(contentText);
      if (!parsed) {
        throw new Error("AI did not return valid JSON");
      }

      if (!parsed.slides || parsed.slides.length === 0) {
        throw new Error("AI returned no slides");
      }

      let afterMarkdown = slidesToMarkdown(parsed.slides);
      // Re-inject background/theme: single-slide intents send the slide as-is
      // (the AI sees background:/theme:), but fix mode strips whatever the
      // model echoes back and restores the originals positionally.
      afterMarkdown = injectDirectives(afterMarkdown, origDirectives, "fix");

      const result = validator.validate(afterMarkdown, intent, { expectedSlideCount: 1 });

      if (result.ok) {
        return [createEditPatch(targetSlide, context, afterMarkdown, "ai")];
      }

      if (attempt < MAX_REPAIR_ATTEMPTS) {
        log(
          `Validation attempt ${attempt}/${MAX_REPAIR_ATTEMPTS} failed: ${result.errors.map((e) => e.message).join("; ")}`,
          "warn",
        );
        const repairMsg = buildRepairMessage(result.errors);
        messages = [
          ...messages,
          { role: "assistant", content: contentText },
          { role: "user", content: repairMsg },
        ];
        continue;
      }

      // Accept output after exhausting retries so the user doesn't lose the result
      log(
        `Accepting output after ${MAX_REPAIR_ATTEMPTS} attempts despite validation errors: ${result.errors.map((e) => e.message).join("; ")}`,
        "warn",
      );
      return [createEditPatch(targetSlide, context, afterMarkdown, "ai")];
    }

    return [];
  }
}
