/**
 * RemixReimagineOrchestrator
 *
 * Handles remix and reimagine AI operations — two-phase plan→execute flows
 * that restructure the deck. The plan phase produces a restructuring plan
 * or outline, which is converted to a virtual deck and fed through the
 * WholeDeckOrchestrator's single-call/batched path.
 *
 * Extracted from AiOrchestrator.
 */

import {
  buildDeckSummary,
  buildGenerateOptionsSuffix,
  BATCH_SIZE,
  splitSlidesForAi,
  stripThemeAndBackground,
} from "./ai-prompt-builder.js";
import { splitSlides } from "../markdown-parser.js";
import { extractAll } from "./slide-image-extractor.js";
import {
  buildImagesSectionForPrompt,
  buildRemixVisualIdentityGuidance,
  composeMessages,
  getFragment,
  serializeVisualSystemForBreakdown,
} from "./ai-prompt-fragments.js";
import { buildVisionMessage, estimateTotalImageTokens } from "./ai-vision-message.js";
import { estimateMaxTokens } from "./ai-token-estimator.js";
import { parseAllImages } from "../image-markdown-parser.js";
import { buildReasoningBody, isVisionError } from "./orchestrator-shared.js";
import { parseVisualSystem } from "./visual-system-schema.js";
import { normalizeBeats } from "./beat-normalizer.js";

/**
 * @typedef {Object} ReimagineOutlineChapter
 * @property {string} title
 * @property {string} flowTag — one of: hook, context, problem, tension, solution, evidence, comparison, example, transition, climax, cta
 * @property {string} summary
 * @property {number} suggestedSlideCount
 */

/**
 * @typedef {Object} ReimagineOutline
 * @property {string} plan
 * @property {ReimagineOutlineChapter[]} chapters
 * @property {import("./visual-system-schema.js").VisualSystem|null} visualSystem
 */

/**
 * @typedef {Object} ReimagineBreakdownSlide
 * @property {string} title
 * @property {string} intent
 * @property {('continuation'|'transition'|'punctuation'|'emotional'|'divider')} visualBeat
 * @property {('low'|'medium'|'high')} energy
 * @property {('subtle'|'moderate'|'strong')} contrast
 * @property {('continue'|'break')} relationship
 * @property {string} [imageQuery]
 */

/**
 * @typedef {Object} ReimagineBreakdownChapter
 * @property {string} title
 * @property {ReimagineBreakdownSlide[]} slides
 */

export class RemixReimagineOrchestrator {
  /**
   * @param {object} deps
   * @param {object} deps.provider — AiProviderClient instance
   * @param {number|null} [deps.modelMaxOutput] — model's max completion tokens
   * @param {boolean} [deps.useReasoning] — whether extended thinking is enabled
   * @param {string} [deps.effort] — reasoning effort: "none" | "low" | "medium" | "high"
   * @param {boolean} [deps.effortSupported] — whether the model exposes effort selection
   * @param {object} deps.wholeDeckOrchestrator — WholeDeckOrchestrator instance for execute phase
   * @param {(src: string) => Promise<string>} [deps.resolveImageSrc] — resolves
   *   `images/...` relative paths to fetchable URLs for vision-augmented AI.
   *   Injected from the editor layer to avoid a data→editor upward import.
   */
  constructor({
    provider,
    modelMaxOutput = null,
    useReasoning = false,
    effort = "none",
    effortSupported = true,
    wholeDeckOrchestrator,
    resolveImageSrc = (src) => Promise.resolve(src),
  }) {
    this._provider = provider;
    this._modelMaxOutput = modelMaxOutput;
    this._useReasoning = useReasoning;
    this._effort = effort;
    this._effortSupported = effortSupported;
    this._wholeDeck = wholeDeckOrchestrator;
    this._resolveImageSrc = resolveImageSrc;
  }

  // ── Remix (two-phase plan→execute) ──

  /**
   * Run the full remix flow: plan phase → virtual deck → execute phase.
   * @param {import("./ai-operation.js").AiOperation} operation
   * @param {AbortSignal} [signal]
   * @param {object} callbacks
   * @returns {Promise<string|null>}
   */
  async runRemix(operation, signal, callbacks = {}) {
    const { context } = operation;
    const { onLog } = callbacks;

    // ── Phase 1: Plan ──
    // If the user opted in to vision, extract + compress content images
    // from each slide so the plan AI can visually assess layout quality.
    let slideImages = null;
    if (operation.opts?.includeImages) {
      onLog?.("Extracting slide images for vision\u2026");
      try {
        slideImages = await extractAll(context, this._resolveImageSrc);
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
        ? await this._wholeDeck.runWholeDeckSingleCall(
            execOp,
            signal,
            execSuffix,
            callbacks,
            virtualCount,
          )
        : await this._wholeDeck.runWholeDeckBatched(
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
    // many, drop the extras — note that positional correspondence may be
    // unreliable in that case since the AI may have merged/split differently.
    if (rewrittenSlides.length > rewriteEntries.length) {
      onLog?.(
        `Warning: expected ${rewriteEntries.length} rewritten slide(s), got ${rewrittenSlides.length} — ` +
          "dropping surplus slides. Positional correspondence may be unreliable if the AI merged or split content differently.",
        "warn",
      );
      rewrittenSlides.length = rewriteEntries.length;
    } else if (rewrittenSlides.length < rewriteEntries.length) {
      onLog?.(
        `Warning: expected ${rewriteEntries.length} rewritten slide(s), got ${rewrittenSlides.length} — ` +
          "falling back to original source slides for missing entries.",
        "warn",
      );
      while (rewrittenSlides.length < rewriteEntries.length) {
        const entry = rewriteEntries[rewrittenSlides.length];
        const fallback = rawSourceSlides[entry?.source?.[0]] ?? "";
        rewrittenSlides.push(fallback);
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
  async runReimagine(operation, signal, callbacks = {}) {
    const { onLog, onOutline } = callbacks;
    const sourceCount = splitSlidesForAi(operation.context, "generate").length;

    // ── Phase 1: Outline ──
    // If the user opted in to vision, extract + compress content images
    // from each slide so the outline AI can visually assess the deck.
    let slideImages = null;
    if (operation.opts?.includeImages) {
      onLog?.("Extracting slide images for vision\u2026");
      try {
        slideImages = await extractAll(operation.context, this._resolveImageSrc);
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

    // Slide-count guard: soft warn if the suggested total is outside 70-120%.
    const totalSuggested = this.#countSuggestedSlides(outline);
    const minTarget = Math.max(1, Math.round(sourceCount * 0.7));
    const maxTarget = Math.round(sourceCount * 1.2);
    if (totalSuggested < minTarget || totalSuggested > maxTarget) {
      onLog?.(
        `Warning: outline suggests ${totalSuggested} slides, target is ${minTarget}-${maxTarget} (70-120% of ${sourceCount} source slides).`,
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

    // ── Phase 3: Slide breakdown ──
    // Now that the chapters are finalized, call the AI to break each chapter
    // into individual slide briefs. This ensures the slide structure matches
    // the user's edits, not the original outline draft.
    onLog?.("Breaking chapters into slides\u2026");
    const breakdown = await this.#runSlideBreakdown(editedOutline, signal, callbacks);
    if (!breakdown) return null;

    const virtualSlides = this.#breakdownToVirtualSlides(editedOutline, breakdown);
    const virtualDeck = virtualSlides.join("\n\n---\n\n");
    const virtualCount = virtualSlides.length;

    onLog?.(
      `Reimagine: ${virtualCount} slide(s) across ${editedOutline.chapters.length} chapter(s).`,
    );

    // Carry the plan as a log line for sidebar visibility.
    onLog?.(`[Plan] ${editedOutline.plan}`);

    // ── Phase 4: Execute via existing single-call/batched path ──
    // Clear mode so the inner call doesn't recurse into the reimagine flow.
    // Pass the visual system through so the generate prompt receives the
    // design language + beat→treatment mapping via the options suffix.
    const execOp = {
      ...operation,
      context: virtualDeck,
      opts: {
        ...operation.opts,
        mode: undefined,
        visualSystem: editedOutline.visualSystem ?? null,
      },
    };
    const execSuffix = buildGenerateOptionsSuffix(execOp.opts);

    onLog?.(`Generating ${virtualCount} slide(s) for reimagine\u2026`);
    const result =
      virtualCount <= BATCH_SIZE
        ? await this._wholeDeck.runWholeDeckSingleCall(
            execOp,
            signal,
            execSuffix,
            callbacks,
            virtualCount,
          )
        : await this._wholeDeck.runWholeDeckBatched(
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
   * Count total suggested slides across all chapters in a Reimagine outline.
   * @param {ReimagineOutline} outline
   * @returns {number}
   */
  #countSuggestedSlides(outline) {
    return outline.chapters.reduce((sum, ch) => sum + (ch.suggestedSlideCount || 0), 0);
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
        suggestedSlideCount: ch.suggestedSlideCount || 1,
      })),
      visualSystem: outline.visualSystem ?? null,
    };
  }

  /**
   * Flatten a breakdown (chapters with slide briefs) into virtual slide briefs.
   * Each slide becomes `<!-- brief: {title} — {intent} (chapter: {title} — {summary}) | beat: {visualBeat}, energy: {energy}, contrast: {contrast}, relationship: {relationship} -->`.
   * Slides with no title or intent fall back to their chapter context, and
   * slides with no context at all are dropped. `imageQuery` is stored on the
   * virtual slide metadata but not included in the serialized brief.
   * @param {ReimagineOutline} outline — the finalized outline (for chapter context)
   * @param {ReimagineBreakdownChapter[]} breakdown — the breakdown with slide briefs
   * @returns {string[]}
   */
  #breakdownToVirtualSlides(outline, breakdown) {
    const slides = [];
    const join = (...parts) =>
      parts
        .map((p) => (p || "").trim())
        .filter(Boolean)
        .join(" \u2014 ");
    for (let ci = 0; ci < breakdown.chapters.length; ci++) {
      const bdChapter = breakdown.chapters[ci];
      const outlineChapter = outline.chapters[ci];
      const chapterContext = outlineChapter
        ? join(outlineChapter.title, outlineChapter.summary)
        : "";
      for (const slide of bdChapter.slides) {
        const brief = join(slide.title, slide.intent);
        if (!brief && !chapterContext) continue;
        const text = brief
          ? chapterContext
            ? `${brief} (chapter: ${chapterContext})`
            : brief
          : chapterContext;
        const beatSuffix = this.#formatBeatSuffix(slide);
        slides.push(`<!-- brief: ${text}${beatSuffix} -->`);
      }
    }
    return slides;
  }

  /**
   * Format the beat metadata as a `| beat: ...` suffix for the brief comment.
   * @param {ReimagineBreakdownSlide} slide
   * @returns {string}
   */
  #formatBeatSuffix(slide) {
    const beat = slide.visualBeat || "continuation";
    const energy = slide.energy || "medium";
    const contrast = slide.contrast || "moderate";
    const relationship = slide.relationship || "continue";
    return ` | beat: ${beat}, energy: ${energy}, contrast: ${contrast}, relationship: ${relationship}`;
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

    const flow = operation.opts?.flow || "story";
    const minSlides = Math.max(1, Math.round(sourceCount * 0.7));
    const maxSlides = Math.round(sourceCount * 1.2);

    const { system, user } = composeMessages(
      getFragment("system-prompt.md"),
      getFragment("reimagine-outline-prompt.md"),
      {
        markdown: deckSummary,
        flow,
        sourceCount: sourceCount.toString(),
        minSlides: minSlides.toString(),
        maxSlides: maxSlides.toString(),
      },
    );

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
          reasoning: buildReasoningBody(this._useReasoning, this._effort, this._effortSupported),
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
            reasoning: buildReasoningBody(this._useReasoning, this._effort, this._effortSupported),
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
      const suggestedSlideCount =
        typeof ch.suggestedSlideCount === "number" && ch.suggestedSlideCount > 0
          ? Math.round(ch.suggestedSlideCount)
          : 1;
      return {
        title: ch.title,
        flowTag: typeof ch.flowTag === "string" ? ch.flowTag : "",
        summary: typeof ch.summary === "string" ? ch.summary : "",
        suggestedSlideCount,
      };
    });

    // Best-effort visualSystem parse: fall back to DEFAULT_VISUAL_SYSTEM if
    // missing or invalid. Outline validation (plan/chapters) still throws.
    const visualSystem = parseVisualSystem(parsed.visualSystem);

    return {
      plan: parsed.plan,
      chapters,
      visualSystem,
    };
  }

  /**
   * Run the slide-breakdown phase: call the LLM with the finalized chapters
   * and parse per-slide briefs for each chapter.
   * @param {ReimagineOutline} outline — finalized outline from user review
   * @param {AbortSignal} [signal]
   * @param {object} callbacks
   * @returns {Promise<{chapters: ReimagineBreakdownChapter[]}|null>}
   */
  async #runSlideBreakdown(outline, signal, callbacks = {}) {
    const { onLog } = callbacks;

    // Serialize the chapters into a compact JSON for the prompt.
    const chaptersInput = JSON.stringify({
      chapters: outline.chapters.map((ch) => ({
        title: ch.title,
        flowTag: ch.flowTag,
        summary: ch.summary,
        suggestedSlideCount: ch.suggestedSlideCount,
      })),
    });

    const visualSystemInput = serializeVisualSystemForBreakdown(outline.visualSystem);

    const { system, user } = composeMessages(
      getFragment("system-prompt.md"),
      getFragment("reimagine-breakdown-prompt.md"),
      { chapters: chaptersInput, visualSystem: visualSystemInput },
    );

    const reasoningEffort = this._useReasoning ? this._effort : "none";
    const maxTokens = estimateMaxTokens(chaptersInput, "generate", {
      modelMaxOutput: this._modelMaxOutput,
      reasoningEffort,
    });

    const messages = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];

    const textTokenEstimate = Math.ceil((system.length + user.length) / 4);
    onLog?.(
      `[Tokens] Breakdown request \u2014 estimated input: ~${textTokenEstimate.toLocaleString()} text. Output cap (estimated): ${maxTokens.toLocaleString()}.`,
    );

    const response = await this._provider.chat(
      {
        messages,
        maxTokens,
        responseFormat: null,
        reasoning: buildReasoningBody(this._useReasoning, this._effort, this._effortSupported),
      },
      signal,
    );

    if (response.usage) {
      const { prompt_tokens, completion_tokens, total_tokens } = response.usage;
      onLog?.(
        `[Tokens] Breakdown response \u2014 provider usage: ${prompt_tokens ?? "?"} prompt + ${completion_tokens ?? "?"} completion = ${total_tokens ?? "?"} total.`,
      );
    }

    return this.#parseBreakdownResponse(response.content, outline);
  }

  /**
   * Parse the slide-breakdown JSON from an LLM response.
   * Validates that the breakdown chapters match the outline chapters.
   * @param {string} text
   * @param {ReimagineOutline} outline
   * @returns {{chapters: ReimagineBreakdownChapter[]}|null}
   */
  #parseBreakdownResponse(text, outline) {
    if (!text || typeof text !== "string") return null;

    let cleaned = text.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }

    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error("Breakdown response did not contain JSON");
    }
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("Breakdown response was not valid JSON");
    }

    if (!Array.isArray(parsed.chapters) || parsed.chapters.length === 0) {
      throw new Error("Breakdown response missing 'chapters' array");
    }

    if (parsed.chapters.length !== outline.chapters.length) {
      throw new Error(
        `Breakdown has ${parsed.chapters.length} chapters, expected ${outline.chapters.length}`,
      );
    }

    const chapters = parsed.chapters.map((ch, i) => {
      if (typeof ch !== "object" || ch === null) {
        throw new Error(`Breakdown chapter ${i} is not an object`);
      }
      if (typeof ch.title !== "string") {
        throw new Error(`Breakdown chapter ${i} missing 'title' string`);
      }
      if (!Array.isArray(ch.slides) || ch.slides.length === 0) {
        throw new Error(`Breakdown chapter ${i} missing non-empty 'slides' array`);
      }
      const slides = ch.slides.map((s, j) => {
        if (typeof s !== "object" || s === null) {
          throw new Error(`Breakdown chapter ${i} slide ${j} is not an object`);
        }
        if (typeof s.title !== "string" || typeof s.intent !== "string") {
          throw new Error(`Breakdown chapter ${i} slide ${j} missing 'title' or 'intent' string`);
        }
        return {
          title: s.title,
          intent: s.intent,
          visualBeat: typeof s.visualBeat === "string" ? s.visualBeat : "continuation",
          energy: typeof s.energy === "string" ? s.energy : "medium",
          contrast: typeof s.contrast === "string" ? s.contrast : "moderate",
          relationship: typeof s.relationship === "string" ? s.relationship : "continue",
          ...(typeof s.imageQuery === "string" && s.imageQuery.trim()
            ? { imageQuery: s.imageQuery.trim() }
            : {}),
        };
      });
      return { title: ch.title, slides };
    });

    // Normalize beats across the entire deck (flatten, normalize, re-nest).
    const allSlides = chapters.flatMap((ch) => ch.slides);
    normalizeBeats(allSlides);

    return { chapters };
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

    const mode = operation.opts?.mode || "remix";
    const creativeGuidance = getFragment("creative-guidance.md").trim();

    const preserveVisualIdentity = operation.opts?.preserveVisualIdentity ?? true;
    const visualIdentityGuidance = buildRemixVisualIdentityGuidance(preserveVisualIdentity);

    const composeArgs = {
      markdown: deckSummary,
      creativeGuidance,
      visualIdentityGuidance,
      sourceCount: sourceCount.toString(),
      maxSourceIndex: (sourceCount - 1).toString(),
    };
    const { system, user } = composeMessages(
      getFragment("system-prompt.md"),
      getFragment("remix-plan-prompt.md"),
      {
        ...composeArgs,
        imagesSection: buildImagesSectionForPrompt(Boolean(slideImages)),
      },
    );

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
          reasoning: buildReasoningBody(this._useReasoning, this._effort, this._effortSupported),
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
        const { user: textOnlyUser } = composeMessages(
          getFragment("system-prompt.md"),
          getFragment("remix-plan-prompt.md"),
          {
            ...composeArgs,
            imagesSection: buildImagesSectionForPrompt(false),
          },
        );
        response = await this._provider.chat(
          {
            messages: [
              { role: "system", content: system },
              { role: "user", content: textOnlyUser },
            ],
            maxTokens,
            responseFormat: null,
            reasoning: buildReasoningBody(this._useReasoning, this._effort, this._effortSupported),
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
