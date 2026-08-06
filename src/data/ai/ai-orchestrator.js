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
  buildGenerateOptionsSuffix,
  BATCH_SIZE,
  splitSlidesForAi,
  getAllowedLayoutList,
} from "./ai-prompt-builder.js";
import { estimateMaxTokens } from "./ai-token-estimator.js";
import { parseAiResponse, slidesToMarkdown } from "./ai-response-parser.js";
import { extractDirectives, injectDirectives } from "./ai-directive-utils.js";
import { splitSlides } from "../markdown-parser.js";
import { createEditPatch } from "../store/slide-patch.js";
import { AiPromptComposer } from "./ai-prompt-composer.js";
import systemPrompt from "../prompts/system-prompt.md?raw";
import remixPlanPrompt from "../prompts/remix-plan-prompt.md?raw";

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
          reasoning: this._useReasoning ? { effort: this._effort } : null,
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

    // Remix (fidelity: "rewrite") uses a two-phase plan→execute flow.
    // The plan phase produces a restructuring plan, which is converted to a
    // virtual deck and fed through the existing single-call/batched path.
    if (operation.opts?.fidelity === "rewrite") {
      return this.#runRemix(operation, signal, callbacks);
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

    // Single-call path for small decks. Outside remix, generate mode always
    // preserves the slide count (the prompt promises this for polish/enhance,
    // and there's no other whole-deck fidelity that legitimately changes it),
    // so enforce it here — otherwise a truncated/lazy response could silently
    // collapse the deck to a single slide.
    const result =
      totalSlides <= BATCH_SIZE
        ? await this.#runWholeDeckSingleCall(
            operation,
            signal,
            optionsSuffix,
            callbacks,
            totalSlides,
          )
        : await this.#runWholeDeckBatched(
            operation,
            signal,
            optionsSuffix,
            totalSlides,
            allSlides,
            callbacks,
          );

    // Only gap-fill positionally when the slide count is unchanged — otherwise
    // index-based injection attaches a slide's original styling to an unrelated
    // slide (e.g. when "rewrite" fidelity reorders/splits/merges outside remix).
    if (!result) return result;
    const resultSlides = splitSlidesForAi(result, "generate");
    if (resultSlides.length === totalSlides) {
      return injectDirectives(result, origDirectives, "generate");
    }
    return result;
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
      const patches = await this.runSingleSlideOperation(operation, signal);
      return { patches };
    }
    const markdown = await this.runWholeDeckOperation(operation, signal, callbacks);
    return { markdown };
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
  async #runWholeDeckSingleCall(
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

    const { system, user } = buildMessagesForIntent(intent, { markdown: context });
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
          reasoning: this._useReasoning ? { effort: this._effort } : null,
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
  async #runWholeDeckBatched(
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

        const batchResult = await this.#processBatch({
          markdown: context,
          allSlides,
          batch,
          totalSlides,
          deckSummary,
          optionsSuffix,
          reasoningEffort,
          signal,
          repairMessages: repairMessages.get(batch.batchKey) || [],
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
  async #processBatch({
    markdown,
    allSlides,
    batch,
    totalSlides,
    deckSummary,
    optionsSuffix,
    reasoningEffort,
    signal,
    repairMessages = [],
  }) {
    const batchMarkdown = allSlides.slice(batch.start, batch.end).join("\n\n---\n\n");

    const { system, user } = buildBatchMessages(
      markdown,
      "generate",
      batch.start,
      batch.end,
      totalSlides,
      deckSummary,
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
          reasoning: this._useReasoning ? { effort: this._effort } : null,
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

  // ── Remix (two-phase plan→execute) ──

  /**
   * Run the full remix flow: plan phase → virtual deck → execute phase.
   * @param {import("./ai-operation.js").AiOperation} operation
   * @param {AbortSignal} [signal]
   * @param {object} callbacks
   * @returns {Promise<string|null>}
   */
  async #runRemix(operation, signal, callbacks = {}) {
    const { context } = operation;
    const { onLog } = callbacks;

    // ── Phase 1: Plan ──
    onLog?.("Planning deck restructure\u2026");
    const plan = await this.#runRemixPlan(operation, signal, callbacks);

    // "keep" entries must never be sent to the execute call — the generate
    // prompt has no way to distinguish "leave this slide untouched" from a
    // normal slide, so a `keep` entry would still get reworded/re-laid-out.
    // Instead, splice the original slide (full directives intact) back into
    // its planned position after the execute call runs on everything else.
    // Raw (non-frontmatter-stripped) split so layout/background/theme survive.
    const rawSourceSlides = splitSlides(context);
    const keptByPlanIndex = new Map();
    const rewriteEntries = [];
    plan.forEach((entry, i) => {
      if (entry.action === "keep") {
        keptByPlanIndex.set(i, rawSourceSlides[entry.source[0]]);
      } else {
        rewriteEntries.push(entry);
      }
    });

    onLog?.(
      `Plan: ${plan.length} output slides from ${splitSlidesForAi(context, "generate").length} source slides (${keptByPlanIndex.size} kept as-is)`,
    );

    if (rewriteEntries.length === 0) {
      // Every entry is "keep" — nothing to send to the AI.
      return plan.map((_, i) => keptByPlanIndex.get(i)).join("\n\n---\n\n");
    }

    // ── Phase 2: Build virtual deck from the non-"keep" plan entries ──
    const virtualDeck = this.#planToVirtualDeck(rewriteEntries, context);
    const virtualSlides = splitSlidesForAi(virtualDeck, "generate");
    const virtualCount = virtualSlides.length;

    // ── Phase 3: Execute via existing single-call/batched path ──
    // Build a synthetic operation with the virtual deck as context.
    // Clear fidelity so the inner call doesn't recurse into remix.
    const execOp = {
      ...operation,
      context: virtualDeck,
      opts: { ...operation.opts, fidelity: undefined },
    };
    const execSuffix = buildGenerateOptionsSuffix({ ...operation.opts, fidelity: undefined });

    onLog?.(`Generating ${virtualCount} slide(s)\u2026`);
    const result =
      virtualCount <= BATCH_SIZE
        ? await this.#runWholeDeckSingleCall(execOp, signal, execSuffix, callbacks, virtualCount)
        : await this.#runWholeDeckBatched(
            execOp,
            signal,
            execSuffix,
            virtualCount,
            virtualSlides,
            callbacks,
          );

    if (!result) return result;

    // Remix intentionally reorders/splits/merges slides, so positional
    // directive injection would attach backgrounds/themes to the wrong
    // slides. The virtual deck already carries the original directives in
    // its source slides, and the AI sees them in generate mode — the
    // rewritten slides are used as-is so any styling the AI kept or chose
    // is preserved. Raw (non-stripped) split so the AI's own layout/theme
    // choices survive re-splicing.
    const rewrittenSlides = splitSlides(result);
    let rewriteIdx = 0;
    const finalSlides = plan.map((_, i) =>
      keptByPlanIndex.has(i) ? keptByPlanIndex.get(i) : rewrittenSlides[rewriteIdx++],
    );
    return finalSlides.join("\n\n---\n\n");
  }

  /**
   * Run the plan phase: call the LLM with the deck summary and parse the plan.
   * @param {import("./ai-operation.js").AiOperation} operation
   * @param {AbortSignal} [signal]
   * @param {object} callbacks
   * @returns {Promise<Array<object>>} validated plan entries
   */
  async #runRemixPlan(operation, signal, callbacks = {}) {
    const { context } = operation;
    const { onLog } = callbacks;

    const deckSummary = buildDeckSummary(context);
    const composer = new AiPromptComposer({
      systemFragment: systemPrompt,
      userFragment: remixPlanPrompt,
    });
    const { system, user } = composer.compose({
      markdown: deckSummary,
      layoutList: getAllowedLayoutList(),
    });

    const reasoningEffort = this._useReasoning ? this._effort : "none";
    const maxTokens = estimateMaxTokens(deckSummary, "generate", {
      modelMaxOutput: this._modelMaxOutput,
      reasoningEffort,
    });

    const response = await this._provider.chat(
      {
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        maxTokens,
        responseFormat: null,
        reasoning: this._useReasoning ? { effort: this._effort } : null,
      },
      signal,
    );

    const plan = this.#parsePlanResponse(response.content);
    const sourceCount = splitSlidesForAi(context, "generate").length;
    const validation = this.#validatePlan(plan, sourceCount);
    if (!validation.ok) {
      throw new Error(`Invalid remix plan: ${validation.errors.join("; ")}`);
    }

    // Log each plan entry
    for (const entry of plan) {
      const sourceLabel = entry.source.map((s) => s + 1).join("+");
      if (entry.action === "keep") {
        onLog?.(`[Plan] Keep slide ${sourceLabel}: ${entry.title}`);
      } else if (entry.action === "merge") {
        onLog?.(`[Plan] Merge slides ${sourceLabel} \u2192 ${entry.title}: ${entry.brief}`);
      } else {
        onLog?.(`[Plan] Rewrite slide ${sourceLabel}: ${entry.title} \u2014 ${entry.brief}`);
      }
    }

    return plan;
  }

  /**
   * Parse the plan JSON from an LLM response.
   * Robust to code fences and prose wrappers (same patterns as parseAiResponse).
   * @param {string} text
   * @returns {Array<object>}
   */
  #parsePlanResponse(text) {
    if (!text || typeof text !== "string") return [];

    // Strip code fences if present
    let cleaned = text.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }

    // Find the first { and last } to extract JSON from prose
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error("Plan response did not contain JSON");
    }
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("Plan response was not valid JSON");
    }

    if (!parsed.plan || !Array.isArray(parsed.plan)) {
      throw new Error("Plan response missing 'plan' array");
    }

    return parsed.plan;
  }

  /**
   * Validate a remix plan against the source deck.
   * @param {Array<object>} plan
   * @param {number} sourceCount
   * @returns {{ok: boolean, errors: string[]}}
   */
  #validatePlan(plan, sourceCount) {
    const errors = [];
    const validActions = new Set(["keep", "rewrite", "merge"]);
    const coveredSources = new Set();

    if (plan.length === 0) {
      errors.push("plan is empty");
      return { ok: false, errors };
    }

    for (let i = 0; i < plan.length; i++) {
      const entry = plan[i];
      const prefix = `entry ${i}`;

      if (!validActions.has(entry.action)) {
        errors.push(`${prefix}: invalid action "${entry.action}"`);
        continue;
      }

      if (!Array.isArray(entry.source)) {
        errors.push(`${prefix}: source must be an array`);
        continue;
      }

      if (entry.source.length === 0) {
        errors.push(`${prefix}: source must not be empty for action "${entry.action}"`);
      }

      for (const idx of entry.source) {
        if (typeof idx !== "number" || idx < 0 || idx >= sourceCount) {
          errors.push(`${prefix}: source index ${idx} out of range (0-${sourceCount - 1})`);
        } else {
          coveredSources.add(idx);
        }
      }

      if ((entry.action === "rewrite" || entry.action === "keep") && entry.source.length !== 1) {
        errors.push(
          `${prefix}: ${entry.action} must have exactly 1 source, got ${entry.source.length}`,
        );
      }

      if (entry.action === "merge" && entry.source.length < 2) {
        errors.push(`${prefix}: merge must have 2+ sources, got ${entry.source.length}`);
      }

      if (entry.action !== "keep" && (!entry.brief || entry.brief.trim().length === 0)) {
        errors.push(`${prefix}: brief is required for action "${entry.action}"`);
      }
    }

    // Check that every source slide is covered
    for (let i = 0; i < sourceCount; i++) {
      if (!coveredSources.has(i)) {
        errors.push(`source slide ${i} is not covered by any plan entry`);
      }
    }

    return { ok: errors.length === 0, errors };
  }

  /**
   * Convert a remix plan into a virtual deck markdown string.
   * Each non-keep entry gets its brief embedded as an HTML comment.
   * The virtual deck is fed through the existing generate path.
   *
   * For merge entries, source slides are joined with `\n\n` (not `---`) so
   * `splitSlidesForAi` treats them as one virtual slide. A `<!-- merge source -->`
   * marker separates the original slides for the LLM to see.
   *
   * @param {Array<object>} plan
   * @param {string} sourceMarkdown
   * @returns {string}
   */
  #planToVirtualDeck(plan, sourceMarkdown) {
    // Use the fence-aware split so `---` inside code blocks doesn't create
    // phantom slides and misalign source indices with the plan.
    const sourceSlides = splitSlidesForAi(sourceMarkdown, "generate");

    const virtualSlides = plan.map((entry) => {
      if (entry.action === "keep") {
        return sourceSlides[entry.source[0]];
      }

      // Join source slides with a merge marker (not ---) so splitSlidesForAi
      // treats the whole entry as one virtual slide.
      const sourceContent = entry.source
        .map((idx) => sourceSlides[idx])
        .join("\n\n<!-- merge source -->\n\n");
      return `<!-- brief: ${entry.brief} -->\n${sourceContent}`;
    });

    return virtualSlides.join("\n\n---\n\n");
  }
}
