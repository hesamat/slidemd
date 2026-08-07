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
import {
  buildMessagesForIntent,
  buildPolishMessages,
  isSingleSlideIntent,
} from "./ai-intent-registry.js";
import { isSingleSlide } from "./ai-operation.js";
import {
  buildDeckSummary,
  buildBatchMessages,
  buildGenerateOptionsSuffix,
  BATCH_SIZE,
  splitSlidesForAi,
  getAllowedLayoutList,
  stripThemeAndBackground,
} from "./ai-prompt-builder.js";
import { estimateMaxTokens } from "./ai-token-estimator.js";
import { parseAiResponse, slidesToMarkdown } from "./ai-response-parser.js";
import { extractDirectives, injectDirectives } from "./ai-directive-utils.js";
import { splitSlides } from "../markdown-parser.js";
import { createEditPatch } from "../store/slide-patch.js";
import { AiPromptComposer } from "./ai-prompt-composer.js";
import { buildVisionMessage, estimateTotalImageTokens } from "./ai-vision-message.js";
import { extractAll } from "./slide-image-extractor.js";
import { parseAllImages } from "../../editor/image/image-markdown-utils.js";
import systemPrompt from "../prompts/system-prompt.md?raw";
import remixPlanPrompt from "../prompts/remix-plan-prompt.md?raw";
import reimagineOutlinePrompt from "../prompts/reimagine-outline-prompt.md?raw";

/**
 * @typedef {Object} ReimagineOutlineSlide
 * @property {string} title
 * @property {string} intent
 */

/**
 * @typedef {Object} ReimagineOutlineChapter
 * @property {string} title
 * @property {string} flowTag — one of: hook, context, problem, tension, solution, evidence, comparison, example, transition, climax, cta
 * @property {string} summary
 * @property {ReimagineOutlineSlide[]} slides
 */

/**
 * @typedef {Object} ReimagineOutline
 * @property {string} plan
 * @property {ReimagineOutlineChapter[]} chapters
 */

const MAX_REPAIR_ATTEMPTS = 3;

/**
 * Build the `{{imagesSection}}` fragment for the remix plan prompt. The
 * keepImages / image-assessment guidance is only relevant (and only
 * truthful) when images are actually attached to the request — omitting it
 * for text-only plans stops the model from hallucinating keepImages against
 * pictures it never saw.
 * @param {boolean} imagesSent
 * @returns {string}
 */
function buildImagesSectionForPrompt(imagesSent) {
  if (!imagesSent) {
    return "No images were sent with this request — omit `keepImages` from every plan entry.";
  }
  return (
    "When images are provided:\n\n" +
    "- You will also receive the raw images from each slide (background images are excluded). Use these images to assess their content and quality when deciding whether to keep, rewrite, or merge slides.\n" +
    "- In the plan, each entry can specify `keepImages`: an array of 0-based indices into that source slide's extracted images (in order of appearance). Omit to keep all images; use `[]` to drop all images from a slide.\n" +
    "- When merging slides, `keepImages` indices are still per-source-slide, not indices into a combined set — the same array is applied independently to each slide listed in `source`.\n" +
    "- You are not limited to placing images in a `@media` area. Images can be freely positioned using `position: relative` with `left`, `top`, `width`, and `height` style attributes on the `<img>` tag. Use this when an image needs custom placement that doesn't fit the standard area layout.\n" +
    "- If an image is low quality, redundant, or doesn't add value, drop it (don't include it in `keepImages`)."
  );
}

/**
 * @typedef {Object} OrchestratorDeps
 * @property {object} provider — AiProviderClient instance
 * @property {(markdown: string) => { system: string, user: string }} [buildMessages] — override for testing
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
  }

  /**
   * Build the reasoning request body for the provider. When the model exposes
   * effort selection, send { effort }. Otherwise (e.g. xiaomi/mimo-v2.5 which
   * supports reasoning but not effort levels), send { enabled: true } to turn
   * on reasoning with the provider's default parameters.
   * @returns {{effort: string}|{enabled: boolean}|null}
   */
  _buildReasoningBody() {
    if (!this._useReasoning) return null;
    if (!this._effortSupported) return { enabled: true };
    return { effort: this._effort };
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
        console.warn(message);
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
          reasoning: this._buildReasoningBody(),
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
      return this.#runReimagine(operation, signal, callbacks);
    }
    if (operation.opts?.mode === "remix") {
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

    // Single-call path for small decks. Polish and simple generate both
    // preserve the slide count (the prompts promise this), so enforce it here —
    // otherwise a truncated/lazy response could silently collapse the deck.
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
    // slide (e.g. when remix or reimagine reorders/splits/merges).
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
      const patches = await this.runSingleSlideOperation(operation, signal, callbacks);
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
          reasoning: this._buildReasoningBody(),
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
          reasoning: this._buildReasoningBody(),
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
    // If the user opted in to vision, extract + compress content images
    // from each slide so the plan AI can visually assess layout quality.
    let slideImages = null;
    if (operation.opts?.includeImages) {
      onLog?.("Extracting slide images for vision\u2026");
      try {
        slideImages = await extractAll(context);
        const imageCount = slideImages.reduce((sum, imgs) => sum + (imgs?.length || 0), 0);
        if (imageCount > 0) {
          onLog?.(`Sending ${imageCount} image(s) to AI for visual assessment\u2026`);
        } else {
          slideImages = null; // no images — fall back to text-only
        }
      } catch {
        onLog?.("Image extraction failed — continuing with text-only plan\u2026");
        slideImages = null;
      }
    }

    const mode = operation.opts?.mode || "remix";
    const preserveVisualIdentity = operation.opts?.preserveVisualIdentity ?? mode === "remix";
    const planContext = preserveVisualIdentity ? context : stripThemeAndBackground(context);

    onLog?.(`Planning ${mode} restructure\u2026`);
    const { plan, imagesWereSent } = await this.#runRemixPlan(
      operation,
      signal,
      callbacks,
      slideImages,
    );

    // "keep" entries must never be sent to the execute call — the generate
    // prompt has no way to distinguish "leave this slide untouched" from a
    // normal slide, so a `keep` entry would still get reworded/re-laid-out.
    // Instead, splice the original slide back into its planned position after
    // the execute call runs on everything else. For reimagine (or when visual
    // identity is off), strip the original theme/background so the result is
    // not anchored to the old visual style.
    const rawSourceSlides = splitSlides(planContext);
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
      `${mode} plan: ${plan.length} output slides from ${splitSlidesForAi(context, "generate").length} source slides (${keptByPlanIndex.size} kept as-is)`,
    );

    if (rewriteEntries.length === 0) {
      // Every entry is "keep" — nothing to send to the AI.
      return plan.map((_, i) => keptByPlanIndex.get(i)).join("\n\n---\n\n");
    }

    // ── Phase 2: Build virtual deck from the non-"keep" plan entries ──
    // Only honour keepImages when images were actually sent to the plan AI —
    // in a text-only remix the model never saw any pictures, so a
    // hallucinated keepImages array must not be allowed to delete images.
    const imagesForVirtualDeck = imagesWereSent ? slideImages : null;
    const virtualDeck = this.#planToVirtualDeck(rewriteEntries, planContext, imagesForVirtualDeck);
    const virtualSlides = splitSlidesForAi(virtualDeck, "generate");
    const virtualCount = virtualSlides.length;

    // ── Phase 3: Execute via existing single-call/batched path ──
    // Build a synthetic operation with the virtual deck as context.
    // Clear mode so the inner call doesn't recurse into the remix flow.
    const execOp = {
      ...operation,
      context: virtualDeck,
      opts: { ...operation.opts, mode: undefined },
    };
    const execSuffix = buildGenerateOptionsSuffix(execOp.opts);

    onLog?.(`Generating ${virtualCount} slide(s) for ${mode}\u2026`);
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

    if (result == null) return result;

    // Remix/reimagine intentionally reorders/splits/merges slides, so positional
    // directive injection would attach backgrounds/themes to the wrong
    // slides. The virtual deck and kept source slides already carry the
    // appropriate directives (preserved for remix, stripped for reimagine), and
    // the AI sees them in generate mode — the rewritten slides are used as-is
    // so any styling the AI kept or chose survives re-splicing.
    const rewrittenSlides = splitSlides(result);
    let rewriteIdx = 0;

    // Guard against the AI returning the wrong number of rewrite slides. If it
    // returns too few, fall back to the original source slide for the missing
    // ones so the deck never contains literal `undefined`. If it returns too
    // many, drop the extras and log it.
    if (rewrittenSlides.length !== rewriteEntries.length) {
      onLog?.(
        `Warning: expected ${rewriteEntries.length} rewritten slide(s), got ${rewrittenSlides.length} — ` +
          "falling back to original source slides for any missing entries.",
        "warn",
      );
      if (rewrittenSlides.length > rewriteEntries.length) {
        rewrittenSlides.length = rewriteEntries.length;
      } else {
        while (rewrittenSlides.length < rewriteEntries.length) {
          const entry = rewriteEntries[rewrittenSlides.length];
          const fallback = rawSourceSlides[entry?.source?.[0]] ?? "";
          rewrittenSlides.push(fallback);
        }
      }
    }

    const finalSlides = plan.map((_, i) =>
      keptByPlanIndex.has(i) ? keptByPlanIndex.get(i) : rewrittenSlides[rewriteIdx++],
    );
    return finalSlides.join("\n\n---\n\n");
  }

  // ── Reimagine (brief + outline → generate) ──

  /**
   * Run the full reimagine flow:
   *   1. Outline phase — the AI reads the deck summary and proposes a brief +
   *      outline.
   *   2. User review — the caller's onOutline callback shows the outline to
   *      the user for editing and resolves with the edited outline (or null to
   *      cancel).
   *   3. Generate phase — the (edited) outline is converted to a virtual deck
   *      of brief-only slides and run through the existing generate path.
   * @param {import("./ai-operation.js").AiOperation} operation
   * @param {AbortSignal} [signal]
   * @param {object} callbacks
   * @param {(outline: ReimagineOutline) => Promise<ReimagineOutline|null>} [callbacks.onOutline]
   * @returns {Promise<string|null>}
   */
  async #runReimagine(operation, signal, callbacks = {}) {
    const { onLog, onOutline } = callbacks;
    const sourceCount = splitSlidesForAi(operation.context, "generate").length;

    // ── Phase 1: Outline ──
    // If the user opted in to vision, extract + compress content images
    // from each slide so the outline AI can visually assess the deck.
    let slideImages = null;
    if (operation.opts?.includeImages) {
      onLog?.("Extracting slide images for vision\u2026");
      try {
        slideImages = await extractAll(operation.context);
        const imageCount = slideImages.reduce((sum, imgs) => sum + (imgs?.length || 0), 0);
        if (imageCount > 0) {
          onLog?.(`Sending ${imageCount} image(s) to AI for visual assessment\u2026`);
        } else {
          slideImages = null;
        }
      } catch {
        onLog?.("Image extraction failed — continuing with text-only outline\u2026");
        slideImages = null;
      }
    }

    onLog?.("Planning Reimagine outline\u2026");
    const outline = await this.#runReimagineOutline(
      operation,
      signal,
      callbacks,
      sourceCount,
      slideImages,
    );
    if (!outline) return null;

    // Slide-count guard: soft warn if the outline is outside 70-120% of source.
    const totalSlides = this.#countOutlineSlides(outline);
    const minTarget = Math.max(1, Math.round(sourceCount * 0.7));
    const maxTarget = Math.round(sourceCount * 1.2);
    if (totalSlides < minTarget || totalSlides > maxTarget) {
      onLog?.(
        `Warning: outline has ${totalSlides} slides, target is ${minTarget}-${maxTarget} (70-120% of ${sourceCount} source slides).`,
        "warn",
      );
    }

    // ── Phase 2: User review ──
    // Pass a deep copy so the callback can't mutate the original before we
    // apply the edited version.
    let editedOutline = outline;
    if (typeof onOutline === "function") {
      onLog?.("Waiting for outline review\u2026");
      const edited = await onOutline(this.#cloneOutline(outline));
      if (!edited) {
        onLog?.("Reimagine cancelled during outline review.");
        return null;
      }
      editedOutline = edited;
    }

    // ── Phase 3: Build virtual deck from the chapter outline ──
    // Each slide entry becomes a virtual slide carrying only a brief
    // comment. The generate prompt sees the brief and produces the slide
    // content fresh — no source markdown is sent, so the AI is free to
    // rewrite examples, visuals, and structure.
    const virtualSlides = this.#outlineToVirtualSlides(editedOutline);
    const virtualDeck = virtualSlides.join("\n\n---\n\n");
    const virtualCount = virtualSlides.length;

    onLog?.(
      `Reimagine outline: ${virtualCount} slide(s) across ${editedOutline.chapters.length} chapter(s).`,
    );

    // Carry the plan as a log line for sidebar visibility.
    onLog?.(`[Plan] ${editedOutline.plan}`);

    // ── Phase 4: Execute via existing single-call/batched path ──
    // Clear mode so the inner call doesn't recurse into the reimagine flow.
    const execOp = {
      ...operation,
      context: virtualDeck,
      opts: { ...operation.opts, mode: undefined },
    };
    const execSuffix = buildGenerateOptionsSuffix(execOp.opts);

    onLog?.(`Generating ${virtualCount} slide(s) for reimagine\u2026`);
    const result =
      virtualCount <= BATCH_SIZE
        ? await this.#runWholeDeckSingleCall(execOp, signal, execSuffix, callbacks, virtualCount)
        : await this.#runWholeDeckBatched(
            execOp,
            signal,
            execSuffix,
            virtualCount,
            splitSlidesForAi(virtualDeck, "generate"),
            callbacks,
          );

    if (!result) return result;

    // The generate path gap-fills directives positionally when the slide
    // count matches. For reimagine the virtual deck has no original
    // directives, so there's nothing to gap-fill — return the result as-is.
    return result;
  }

  /**
   * Count total slides across all chapters in a Reimagine outline.
   * @param {ReimagineOutline} outline
   * @returns {number}
   */
  #countOutlineSlides(outline) {
    return outline.chapters.reduce((sum, ch) => sum + (ch.slides?.length || 0), 0);
  }

  /**
   * Deep-clone a Reimagine outline for passing to the onOutline callback.
   * @param {ReimagineOutline} outline
   * @returns {ReimagineOutline}
   */
  #cloneOutline(outline) {
    return {
      plan: outline.plan,
      chapters: outline.chapters.map((ch) => ({
        title: ch.title,
        flowTag: ch.flowTag || "",
        summary: ch.summary || "",
        slides: ch.slides.map((s) => ({ title: s.title, intent: s.intent })),
      })),
    };
  }

  /**
   * Flatten a Reimagine outline into virtual slide briefs.
   * Each slide becomes `<!-- brief: {title} — {intent} -->`.
   * @param {ReimagineOutline} outline
   * @returns {string[]}
   */
  #outlineToVirtualSlides(outline) {
    const slides = [];
    for (const chapter of outline.chapters) {
      for (const slide of chapter.slides) {
        slides.push(`<!-- brief: ${slide.title} \u2014 ${slide.intent} -->`);
      }
    }
    return slides;
  }

  /**
   * Run the outline phase: call the LLM with the deck summary and parse the
   * plan + chapter-grouped outline JSON.
   * @param {import("./ai-operation.js").AiOperation} operation
   * @param {AbortSignal} [signal]
   * @param {object} callbacks
   * @param {number} sourceCount — number of source slides for the slide-count guard
   * @param {Array<string[]|null>} [slideImages] — per-slide compressed image data URLs for vision
   * @returns {Promise<ReimagineOutline|null>}
   */
  async #runReimagineOutline(operation, signal, callbacks = {}, sourceCount, slideImages = null) {
    const { context } = operation;
    const { onLog } = callbacks;

    const deckSummary = buildDeckSummary(context);
    const composer = new AiPromptComposer({
      systemFragment: systemPrompt,
      userFragment: reimagineOutlinePrompt,
    });

    const flow = operation.opts?.flow || "story";
    const minSlides = Math.max(1, Math.round(sourceCount * 0.7));
    const maxSlides = Math.round(sourceCount * 1.2);

    const { system, user } = composer.compose({
      markdown: deckSummary,
      layoutList: getAllowedLayoutList(),
      flow,
      sourceCount: sourceCount.toString(),
      minSlides: minSlides.toString(),
      maxSlides: maxSlides.toString(),
    });

    const reasoningEffort = this._useReasoning ? this._effort : "none";
    const maxTokens = estimateMaxTokens(deckSummary, "generate", {
      modelMaxOutput: this._modelMaxOutput,
      reasoningEffort,
    });

    // Build the user content — either a multi-modal array (vision) or plain text.
    const userContent = slideImages ? buildVisionMessage(user, slideImages) : user;

    const messages = [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ];

    const textTokenEstimate = Math.ceil((system.length + user.length) / 4);
    const imageCount = slideImages
      ? slideImages.reduce((sum, imgs) => sum + (imgs?.length || 0), 0)
      : 0;
    onLog?.(
      `[Tokens] Outline request \u2014 estimated input: ~${textTokenEstimate.toLocaleString()} text${imageCount > 0 ? ` + ${imageCount} image(s)` : ""}. Output cap (estimated): ${maxTokens.toLocaleString()}.`,
    );

    try {
      const response = await this._provider.chat(
        {
          messages,
          maxTokens,
          responseFormat: null,
          reasoning: this._buildReasoningBody(),
        },
        signal,
      );

      if (response.usage) {
        const { prompt_tokens, completion_tokens, total_tokens } = response.usage;
        onLog?.(
          `[Tokens] Outline response \u2014 provider usage: ${prompt_tokens ?? "?"} prompt + ${completion_tokens ?? "?"} completion = ${total_tokens ?? "?"} total.`,
        );
      }

      return this.#parseOutlineResponse(response.content);
    } catch (err) {
      // If vision was used and the error looks like a vision-not-supported
      // rejection, retry with text-only.
      if (slideImages && isVisionError(err)) {
        onLog?.("Vision not supported by this model — retrying outline with text-only\u2026");
        const textMessages = [
          { role: "system", content: system },
          { role: "user", content: user },
        ];
        const response = await this._provider.chat(
          {
            messages: textMessages,
            maxTokens,
            responseFormat: null,
            reasoning: this._buildReasoningBody(),
          },
          signal,
        );
        if (response.usage) {
          const { prompt_tokens, completion_tokens, total_tokens } = response.usage;
          onLog?.(
            `[Tokens] Outline response \u2014 provider usage: ${prompt_tokens ?? "?"} prompt + ${completion_tokens ?? "?"} completion = ${total_tokens ?? "?"} total.`,
          );
        }
        return this.#parseOutlineResponse(response.content);
      }
      throw err;
    }
  }

  /**
   * Parse the chapter-grouped outline JSON from an LLM response.
   * Robust to code fences and prose wrappers (same patterns as parseAiResponse).
   * @param {string} text
   * @returns {ReimagineOutline|null}
   */
  #parseOutlineResponse(text) {
    if (!text || typeof text !== "string") return null;

    let cleaned = text.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }

    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error("Outline response did not contain JSON");
    }
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("Outline response was not valid JSON");
    }

    if (typeof parsed.plan !== "string") {
      throw new Error("Outline response missing 'plan' string");
    }
    if (!Array.isArray(parsed.chapters) || parsed.chapters.length === 0) {
      throw new Error("Outline response missing 'chapters' array");
    }

    const chapters = parsed.chapters.map((ch, i) => {
      if (typeof ch !== "object" || ch === null) {
        throw new Error(`Chapter ${i} is not an object`);
      }
      if (typeof ch.title !== "string") {
        throw new Error(`Chapter ${i} missing 'title' string`);
      }
      if (!Array.isArray(ch.slides) || ch.slides.length === 0) {
        throw new Error(`Chapter ${i} missing non-empty 'slides' array`);
      }
      const slides = ch.slides.map((s, j) => {
        if (typeof s !== "object" || s === null) {
          throw new Error(`Chapter ${i} slide ${j} is not an object`);
        }
        if (typeof s.title !== "string" || typeof s.intent !== "string") {
          throw new Error(`Chapter ${i} slide ${j} missing 'title' or 'intent' string`);
        }
        return { title: s.title, intent: s.intent };
      });
      return {
        title: ch.title,
        flowTag: typeof ch.flowTag === "string" ? ch.flowTag : "",
        summary: typeof ch.summary === "string" ? ch.summary : "",
        slides,
      };
    });

    return {
      plan: parsed.plan,
      chapters,
    };
  }

  /**
   * Run the plan phase: call the LLM with the deck summary and parse the plan.
   * When slideImages is provided, sends a multi-modal message with image blocks
   * so the AI can visually assess layout quality. Falls back to text-only on
   * provider error (e.g. model doesn't support vision).
   * @param {import("./ai-operation.js").AiOperation} operation
   * @param {AbortSignal} [signal]
   * @param {object} callbacks
   * @param {Array<string[]|null>} [slideImages] — per-slide compressed image
   *   data URLs, or null for text-only plan.
   * @returns {Promise<Array<object>>} validated plan entries
   */
  async #runRemixPlan(operation, signal, callbacks = {}, slideImages = null) {
    const { context } = operation;
    const { onLog } = callbacks;

    const deckSummary = buildDeckSummary(context);
    const sourceCount = splitSlidesForAi(context, "generate").length;
    const composer = new AiPromptComposer({
      systemFragment: systemPrompt,
      userFragment: remixPlanPrompt,
    });

    const mode = operation.opts?.mode || "remix";
    const creativeGuidance =
      "Preserve the deck's core message and important source material. Reorganize where it improves clarity, pacing, or narrative flow. Use merge thoughtfully and keep slides that are already effective.";

    const preserveVisualIdentity = operation.opts?.preserveVisualIdentity ?? true;
    const visualIdentityGuidance = preserveVisualIdentity
      ? "Preserve the original theme, colors, backgrounds, and visual language whenever possible."
      : "Do not preserve the original theme, colors, backgrounds, or visual language. You may introduce a new visual direction that supports the restructured deck.";

    const composeArgs = {
      markdown: deckSummary,
      layoutList: getAllowedLayoutList(),
      creativeGuidance,
      visualIdentityGuidance,
      sourceCount: sourceCount.toString(),
      maxSourceIndex: (sourceCount - 1).toString(),
    };
    const { system, user } = composer.compose({
      ...composeArgs,
      imagesSection: buildImagesSectionForPrompt(Boolean(slideImages)),
    });

    const reasoningEffort = this._useReasoning ? this._effort : "none";
    const maxTokens = estimateMaxTokens(deckSummary, "generate", {
      modelMaxOutput: this._modelMaxOutput,
      reasoningEffort,
    });

    // Track whether images were actually delivered to the plan AI. If we fall
    // back from vision to text-only, keepImages must not be trusted.
    let imagesWereSent = false;

    // Build the user content — either a multi-modal array (vision) or plain text.
    const userContent = slideImages ? buildVisionMessage(user, slideImages) : user;
    if (slideImages) imagesWereSent = true;

    const messages = [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ];

    // Log the estimated input size before sending, so the actual request cost
    // (text + image tokens) is visible in the AI sidebar log, not just the
    // pre-flight modal estimate.
    const textTokenEstimate = Math.ceil((system.length + user.length) / 4);
    const imageCount = slideImages
      ? slideImages.reduce((sum, imgs) => sum + (imgs?.length || 0), 0)
      : 0;
    const imageTokenEstimate = imageCount > 0 ? estimateTotalImageTokens(imageCount) : 0;
    onLog?.(
      `[Tokens] Plan request — estimated input: ~${textTokenEstimate.toLocaleString()} text` +
        (imageCount > 0
          ? ` + ~${imageTokenEstimate.toLocaleString()} image (${imageCount} image${imageCount === 1 ? "" : "s"})`
          : "") +
        ` \u2248 ~${(textTokenEstimate + imageTokenEstimate).toLocaleString()} total. Output cap (estimated): ${maxTokens.toLocaleString()}.`,
    );

    let response;
    try {
      response = await this._provider.chat(
        {
          messages,
          maxTokens,
          responseFormat: null,
          reasoning: this._buildReasoningBody(),
        },
        signal,
      );
    } catch (err) {
      // If we sent images and the provider rejected them, retry once with
      // text-only. Only do this for errors that are likely vision-related
      // (HTTP 400/422 with image/vision keywords in the message). Other
      // errors (auth, rate limit, network) should propagate so the user
      // sees the real problem instead of a misleading "vision not supported".
      if (slideImages && isVisionError(err)) {
        onLog?.("Vision not supported — retrying with text-only plan\u2026");
        // Recompose the user prompt with the text-only imagesSection rather
        // than stripping images out of the vision message: the vision
        // message's "Slide N images:" labels reference pictures that are no
        // longer attached, and leaving them in would push the model to emit
        // keepImages entries it can't justify.
        imagesWereSent = false;
        const { user: textOnlyUser } = composer.compose({
          ...composeArgs,
          imagesSection: buildImagesSectionForPrompt(false),
        });
        response = await this._provider.chat(
          {
            messages: [
              { role: "system", content: system },
              { role: "user", content: textOnlyUser },
            ],
            maxTokens,
            responseFormat: null,
            reasoning: this._buildReasoningBody(),
          },
          signal,
        );
      } else {
        throw err;
      }
    }

    // Log the actual token usage the provider reports (ground truth, unlike
    // the pre-request estimate above — providers count image tokens using
    // their own tiling/resolution formula, which can differ from ours).
    if (response.usage) {
      const { prompt_tokens, completion_tokens, total_tokens } = response.usage;
      onLog?.(
        `[Tokens] Plan response — provider usage: ${prompt_tokens ?? "?"} prompt (input billed) + ${completion_tokens ?? "?"} completion (output billed) = ${total_tokens ?? "?"} total.`,
      );
    }

    const plan = this.#parsePlanResponse(response.content);
    const validation = this.#validatePlan(plan, sourceCount);
    if (!validation.ok) {
      const label = mode ? `${mode} plan` : "remix plan";
      throw new Error(`Invalid ${label}: ${validation.errors.join("; ")}`);
    }

    // Send the structured plan to the sidebar for a readable summary section.
    callbacks.onPlan?.(plan, sourceCount, mode);

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

    return { plan, imagesWereSent };
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

      // keepImages is optional. If present, must be an array of non-negative
      // integers (0-based indices into the source slide's extracted images).
      if (entry.keepImages !== undefined) {
        if (!Array.isArray(entry.keepImages)) {
          errors.push(`${prefix}: keepImages must be an array if present`);
        } else {
          for (const imgIdx of entry.keepImages) {
            if (typeof imgIdx !== "number" || imgIdx < 0 || !Number.isInteger(imgIdx)) {
              errors.push(`${prefix}: keepImages contains invalid index ${imgIdx}`);
            }
          }
        }
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
   * When an entry has `keepImages`, images not in the keep list are stripped
   * from the source slide content before building the virtual slide. This
   * tells the execute phase which images to drop.
   *
   * @param {Array<object>} plan
   * @param {string} sourceMarkdown
   * @param {Array<Array<{src: string, dataUrl: string}>|null>|null} [slideImages] —
   *   per-source-slide arrays of the images actually sent to the plan AI (see
   *   `slide-image-extractor.js#extractAll`), or null if no images were sent.
   *   keepImages is only honoured when this is provided — in a text-only
   *   remix the model never saw any pictures, so a hallucinated keepImages
   *   array must not be allowed to delete images. Filtering also matches
   *   images by src identity (not ordinal position) so that images excluded
   *   from extraction (backgrounds, SVG placeholders) or that failed to
   *   compress — which never reached the model — are never touched.
   * @returns {string}
   */
  #planToVirtualDeck(plan, sourceMarkdown, slideImages = null) {
    // Use the fence-aware split so `---` inside code blocks doesn't create
    // phantom slides and misalign source indices with the plan.
    const sourceSlides = splitSlidesForAi(sourceMarkdown, "generate");

    const virtualSlides = plan.map((entry) => {
      if (entry.action === "keep") {
        return sourceSlides[entry.source[0]];
      }

      // Apply keepImages filtering: strip images not in the keep list from
      // each source slide before joining.
      const processedSources = entry.source.map((idx) => {
        const slide = sourceSlides[idx];
        const sentImages = slideImages?.[idx];
        if (!sentImages || !entry.keepImages || !Array.isArray(entry.keepImages)) return slide;
        return filterImagesByKeepIndices(slide, entry.keepImages, sentImages);
      });

      // Join source slides with a merge marker (not ---) so splitSlidesForAi
      // treats the whole entry as one virtual slide.
      const sourceContent = processedSources.join("\n\n<!-- merge source -->\n\n");
      return `<!-- brief: ${entry.brief} -->\n${sourceContent}`;
    });

    return virtualSlides.join("\n\n---\n\n");
  }
}

/**
 * Remove images from a slide markdown that are not in the keepIndices list.
 * `keepIndices` are 0-based positions into `sentImages` — the images that
 * were actually sent to the model for this slide (in the same order as
 * `buildVisionMessage`) — not ordinal positions in the raw markdown. Images
 * in the markdown whose src was never sent to the model (e.g. backgrounds,
 * SVG placeholders, or images that failed to compress) are left untouched,
 * since the model never had a chance to judge them.
 *
 * Matching is by src string, not by occurrence index. If the same src appears
 * more than once on a slide, all occurrences are kept or removed together —
 * the AI cannot keep one occurrence of an image and drop another.
 * @param {string} slideMarkdown
 * @param {number[]} keepIndices — 0-based indices into `sentImages`
 * @param {Array<{src: string, dataUrl: string}>} sentImages — images sent to
 *   the model for this slide, in order
 * @returns {string} slide markdown with non-kept images removed
 */
function filterImagesByKeepIndices(slideMarkdown, keepIndices, sentImages) {
  const sentSrcs = new Set(sentImages.map((entry) => entry.src));
  const keepSrcs = new Set(
    keepIndices.map((i) => sentImages[i]?.src).filter((src) => src !== undefined),
  );
  const images = parseAllImages(slideMarkdown);
  if (images.length === 0) return slideMarkdown;

  // Build the result by removing non-kept images. Work backwards so indices
  // don't shift as we remove content.
  let result = slideMarkdown;
  for (let i = images.length - 1; i >= 0; i--) {
    const img = images[i];
    // Only touch images that were actually sent to the model — anything else
    // (backgrounds, SVG placeholders, failed compressions) was never judged
    // and must be left in place.
    if (!sentSrcs.has(img.src)) continue;
    if (keepSrcs.has(img.src)) continue;
    // Remove the image tag and any surrounding empty line that would be left
    // behind. Replace the fullMatch with nothing, then clean up double blank lines.
    result = result.slice(0, img.start) + result.slice(img.end);
  }
  // Clean up any double blank lines left by removals
  return result.replace(/\n{3,}/g, "\n\n").trim();
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
