/**
 * WholeDeckOrchestrator
 *
 * Handles whole-deck AI operations (generate, polish). Builds the prompt,
 * calls the provider, validates the output, and runs the repair loop.
 * Returns the enhanced markdown string.
 *
 * Extracted from AiOrchestrator.
 */

import { AiOutputValidator } from "./ai-output-validator.js";
import { buildRepairMessage } from "./ai-repair-message.js";
import { buildMessagesForIntent, buildPolishMessages } from "./ai-intent-registry.js";
import {
  buildDeckSummary,
  buildBatchMessages,
  buildGenerateOptionsSuffix,
  BATCH_SIZE,
  splitSlidesForAi,
} from "./ai-prompt-builder.js";
import { estimateMaxTokens } from "./ai-token-estimator.js";
import { parseAiResponse, slidesToMarkdown } from "./ai-response-parser.js";
import { extractDirectives, injectDirectives } from "./ai-directive-utils.js";
import { buildReasoningBody } from "./orchestrator-shared.js";

export class WholeDeckOrchestrator {
  /**
   * @param {object} deps
   * @param {object} deps.provider — AiProviderClient instance
   * @param {number|null} [deps.modelMaxOutput] — model's max completion tokens
   * @param {boolean} [deps.useReasoning] — whether extended thinking is enabled
   * @param {string} [deps.effort] — reasoning effort: "none" | "low" | "medium" | "high"
   * @param {boolean} [deps.effortSupported] — whether the model exposes effort selection
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

    const allSlides = splitSlidesForAi(context, "generate");
    const totalSlides = allSlides.length;

    const optionsSuffix = buildGenerateOptionsSuffix(operation.opts);

    // Capture original background/theme directives before sending. In generate
    // mode the AI sees them and may keep or change them; we only gap-fill any it
    // dropped (preserving AI-chosen styling) rather than overwriting positionally.
    // Use the fence-aware slide list so `---` inside code blocks doesn't shift
    // directives onto the wrong slides.
    const origDirectives = extractDirectives(context, allSlides);

    // Single-call path for small decks. Polish and simple generate both
    // preserve the slide count (the prompts promise this), so enforce it here —
    // otherwise a truncated/lazy response could silently collapse the deck.
    const result =
      totalSlides <= BATCH_SIZE
        ? await this.runWholeDeckSingleCall(
            operation,
            signal,
            optionsSuffix,
            callbacks,
            totalSlides,
          )
        : await this.runWholeDeckBatched(
            operation,
            signal,
            optionsSuffix,
            totalSlides,
            allSlides,
            callbacks,
          );

    // Only gap-fill positionally when the slide count is unchanged — otherwise
    // index-based injection attaches a slide's original styling to an unrelated
    // slide (e.g. when remix or reimagine reorders/splits/merges).
    if (!result) return result;
    const resultSlides = splitSlidesForAi(result, "generate");
    if (resultSlides.length === totalSlides) {
      return injectDirectives(result, origDirectives, "generate");
    }
    return result;
  }

  /**
   * Single-call path for whole-deck generate (≤8 slides).
   * @param {import("./ai-operation.js").AiOperation} operation
   * @param {AbortSignal} [signal]
   * @param {string} optionsSuffix
   * @param {object} callbacks
   * @param {number} [expectedSlideCount] — when set, the output must have exactly this many slides
   * @returns {Promise<string|null>}
   */
  async runWholeDeckSingleCall(
    operation,
    signal,
    optionsSuffix = "",
    callbacks = {},
    expectedSlideCount = null,
  ) {
    const { intent, context } = operation;
    const { onLog } = callbacks;
    const reasoningEffort = this._useReasoning ? this._effort : "none";
    const validator = new AiOutputValidator({ inputMarkdown: context });

    // Polish uses polish-prompt.md (specific cleanup + layout improvement rules)
    // instead of generate-prompt.md with a vague suffix.
    const { system, user } =
      operation.opts?.mode === "polish"
        ? buildPolishMessages(context)
        : buildMessagesForIntent(intent, { markdown: context });
    let messages = [
      { role: "system", content: system },
      { role: "user", content: user + optionsSuffix },
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
          reasoning: buildReasoningBody(this._useReasoning, this._effort, this._effortSupported),
        },
        signal,
      );

      const contentText = response.content;
      const finishReason = response.raw?.finish_reason ?? response.raw?.choices?.[0]?.finish_reason;
      if (finishReason === "length") {
        throw new Error(
          `Response truncated \u2014 the AI hit its output token limit (${maxTokens} tokens). ` +
            "Try reducing the number of slides or switch to a model with a higher output token limit.",
        );
      }

      const parsed = parseAiResponse(contentText);
      if (!parsed) {
        throw new Error("AI did not return valid JSON");
      }

      const enhancedMarkdown = slidesToMarkdown(parsed.slides);
      const result = validator.validate(enhancedMarkdown, "generate", {
        expectedSlideCount: expectedSlideCount ?? undefined,
      });

      if (result.ok) {
        onLog?.("Generated full deck");
        return enhancedMarkdown;
      }

      onLog?.(`Validation attempt ${attempt}: ${result.errors.length} issue(s)`, "warn");

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
      onLog?.("Accepting output after max validation attempts", "warn");
      return enhancedMarkdown;
    }

    return null;
  }

  /**
   * Batched path for whole-deck generate (>8 slides).
   * Uses a 2-worker queue with per-batch retry, truncation split, and ordered reassembly.
   * @param {import("./ai-operation.js").AiOperation} operation
   * @param {AbortSignal} [signal]
   * @param {string} optionsSuffix
   * @param {number} totalSlides
   * @param {object} callbacks
   * @returns {Promise<string|null>}
   */
  async runWholeDeckBatched(
    operation,
    signal,
    optionsSuffix = "",
    totalSlides,
    allSlides,
    callbacks = {},
  ) {
    const { context } = operation;
    const reasoningEffort = this._useReasoning ? this._effort : "none";
    const deckSummary = buildDeckSummary(context);
    const { onProgress, onLog } = callbacks;

    // Build initial batches
    const batches = [];
    for (let i = 0; i < totalSlides; i += BATCH_SIZE) {
      batches.push({ start: i, end: Math.min(i + BATCH_SIZE, totalSlides) });
    }

    const results = new Map();
    let completedSlides = 0;
    let retryCount = 0;
    let splitCount = 0;
    const retryAttempts = new Map();
    const repairMessages = new Map();
    const queue = batches.map((b, i) => ({ ...b, index: i, batchKey: `${b.start}-${b.end}` }));

    onLog?.(`Split ${totalSlides} slides into ${batches.length} batch(es)`);
    onProgress?.(0, totalSlides, queue[0]);

    const worker = async () => {
      while (queue.length > 0) {
        if (signal?.aborted) return;
        const batch = queue.shift();

        const batchResult = await this.processBatch({
          markdown: context,
          allSlides,
          batch,
          totalSlides,
          deckSummary,
          optionsSuffix,
          reasoningEffort,
          signal,
          repairMessages: repairMessages.get(batch.batchKey) || [],
          mode: operation.opts?.mode,
        });

        if (batchResult === null) {
          // Cancelled
          return;
        }

        if (batchResult.error) {
          const attempts = (retryAttempts.get(batch.batchKey) || 0) + 1;
          retryAttempts.set(batch.batchKey, attempts);

          if (batchResult.error.type === "truncation") {
            // Cap truncation splits per batch so a single oversized slide
            // can't loop forever (each split re-queues the same content).
            // Also skip empty ranges: halving a 1-slide batch produces
            // {s, s+1} (identical) and {s+1, s+1} (empty), so we must bail.
            const canSplit = batch.end - batch.start > 1 && attempts < 3;
            if (!canSplit) {
              onLog?.(
                `Batch ${batch.index + 1}: response truncated and cannot split further — accepting partial or failing`,
                "warn",
              );
              if (batchResult.error.slides) {
                // Accept partial output if available
                results.set(batch.batchKey, {
                  start: batch.start,
                  end: batch.end,
                  slides: batchResult.error.slides,
                });
                completedSlides += batch.end - batch.start;
              } else {
                onLog?.(`Batch ${batch.index + 1}: failed (truncation)`, "error");
              }
              const nextBatch = queue.length > 0 ? queue[0] : null;
              onProgress?.(completedSlides, totalSlides, nextBatch);
              continue;
            }
            onLog?.(
              `Batch ${batch.index + 1}: response truncated — splitting into 2×${Math.ceil((batch.end - batch.start) / 2)} slides`,
              "warn",
            );
            splitCount++;
            const mid = batch.start + Math.ceil((batch.end - batch.start) / 2);
            queue.unshift(
              {
                start: batch.start,
                end: mid,
                index: batch.index,
                batchKey: `${batch.start}-${mid}`,
              },
              { start: mid, end: batch.end, index: batch.index, batchKey: `${mid}-${batch.end}` },
            );
          } else if (batchResult.error.type === "validation" && attempts < 2) {
            const errs = batchResult.error.errors;
            onLog?.(
              `Batch ${batch.index + 1}: ${errs.length} validation issue(s) — retrying`,
              "warn",
            );
            retryCount++;
            if (batchResult.error.repairMessages) {
              repairMessages.set(batch.batchKey, batchResult.error.repairMessages);
            }
            queue.unshift(batch);
          } else if (attempts < 2) {
            onLog?.(`Batch ${batch.index + 1}: ${batchResult.error.type} — retrying`, "warn");
            retryCount++;
            queue.unshift(batch);
          } else {
            const isValidation = batchResult.error.type === "validation";
            const errs = isValidation ? batchResult.error.errors : [];
            if (isValidation && batchResult.error.slides) {
              results.set(batch.batchKey, {
                start: batch.start,
                end: batch.end,
                slides: batchResult.error.slides,
              });
              completedSlides += batch.end - batch.start;
              onLog?.(
                `Batch ${batch.index + 1}: accepted with ${errs.length} validation issue(s)`,
                "warn",
              );
            } else {
              onLog?.(`Batch ${batch.index + 1}: failed (${batchResult.error.type})`, "error");
            }
            const nextBatch = queue.length > 0 ? queue[0] : null;
            onProgress?.(completedSlides, totalSlides, nextBatch);
          }
        } else {
          results.set(batch.batchKey, {
            start: batch.start,
            end: batch.end,
            slides: batchResult.slides,
          });
          completedSlides += batch.end - batch.start;
          const nextBatch = queue.length > 0 ? queue[0] : null;
          onProgress?.(completedSlides, totalSlides, nextBatch);
          onLog?.(`Batch ${batch.index + 1}: slides ${batch.start + 1}–${batch.end} done`);
        }
      }
    };

    await Promise.all([worker(), worker()]);

    if (signal?.aborted) return null;

    // Reassemble in order and check for gaps
    const completedRanges = [...results.values()].sort((a, b) => a.start - b.start);
    const hasGap = (() => {
      if (completedRanges.length === 0) return true;
      let expectedStart = 0;
      for (const r of completedRanges) {
        if (r.start !== expectedStart) return true;
        expectedStart = r.end;
      }
      return expectedStart !== totalSlides;
    })();

    if (hasGap) {
      onLog?.(
        `Batch processing failed — ${completedSlides}/${totalSlides} slides completed`,
        "error",
      );
      throw new Error(
        `Batch processing failed — ${completedSlides}/${totalSlides} slides completed`,
      );
    }

    const allResultSlides = completedRanges.flatMap((r) => r.slides);
    const summaryParts = [`${totalSlides} slides processed`];
    if (retryCount > 0) summaryParts.push(`${retryCount} retr${retryCount === 1 ? "y" : "ies"}`);
    if (splitCount > 0) summaryParts.push(`${splitCount} split${splitCount === 1 ? "" : "s"}`);
    onLog?.(`${summaryParts.join(", ")}`);
    return slidesToMarkdown(allResultSlides);
  }

  /**
   * Process one batch. Returns parsed slides, an error descriptor, or null on abort.
   * @param {object} params
   * @returns {Promise<{slides: Array, duration: number}|{error: object}|null>}
   */
  async processBatch({
    markdown,
    allSlides,
    batch,
    totalSlides,
    deckSummary,
    optionsSuffix,
    reasoningEffort,
    signal,
    repairMessages = [],
    mode,
  }) {
    const batchMarkdown = allSlides.slice(batch.start, batch.end).join("\n\n---\n\n");

    const { system, user } = buildBatchMessages(
      markdown,
      "generate",
      batch.start,
      batch.end,
      totalSlides,
      deckSummary,
      mode,
    );

    const messages = [
      { role: "system", content: system },
      { role: "user", content: user + optionsSuffix },
      ...repairMessages,
    ];

    const startTime = performance.now();

    try {
      const response = await this._provider.chat(
        {
          messages,
          maxTokens: estimateMaxTokens(batchMarkdown, "generate", {
            modelMaxOutput: this._modelMaxOutput,
            reasoningEffort,
          }),
          responseFormat: null,
          reasoning: buildReasoningBody(this._useReasoning, this._effort, this._effortSupported),
        },
        signal,
      );

      const contentText = response.content;
      const finishReason = response.raw?.finish_reason ?? response.raw?.choices?.[0]?.finish_reason;
      const duration = (performance.now() - startTime) / 1000;

      if (finishReason === "length") {
        // Include any partial slides parsed from the truncated response so
        // the caller can accept them when the batch can't be split further.
        const partialParsed = parseAiResponse(contentText);
        return {
          error: {
            type: "truncation",
            slides: partialParsed?.slides || null,
          },
        };
      }

      const parsed = parseAiResponse(contentText);
      if (!parsed) {
        return { error: { type: "parse-error" } };
      }

      const enhancedMarkdown = slidesToMarkdown(parsed.slides);
      const validator = new AiOutputValidator({ inputMarkdown: batchMarkdown });
      const expectedCount = batch.end - batch.start;
      const result = validator.validate(enhancedMarkdown, "generate", {
        expectedSlideCount: expectedCount,
      });

      if (!result.ok) {
        const repairMsg = buildRepairMessage(result.errors);
        const nextRepairMessages = [
          ...repairMessages,
          { role: "assistant", content: contentText },
          { role: "user", content: repairMsg },
        ];
        return {
          error: {
            type: "validation",
            errors: result.errors,
            repairMessages: nextRepairMessages,
            slides: parsed.slides,
          },
        };
      }

      return { slides: parsed.slides, duration };
    } catch (err) {
      if (err.name === "AbortError" || err.name === "AiAbortError") return null;
      return { error: { type: "network-error", message: err.message } };
    }
  }
}
