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
  stripVisualIdentity,
} from "./ai-prompt-builder.js";
import { splitSlides } from "../markdown-parser.js";
import { extractAll } from "./slide-image-extractor.js";
import {
  buildImagesSectionForPrompt,
  buildRemixFlowGuidance,
  buildRemixVisualIdentityGuidance,
  composeMessages,
  getFragment,
  serializeVisualSystemForBreakdown,
  buildKeptImagesList,
  buildAvailableImagesBrief,
} from "./ai-prompt-fragments.js";
import { collectOwnImageSources, extractTopLevelDirectiveValues } from "./ai-output-validator.js";
import { stripLeadingDirectives } from "./ai-directive-utils.js";
import { buildVisionMessage, estimateTotalImageTokens } from "./ai-vision-message.js";
import { estimateMaxTokens } from "./ai-token-estimator.js";
import {
  parseAllImagesOutsideFences,
  findFencedRanges,
  splitBackgroundValue,
  normalizeImageSrc,
} from "../image-markdown-parser.js";

import { buildReasoningBody, isVisionError } from "./orchestrator-shared.js";
import { parseVisualSystem } from "./visual-system-schema.js";
import { normalizeBeats } from "./beat-normalizer.js";
import { extractJsonObject } from "./ai-response-parser.js";

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
 * @property {number[]} keepImages — 0-based indices into the flattened sent image list
 * @property {string} [firstSlideIdentity] — identifying text (course code, etc.) for the first slide's footer
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
    // Default matches #runRemixPlan's `?? true` so the plan prompt and the
    // execute phase can never resolve the option differently.
    const preserveVisualIdentity = operation.opts?.preserveVisualIdentity ?? true;
    const planContext = preserveVisualIdentity ? context : stripThemeAndBackground(context);

    onLog?.(`Planning ${mode} restructure\u2026`);
    const { plan, imagesWereSent } = await this.#runRemixPlan(
      operation,
      signal,
      callbacks,
      slideImages,
    );

    // ── Phase 2: Build virtual deck from all plan entries ──
    // Only honour keepImages when images were actually sent to the plan AI —
    // in a text-only remix the model never saw any pictures, so a
    // hallucinated keepImages array must not be allowed to delete images.
    const imagesForVirtualDeck = imagesWereSent ? slideImages : null;
    // `processedSourcesByEntry` is the same per-entry source slides
    // (post keepImages filtering) that were joined into each virtual slide —
    // reused below by the deterministic preserve-mode backstop instead of
    // re-splitting/re-filtering the deck per entry, per source slide.
    const { markdown: virtualDeck, processedSourcesByEntry: virtualSourceSlidesByEntry } =
      this.#planToVirtualDeck(plan, planContext, imagesForVirtualDeck);
    const virtualSlides = splitSlidesForAi(virtualDeck, "generate");
    const virtualCount = virtualSlides.length;
    // Image allowlist for the execute phase: ONLY the images the plan AI
    // actually saw as vision content may be adopted by rewritten slides.
    // Background images are never extracted (slide-image-extractor excludes
    // them), so they are never analyzed and can never be reused elsewhere —
    // this is what stops a source background from ending up as an <img> on
    // another slide. A rewritten slide may additionally KEEP its own source
    // slide's images (positional exemption, enforced by validation and the
    // per-slide strip below) — that is preservation, not reuse, and it also
    // means a text-only remix keeps each slide's own pictures without
    // letting the model shuffle them around.
    const analyzedSrcs = imagesWereSent
      ? Array.from(
          new Set(
            (slideImages || [])
              .flat()
              .map((e) => e?.src)
              .filter(Boolean),
          ),
        )
      : [];

    // ── Phase 3: Execute via existing single-call/batched path ──
    // Build a synthetic operation with the virtual deck as context.
    // Clear mode so the inner call doesn't recurse into the remix flow.
    // Preserve the resolved preserveVisualIdentity (for the prompt suffix and
    // the visual-styling note). Identity is now enforced mechanically after
    // the execute phase (applyPreservedIdentity), so do not ask the validator
    // to retry on dropped/invented theme/background directives.
    // Restrict output images to the analyzed set (no fabricated URLs, no
    // un-analyzed adoptions). onlyExplicitImageSources skips the input-derived
    // union — the virtual deck text still carries source image markup
    // (including backgrounds), and trusting it would re-open the loophole
    // where a background the AI never saw becomes legal. The deck-wide
    // allowlist still lets batched validation accept analyzed images
    // relocated across batch boundaries.
    const execOp = {
      ...operation,
      context: virtualDeck,
      opts: {
        ...operation.opts,
        mode: undefined,
        preserveVisualIdentity,
        enforcePreserveIdentity: false,
        restrictImageSources: true,
        allowedImageSrcs: analyzedSrcs,
        onlyExplicitImageSources: true,
      },
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
    // slides. The virtual deck already carries the appropriate directives
    // (preserved for remix, stripped for reimagine), and the AI sees them in
    // generate mode — the generated slides are used as-is so any styling the
    // AI kept or chose survives re-splicing.
    const generatedSlides = splitSlides(result);

    // Guard against the AI returning the wrong number of slides. If it returns
    // too few, fall back to the joined original source slides for the missing
    // entries so the deck never contains literal `undefined`. If it returns too
    // many, drop the extras — positional correspondence may be unreliable if the
    // AI merged or split differently from the plan.
    if (generatedSlides.length > plan.length) {
      onLog?.(
        `Warning: expected ${plan.length} slide(s), got ${generatedSlides.length} — ` +
          "dropping surplus slides. Positional correspondence may be unreliable if the AI merged or split content differently.",
        "warn",
      );
      generatedSlides.length = plan.length;
    } else if (generatedSlides.length < plan.length) {
      onLog?.(
        `Warning: expected ${plan.length} slide(s), got ${generatedSlides.length} — ` +
          "falling back to original source slides for missing entries.",
        "warn",
      );
      while (generatedSlides.length < plan.length) {
        const sources = virtualSourceSlidesByEntry[generatedSlides.length] || [""];
        // Use only the first source slide for the fallback. A merge entry's
        // sources contain a `<!-- merge source -->` marker; injecting that
        // (or a `---` separator) would create an embedded slide boundary and
        // desynchronize the final deck's slide count.
        generatedSlides.push(sources[0] || "");
      }
    }

    // Final image pass, per slide, so the positional own-image exemption is
    // enforceable (a flat deck-wide allowlist would let a background from
    // slide A be adopted by slide B):
    // - Generated slides may reference (a) images the plan AI analyzed (the
    //   vision payload) and (b) images that belong to their own source
    //   slides. Anything else — e.g. a background image from another slide —
    //   is mechanically removed, matching what validation flags.
    // In discard mode the identity strip runs first, per slide, so stale
    // theme/color never survives while image backgrounds (content) do.
    let restoreIdx = 0;
    const identityStripped = preserveVisualIdentity
      ? generatedSlides
      : generatedSlides.map((slide) => stripVisualIdentity(slide));
    const cleaned = identityStripped.map((slide) => {
      const sources = virtualSourceSlidesByEntry[restoreIdx] || [];
      restoreIdx++;
      // Own-source images = physical references only (collectOwnImageSources
      // excludes reuse: paths — they are instructions, not images; the
      // validator's positional exemption applies the same rule).
      const ownSrcs = sources.flatMap((s) => collectOwnImageSources(s));
      return stripFabricatedImages(slide, [...analyzedSrcs, ...ownSrcs], onLog);
    });

    // Deterministic preserve-mode identity enforcement: overwrite any
    // model-emitted `theme:`/`background:` directives with the source slide's
    // original identity. This eliminates both dropped identity and
    // model-invented identity, and removes the need for repeated validation
    // retries. Runs AFTER the image strip so source image backgrounds
    // (never analyzed, therefore not in the strip allowlist) survive.
    if (preserveVisualIdentity) {
      let restoreIdx2 = 0;
      for (let i = 0; i < cleaned.length; i++) {
        const sources = virtualSourceSlidesByEntry[restoreIdx2] || [];
        restoreIdx2++;
        const restored = applyPreservedIdentity(cleaned[i], sources, onLog);
        if (restored !== cleaned[i]) cleaned[i] = restored;
      }
    }

    const collapsed = cleaned.map((slide) => collapseBackgroundDirectives(slide));
    return collapsed.join("\n\n---\n\n");
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
   * @param {(outline: ReimagineOutline, regenerate: (plan: string) => Promise<ReimagineOutline|null>) => Promise<ReimagineOutline|null>} [callbacks.onOutline]
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
    // apply the edited version. Also pass a `regenerate` function that the
    // callback can call to re-run the outline AI with an edited plan.
    let editedOutline = outline;
    if (typeof onOutline === "function") {
      onLog?.("Waiting for outline review\u2026");
      const regenerate = async (newPlan) => {
        onLog?.("Regenerating outline with edited plan\u2026");
        return this.#runReimagineOutline(
          operation,
          signal,
          callbacks,
          sourceCount,
          slideImages,
          newPlan,
        );
      };
      const edited = await onOutline(this.#cloneOutline(outline), regenerate);
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

    // Compute kept images from the outline's keepImages indices.
    // slideImages is a per-slide array; flatten it to get a 0-based list
    // matching the indices the outline AI used.
    const keptImageEntries = this.#extractKeptImages(slideImages, editedOutline.keepImages);
    const keptImageSrcs = keptImageEntries.map((e) => e.src);
    if (keptImageSrcs.length > 0) {
      onLog?.(`Keeping ${keptImageSrcs.length} image(s) from original deck for reuse.`);
    }

    onLog?.("Breaking chapters into slides\u2026");
    const breakdown = await this.#runSlideBreakdown(
      editedOutline,
      signal,
      callbacks,
      keptImageSrcs,
    );
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
    // Pass kept images as vision content (first batch/single call only) and
    // as a text list in the suffix (all batches).
    const keptImagesForVision = keptImageEntries.length > 0 ? keptImageEntries : null;
    const execOp = {
      ...operation,
      context: virtualDeck,
      opts: {
        ...operation.opts,
        mode: undefined,
        visualSystem: editedOutline.visualSystem ?? null,
        // Output images must resolve to the kept source images. The kept paths
        // are listed in the options suffix (buildAvailableImagesBrief), so pass
        // them explicitly to the validator — the virtual deck only carries them
        // when a brief happens to include a reuse:<path> directive. Use
        // onlyExplicitImageSources so a hallucinated `reuse:` path in the
        // virtual deck cannot become trusted merely by appearing in the brief.
        restrictImageSources: true,
        allowedImageSrcs: keptImageSrcs,
        onlyExplicitImageSources: true,
      },
    };
    const execSuffix =
      buildGenerateOptionsSuffix(execOp.opts) + buildAvailableImagesBrief(keptImageSrcs);

    onLog?.(`Generating ${virtualCount} slide(s) for reimagine\u2026`);
    const result =
      virtualCount <= BATCH_SIZE
        ? await this._wholeDeck.runWholeDeckSingleCall(
            execOp,
            signal,
            execSuffix,
            callbacks,
            virtualCount,
            keptImagesForVision,
          )
        : await this._wholeDeck.runWholeDeckBatched(
            execOp,
            signal,
            execSuffix,
            virtualCount,
            splitSlidesForAi(virtualDeck, "generate"),
            callbacks,
            keptImagesForVision,
          );

    if (!result) return result;

    // The generate path gap-fills directives positionally when the slide
    // count matches. For reimagine the virtual deck has no original
    // directives, so there's nothing to gap-fill — return the result as-is.
    // Reimagine always discards visual identity, so strip any theme/color
    // directives the AI echoed back — image backgrounds (background: url(...))
    // are kept because the validator guarantees they are deck images — and
    // remove any fabricated image references the model insisted on (the
    // validator only repairs; it never hard-fails).
    const cleaned = stripFabricatedImages(stripVisualIdentity(result), keptImageSrcs, onLog);
    const slides = splitSlides(cleaned);
    const collapsed = slides.map((slide) => collapseBackgroundDirectives(slide));
    return collapsed.join("\n\n---\n\n");
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
   * Extract the kept image entries from the per-slide slideImages array
   * using the outline's keepImages indices.
   *
   * `slideImages` is `Array<Array<{src, dataUrl}>|null>` — one entry per
   * slide. `keepImages` is a flat array of 0-based indices into the
   * flattened list of all images across all slides (in slide order, then
   * in-image order within each slide).
   *
   * @param {Array<Array<{src: string, dataUrl: string}>|null>|null} slideImages
   * @param {number[]} keepImages — 0-based indices into the flattened image list
   * @returns {Array<{src: string, dataUrl: string}>} kept image entries
   */
  #extractKeptImages(slideImages, keepImages) {
    if (!slideImages || !keepImages || keepImages.length === 0) return [];
    const keepSet = new Set(keepImages);
    const result = [];
    let flatIdx = 0;
    for (const imgs of slideImages) {
      if (!imgs) continue;
      for (const entry of imgs) {
        if (keepSet.has(flatIdx)) {
          result.push(entry);
        }
        flatIdx++;
      }
    }
    return result;
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
      keepImages: outline.keepImages ? [...outline.keepImages] : [],
      firstSlideIdentity: outline.firstSlideIdentity || "",
    };
  }

  /**
   * Flatten a breakdown (chapters with slide briefs) into virtual slide briefs.
   * Each slide becomes `<!-- brief: {title} — {intent} (chapter: {title} — {summary}) | beat: {visualBeat}, energy: {energy}, contrast: {contrast}, relationship: {relationship} | image: {imageQuery} -->`.
   * Slides with no title or intent fall back to their chapter context, and
   * slides with no context at all are dropped. `imageQuery` (including
   * `reuse:<path>` directives) is included in the serialized brief so the
   * generate AI knows which image to insert on each slide.
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
        const imageSuffix =
          typeof slide.imageQuery === "string" && slide.imageQuery.trim()
            ? ` | image: ${slide.imageQuery.trim()}`
            : "";
        slides.push(`<!-- brief: ${text}${beatSuffix}${imageSuffix} -->`);
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
   * @param {string} [planOverride] — when set, the user edited the plan and wants
   *   the AI to regenerate chapters based on this new plan direction
   * @returns {Promise<ReimagineOutline|null>}
   */
  async #runReimagineOutline(
    operation,
    signal,
    callbacks = {},
    sourceCount,
    slideImages = null,
    planOverride = null,
  ) {
    const { context } = operation;
    const { onLog } = callbacks;

    const deckSummary = buildDeckSummary(context, true);

    const flow = operation.opts?.flow || "instructional";
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

    // When regenerating with an edited plan, append the user's new plan as
    // additional guidance so the AI generates chapters aligned with it.
    const userWithPlan = planOverride
      ? user +
        `\n\nThe user has revised the plan direction. Generate chapters that align with this plan:\n"${planOverride}"`
      : user;

    const reasoningEffort = this._useReasoning ? this._effort : "none";
    const maxTokens = estimateMaxTokens(deckSummary, "generate", {
      modelMaxOutput: this._modelMaxOutput,
      reasoningEffort,
    });

    // Build the user content — either a multi-modal array (vision) or plain text.
    const userContent = slideImages ? buildVisionMessage(userWithPlan, slideImages) : userWithPlan;

    const messages = [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ];

    const textTokenEstimate = Math.ceil((system.length + userWithPlan.length) / 4);
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
          { role: "user", content: userWithPlan },
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
   * Uses the shared robust JSON extractor (string-aware brace tracking).
   * @param {string} text
   * @returns {ReimagineOutline|null}
   */
  #parseOutlineResponse(text) {
    if (!text || typeof text !== "string") return null;

    const extracted = extractJsonObject(text, "chapters");
    if (!extracted) {
      throw new Error("Outline response did not contain valid JSON");
    }
    const parsed = extracted.parsed;

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

    // Parse keepImages: optional array of non-negative integers (0-based
    // indices into the flattened sent image list). Invalid entries are
    // filtered out; if absent or empty, no images are kept.
    const keepImages = Array.isArray(parsed.keepImages)
      ? parsed.keepImages.filter(
          (idx) => typeof idx === "number" && idx >= 0 && Number.isInteger(idx),
        )
      : [];

    // Parse firstSlideIdentity: optional string extracted from the original
    // first slide (course code, week number, etc.) to be placed verbatim in
    // the first slide's footer.
    const firstSlideIdentity =
      typeof parsed.firstSlideIdentity === "string" ? parsed.firstSlideIdentity.trim() : "";

    return {
      plan: parsed.plan,
      chapters,
      visualSystem,
      keepImages,
      firstSlideIdentity,
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
  async #runSlideBreakdown(outline, signal, callbacks = {}, keptImageSrcs = []) {
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
    const keptImagesInput = buildKeptImagesList(keptImageSrcs);
    const firstSlideIdentityInput = outline.firstSlideIdentity
      ? `firstSlideIdentity: "${outline.firstSlideIdentity}"`
      : "firstSlideIdentity: (none — no specific identity to preserve)";

    const { system, user } = composeMessages(
      getFragment("system-prompt.md"),
      getFragment("reimagine-breakdown-prompt.md"),
      {
        chapters: chaptersInput,
        visualSystem: visualSystemInput,
        keptImages: keptImagesInput,
        firstSlideIdentity: firstSlideIdentityInput,
      },
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

    // Try to parse the breakdown. Only retry on JSON *extraction* failures
    // (the model wrapped JSON in prose or returned non-JSON). Validation
    // errors (missing chapters array, etc.) are thrown as-is — a repair
    // message saying "not valid JSON" would be misleading for those.
    try {
      return this.#parseBreakdownResponse(response.content, outline, callbacks, keptImageSrcs);
    } catch (err) {
      if (err.message !== "Breakdown response did not contain valid JSON") throw err;
      onLog?.(
        `Breakdown parse failed (${err.message}) — retrying with repair message\u2026`,
        "warn",
      );
      const repairMsg =
        'Your previous response was not valid JSON. Return ONLY the JSON object with a "chapters" array, no surrounding text or code fences.';
      const repairMessages = [
        ...messages,
        { role: "assistant", content: response.content },
        { role: "user", content: repairMsg },
      ];
      const retryResponse = await this._provider.chat(
        {
          messages: repairMessages,
          maxTokens,
          responseFormat: null,
          reasoning: buildReasoningBody(this._useReasoning, this._effort, this._effortSupported),
        },
        signal,
      );
      return this.#parseBreakdownResponse(retryResponse.content, outline, callbacks, keptImageSrcs);
    }
  }

  /**
   * Parse the slide-breakdown JSON from an LLM response.
   * Validates that the breakdown chapters match the outline chapters.
   * Throws "Breakdown response did not contain valid JSON" for extraction
   * failures (retryable) and other messages for validation failures.
   *
   * `imageQuery` values starting with `reuse:` are filtered against
   * `keptImageSrcs` so a hallucinated `reuse:<path>` reference cannot reach
   * the virtual deck and become trusted by the execute-phase validator.
   * @param {string} text
   * @param {ReimagineOutline} outline
   * @param {object} callbacks
   * @param {string[]} [keptImageSrcs=[]] — src paths the breakdown may reference
   * @returns {{chapters: ReimagineBreakdownChapter[]}|null}
   */
  #parseBreakdownResponse(text, outline, callbacks = {}, keptImageSrcs = []) {
    if (!text || typeof text !== "string") return null;

    const extracted = extractJsonObject(text, "chapters");
    if (!extracted) {
      throw new Error("Breakdown response did not contain valid JSON");
    }
    const parsed = extracted.parsed;

    if (!Array.isArray(parsed.chapters) || parsed.chapters.length === 0) {
      throw new Error("Breakdown response missing 'chapters' array");
    }

    const rawChapters = Array.isArray(parsed.chapters) ? parsed.chapters : [];
    const { onLog } = callbacks || {};
    if (rawChapters.length !== outline.chapters.length) {
      onLog?.(
        `Breakdown returned ${rawChapters.length} chapter(s), expected ${outline.chapters.length} — aligning to outline.`,
        "warn",
      );
    }

    const chapters = outline.chapters.map((outlineChapter, i) => {
      const rawCh = rawChapters[i];
      const ch =
        typeof rawCh === "object" && rawCh !== null ? rawCh : { title: outlineChapter.title };
      const title =
        typeof ch.title === "string" && ch.title.trim() ? ch.title.trim() : outlineChapter.title;
      const rawSlides = Array.isArray(ch.slides) ? ch.slides : [];
      if (rawSlides.length === 0) {
        onLog?.(
          `Breakdown chapter "${title}" has no slides; synthesizing a placeholder from the chapter summary.`,
          "warn",
        );
      }
      const slides =
        rawSlides.length > 0
          ? rawSlides.map((s, _j) => {
              if (typeof s !== "object" || s === null) {
                return {
                  title: title,
                  intent: outlineChapter.summary || "",
                  visualBeat: "continuation",
                  energy: "medium",
                  contrast: "moderate",
                  relationship: "continue",
                };
              }
              return {
                title: typeof s.title === "string" ? s.title : title,
                intent: typeof s.intent === "string" ? s.intent : outlineChapter.summary || "",
                visualBeat: typeof s.visualBeat === "string" ? s.visualBeat : "continuation",
                energy: typeof s.energy === "string" ? s.energy : "medium",
                contrast: typeof s.contrast === "string" ? s.contrast : "moderate",
                relationship: typeof s.relationship === "string" ? s.relationship : "continue",
                ...parseImageQuery(s.imageQuery, keptImageSrcs, onLog),
              };
            })
          : [
              {
                title,
                intent: outlineChapter.summary || "",
                visualBeat: "continuation",
                energy: "medium",
                contrast: "moderate",
                relationship: "continue",
              },
            ];
      return { title, slides };
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

    const deckSummary = buildDeckSummary(context, false, true);
    const sourceCount = splitSlidesForAi(context, "generate").length;

    const mode = operation.opts?.mode || "remix";
    const creativeGuidance = getFragment("creative-guidance.md").trim();

    const preserveVisualIdentity = operation.opts?.preserveVisualIdentity ?? true;
    const visualIdentityGuidance = buildRemixVisualIdentityGuidance(preserveVisualIdentity);

    // Flow-specific restructuring priorities for the plan phase. Empty when
    // the flow is unknown or absent, so plan prompting stays flow-blind for
    // callers that do not supply a flow (the execute phase already applies
    // flow guidance via the generate options suffix).
    const flowGuidance = buildRemixFlowGuidance(operation.opts?.flow);

    const composeArgs = {
      markdown: deckSummary,
      flowGuidance,
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
      if (entry.action === "polish") {
        onLog?.(`[Plan] Polish slide ${sourceLabel}: ${entry.title}`);
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
   * Uses the shared robust JSON extractor (string-aware brace tracking).
   * @param {string} text
   * @returns {Array<object>}
   */
  #parsePlanResponse(text) {
    if (!text || typeof text !== "string") return [];

    const extracted = extractJsonObject(text, "plan");
    if (!extracted) {
      throw new Error("Plan response did not contain valid JSON");
    }
    const parsed = extracted.parsed;

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
    const validActions = new Set(["polish", "rewrite", "merge"]);
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

      const normalized = [];
      for (const idx of entry.source) {
        if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0) {
          errors.push(`${prefix}: source index ${idx} is not a valid non-negative integer`);
        } else if (sourceCount === 0) {
          errors.push(`${prefix}: source index ${idx} out of range (no source slides)`);
        } else if (idx === sourceCount) {
          // Treat an index exactly one past the last valid index as a 1-based
          // off-by-one mistake: clamp to the last slide and continue. Larger
          // out-of-range values are still rejected below.
          normalized.push(sourceCount - 1);
          coveredSources.add(sourceCount - 1);
        } else if (idx > sourceCount) {
          errors.push(`${prefix}: source index ${idx} out of range (0-${sourceCount - 1})`);
        } else {
          normalized.push(idx);
          coveredSources.add(idx);
        }
      }

      // Detect duplicates within this entry (e.g. an off-by-one clamp that
      // collapsed two distinct indices to the same slide). Duplicates in a
      // merge would paste the same slide twice; in a polish/rewrite they are
      // equally nonsensical.
      const unique = new Set(normalized);
      if (unique.size !== normalized.length) {
        errors.push(
          `${prefix}: source contains duplicate indices after normalization: [${normalized.join(", ")}]`,
        );
      }
      entry.source = normalized;

      if ((entry.action === "rewrite" || entry.action === "polish") && entry.source.length !== 1) {
        errors.push(
          `${prefix}: ${entry.action} must have exactly 1 source, got ${entry.source.length}`,
        );
      }

      if (entry.action === "merge" && entry.source.length !== 2) {
        errors.push(`${prefix}: merge must have exactly 2 sources, got ${entry.source.length}`);
      }

      if (!entry.brief || entry.brief.trim().length === 0) {
        errors.push(`${prefix}: brief is required for action "${entry.action}"`);
      }

      // `reason` explains why this action was chosen. Optional — the prompt
      // asks for it, but less compliant models may omit it. Coerce non-string
      // values to string; if missing/empty, the sidebar simply omits the
      // rationale line. Don't hard-fail the plan over a display-only field.
      if (entry.reason != null) {
        if (typeof entry.reason !== "string") {
          entry.reason = String(entry.reason);
        }
        if (entry.reason.trim().length === 0) {
          delete entry.reason;
        }
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
   * Each entry gets its brief embedded as an HTML comment.
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
   * Also returns the per-rewrite-entry processed source slides (post
   * keepImages filtering) so callers building the preserve-mode identity
   * backstop don't need to re-split and re-filter the deck themselves —
   * re-running `splitSlidesForAi` once per source slide of every entry would
   * make deck re-parsing cost grow with the square of the deck size, and
   * re-filtering separately would let the two computations drift apart.
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
   * @returns {{ markdown: string, processedSourcesByEntry: string[][] }} —
   *   `processedSourcesByEntry` covers all entries, in the same
   *   order as they appear in `plan`.
   */
  #planToVirtualDeck(plan, sourceMarkdown, slideImages = null) {
    // Use the fence-aware split so `---` inside code blocks doesn't create
    // phantom slides and misalign source indices with the plan. Split once
    // for the whole deck instead of once per source slide of every entry.
    const sourceSlides = splitSlidesForAi(sourceMarkdown, "generate");
    const processedSourcesByEntry = [];

    const virtualSlides = plan.map((entry) => {
      // Apply keepImages filtering: strip images not in the keep list from
      // each source slide before joining.
      const processedSources = entry.source.map((idx) => {
        const slide = sourceSlides[idx];
        const sentImages = slideImages?.[idx];
        if (!sentImages || !entry.keepImages || !Array.isArray(entry.keepImages)) return slide;
        return filterImagesByKeepIndices(slide, entry.keepImages, sentImages);
      });
      processedSourcesByEntry.push(processedSources.filter(Boolean));

      // Join source slides with a merge marker (not ---) so splitSlidesForAi
      // treats the whole entry as one virtual slide.
      const sourceContent = processedSources.join("\n\n<!-- merge source -->\n\n");
      return `<!-- brief: ${entry.brief} -->\n${sourceContent}`;
    });

    return { markdown: virtualSlides.join("\n\n---\n\n"), processedSourcesByEntry };
  }
}

/**
 * Parse a breakdown slide's `imageQuery` and keep it only when it is a
 * `reuse:<path>` reference whose path is in `keptImageSrcs`. A hallucinated
 * `reuse:` path must not reach the virtual deck, where the execute-phase
 * validator would otherwise trust it merely because it appears in the brief
 * (onlyExplicitImageSources closes that gap at validation time, but filtering
 * here is defense in depth and keeps the brief itself honest).
 *
 * Non-`reuse:` imageQuery values (free-text search queries) are dropped
 * entirely: reimagine only has kept source images to offer (no image search
 * is wired up), so a free-text query cannot be satisfied and would only
 * nudge the generate AI to invent a picture. onlyExplicitImageSources +
 * the final strip would then delete that invented image, leaving an empty
 * media area — dropping the query here avoids that dead end up front.
 *
 * @param {unknown} imageQuery
 * @param {string[]} keptImageSrcs
 * @param {(msg: string, level?: string) => void} [onLog]
 * @returns {{imageQuery?: string}}
 */
function parseImageQuery(imageQuery, keptImageSrcs, onLog) {
  if (typeof imageQuery !== "string") return {};
  const q = imageQuery.trim();
  if (!q) return {};
  if (!q.startsWith("reuse:")) {
    onLog?.(
      `Breakdown imageQuery "${q}" is not a reuse:<path> reference — dropping it (no image search is available).`,
      "warn",
    );
    return {};
  }
  const path = q.slice("reuse:".length).trim();
  // Normalized comparison so a `reuse:./images/a.png` brief whose kept set
  // lists `images/a.png` is not falsely rejected — consistent with
  // `_checkImageSources` and `stripFabricatedImages`.
  const normalizedKept = keptImageSrcs.map(normalizeImageSrc);
  if (normalizedKept.includes(normalizeImageSrc(path))) return { imageQuery: q };
  onLog?.(
    `Breakdown imageQuery "${q}" references an image not in the kept set — dropping it.`,
    "warn",
  );
  return {};
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
  const images = parseAllImagesOutsideFences(slideMarkdown);
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
 * Deterministic preserve-mode identity enforcement for a single generated slide.
 *
 * After the execute phase the model may have dropped, altered, or invented
 * `theme:`/`background:` directives. This helper overwrites those directives
 * with the source slide's identity so the final deck always carries the
 * original visual identity in preserve mode.
 *
 * Rules:
 * - For `theme:`, always use the first source value. If the source has no
 *   theme, any model-emitted theme is stripped.
 * - For `background:`, rebuild a single combined layer from the first source
 *   color and the first source image URL. If the source has no background,
 *   any model-emitted background is stripped.
 * - Strip all model-emitted `theme:`/`background:` lines from the leading
 *   directive block before inserting the source values. Without this, the
 *   renderer's last-directive-wins behavior (MarkdownParser.extractDirective
 *   keeps the last match) would leave duplicate directive lines.
 * - Insert the directives after the existing `layout:` line (or prepend at
 *   the top when there is no layout directive). Fence-aware so a literal
 *   `theme:` inside a code block is not mistaken for a directive.
 *
 * @param {string} slideMarkdown — the generated slide
 * @param {string[]} sourceSlides — the virtual source slides for this entry
 * @param {(msg: string, level?: string) => void} [onLog]
 * @returns {string} the slide with source identity applied
 */

/**
 * True for CSS color values that are a solid fill — hex, rgb/rgba/hsl/hsla,
 * named color, `transparent`, `currentColor`. Gradients and images are not
 * solid colors and must be their own background layer.
 * @param {string} value
 * @returns {boolean}
 */
function isSolidColor(value) {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  if (/^#/.test(v)) return true;
  if (/^(rgb|rgba|hsl|hsla|hwb|lab|lch|color)\(/.test(v)) return true;
  if (/^(transparent|currentColor|none)$/.test(v)) return true;
  if (/^[a-z]+$/.test(v) && v.length > 1) return true;
  return false;
}

function applyPreservedIdentity(slideMarkdown, sourceSlides, onLog) {
  if (!sourceSlides || sourceSlides.length === 0) return slideMarkdown;

  const normalize = (v) => v.trim().toLowerCase();

  // Collect source identity values (color/theme) and image background urls.
  // A single background layer can mix a color with an image (e.g.
  // `#fff url(hero.png)`) — splitBackgroundValue separates the two so a
  // color riding alongside a legitimate image is still tracked, instead of
  // the whole value being treated as pure image content merely because it
  // contains `url(`.
  const sourceThemes = [];
  const sourceColorBackgrounds = [];
  const sourceBackgroundImageUrls = [];
  const sourceInlineImageUrls = [];
  for (const src of sourceSlides) {
    for (const v of extractTopLevelDirectiveValues(src, "theme")) {
      if (v.trim()) sourceThemes.push(v);
    }
    for (const v of extractTopLevelDirectiveValues(src, "background")) {
      if (!v.trim()) continue;
      const { colorPart, imagePart, hasImage } = splitBackgroundValue(v);
      if (colorPart) sourceColorBackgrounds.push(colorPart);
      if (hasImage) {
        for (const m of imagePart.matchAll(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/gi)) {
          sourceBackgroundImageUrls.push(m[1]);
        }
      }
    }
    for (const img of parseAllImagesOutsideFences(src)) {
      sourceInlineImageUrls.push(img.src);
    }
  }
  const allSourceImageUrls = new Set([...sourceInlineImageUrls, ...sourceBackgroundImageUrls]);

  const outputThemes = extractTopLevelDirectiveValues(slideMarkdown, "theme").map(normalize);
  const outputBackgrounds = extractTopLevelDirectiveValues(slideMarkdown, "background");
  const outputBackgroundImageParts = [];
  for (const v of outputBackgrounds) {
    const { imagePart, hasImage } = splitBackgroundValue(v);
    if (hasImage) outputBackgroundImageParts.push(imagePart);
  }

  const toRestore = [];

  // Theme: always use the first source theme. If the source has no theme,
  // any model-emitted theme is stripped and nothing is restored.
  if (sourceThemes.length > 0) {
    const theme = sourceThemes[0];
    toRestore.push(`theme: ${theme}`);
    if (outputThemes.length > 0 && !outputThemes.includes(normalize(theme))) {
      onLog?.(`Restore: replacing model theme with source theme: ${theme}`, "warn");
    }
  } else if (outputThemes.length > 0) {
    onLog?.("Restore: stripping model-invented theme", "warn");
  }

  // Background: rebuild a single `background:` directive from the source.
  // The model may legitimately convert an inline source image into a
  // full-bleed background, so any output background image that references a
  // source image is kept. Otherwise the first source background image is
  // restored. If the source has no background image, no image is forced into
  // the background. Colors/gradients from the source are always used.
  const colorForLine = sourceColorBackgrounds.length > 0 ? sourceColorBackgrounds[0] : "";

  let imageForLine = "";
  for (const part of outputBackgroundImageParts) {
    const urls = [...part.matchAll(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/gi)].map((m) => m[1]);
    if (urls.length > 0 && urls.every((u) => allSourceImageUrls.has(u))) {
      imageForLine = part;
      break;
    }
  }
  if (!imageForLine && sourceBackgroundImageUrls.length > 0) {
    imageForLine = `url(${sourceBackgroundImageUrls[0]}) center/cover`;
  }

  const hasSourceBackground =
    sourceColorBackgrounds.length > 0 || sourceBackgroundImageUrls.length > 0;
  const hasKeptBackgroundImage = imageForLine.length > 0;

  // A solid color (hex, rgb/hsl, named color) can share a single layer with
  // an image (`url(image) #000`). Gradients and images must be separate layers
  // (`linear-gradient(...), url(image)`). Put the image first when the color
  // is solid so the image is painted on top of the color, not hidden behind it.
  const restoredBackground = isSolidColor(colorForLine)
    ? [imageForLine, colorForLine].filter(Boolean).join(imageForLine ? " " : ", ")
    : [colorForLine, imageForLine].filter(Boolean).join(", ");

  if (hasSourceBackground || hasKeptBackgroundImage) {
    toRestore.push(`background: ${restoredBackground}`);
    if (sourceBackgroundImageUrls.length > 1) {
      for (const extra of sourceBackgroundImageUrls.slice(1)) {
        onLog?.(
          `Restore: dropping extra source image background from merged slide (only one center/cover image is visible): ${extra}`,
          "warn",
        );
      }
    }
    if (
      outputBackgrounds.length > 0 &&
      normalize(outputBackgrounds.join(", ")) !== normalize(restoredBackground)
    ) {
      onLog?.(
        `Restore: replacing model background with source background: ${restoredBackground}`,
        "warn",
      );
    }
  } else if (outputBackgrounds.length > 0) {
    onLog?.("Restore: stripping model-invented background", "warn");
  }

  // Strip any model-emitted theme:/background: from the leading directive
  // block before inserting the deterministic source values. Without this,
  // the renderer's last-directive-wins behavior (MarkdownParser.extractDirective
  // keeps the last match) would leave duplicate directive lines in the markdown.
  let lines = slideMarkdown.split("\n");
  lines = stripLeadingDirectives(lines, ["theme", "background"]);
  const stripped = lines.join("\n");
  const fences = findFencedRanges(stripped);
  const inFenceAt = (offset) => fences.some((r) => offset >= r.start && offset < r.end);
  let insertAt = 0;
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inFenceAt(offset) && /^\s*layout\s*:/i.test(line)) {
      insertAt = i + 1;
      break;
    }
    offset += line.length + 1;
  }
  lines.splice(insertAt, 0, ...toRestore);
  return lines.join("\n");
}

/**
 * Collapse multiple top-level `background:` directives in a slide's leading
 * block into a single CSS multi-layer directive.
 *
 * The slide renderer (MarkdownParser.extractDirective) keeps only the LAST
 * `background:` directive — so when the AI (or an earlier restore pass) emits
 * the color/gradient and the image as separate `background:` lines, the
 * overlay is silently dropped and text over a raw photo becomes unreadable.
 * Combining the layers into one directive lets CSS render them all.
 *
 * Fence-aware: a literal `background:` inside a code block is left untouched.
 * Single-directive slides are returned unchanged.
 *
 * @param {string} markdown
 * @returns {string}
 */
function collapseBackgroundDirectives(markdown) {
  const lines = markdown.split("\n");
  const anyDirective = /^\s*[a-zA-Z][\w-]*\s*:/i;
  const fences = findFencedRanges(markdown);
  const inFenceAt = (offset) => fences.some((r) => offset >= r.start && offset < r.end);

  // Collect indices of top-level background: lines in the leading block.
  const bgIndices = [];
  let inLeadingBlock = true;
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = offset;
    const lineEnd = offset + line.length + 1;
    offset = lineEnd;

    if (inFenceAt(lineStart)) {
      inLeadingBlock = false;
      continue;
    }

    if (inLeadingBlock) {
      if (line.match(/^\s*(```+|~~~+)/)) {
        inLeadingBlock = false;
        continue;
      }
      if (line.trim() === "") continue;
      if (/^\s*background\s*:/i.test(line)) {
        bgIndices.push(i);
        continue;
      }
      if (anyDirective.test(line)) continue;
      inLeadingBlock = false;
    }
  }
  if (bgIndices.length <= 1) return markdown;

  // Combine the multiple background directives into a single CSS multi-layer
  // directive, keeping each layer's original value intact. Do not re-split
  // color and image parts: a single layer that mixes a solid color with an
  // image (e.g. `#000 url(images/hero.png)`) must stay in one layer.
  const layers = [];
  for (const idx of bgIndices) {
    layers.push(lines[idx].replace(/^\s*background\s*:\s*/i, "").trim());
  }
  if (layers.length === 0) return markdown;

  lines[bgIndices[0]] = `background: ${layers.join(", ")}`;
  for (let j = bgIndices.length - 1; j >= 1; j--) {
    lines.splice(bgIndices[j], 1);
  }
  return lines.join("\n");
}

/**
 * Mechanical backstop behind FABRICATED_IMAGE_SRC: remove `<img>` tags and
 * `background: url(...)` directives whose srcs are not in the allowed set.
 * Validation only drives the repair loop and accepts the last response after
 * two attempts, so without this a persistent model's broken image reference
 * would still land in the final deck.
 *
 * Fence-aware and multiline-safe: fenced code blocks are untouched (code
 * samples may illustrate `<img>` tags, including multiline HTML), and
 * multiline `<img>` tags outside fences are removed as a single range. A
 * `background:` directive is dropped only when it references at least one
 * disallowed image url; allowed image backgrounds are kept by stripVisualIdentity
 * or, in preserve mode, are legitimate identity.
 *
 * No blank-line collapse is applied — unlike directive stripping, removals
 * here leave ordinary blank lines that are harmless in markdown, and a global
 * collapse would reformat blank runs inside fences.
 *
 * Src comparison is normalized (leading `./` stripped, percent-encoding
 * decoded) rather than literal: `allowedSrcs` is built from exact source
 * strings (`collectImageSources` in ai-output-validator), so a model that
 * reuses a real deck image
 * but writes it slightly differently — `./images/a.png` vs `images/a.png`,
 * or a URL-encoded space — would otherwise fail the literal comparison, get
 * flagged as FABRICATED_IMAGE_SRC by validation, survive the repair loop's
 * two-attempt cap, and then have this backstop silently delete it, leaving a
 * media area or `full-image` slide with no visual.
 *
 * @param {string} markdown
 * @param {string[]} allowedSrcs — srcs the deck may reference (rewritten +
 *   kept sources for remix, kept image paths for reimagine)
 * @param {(msg: string, level?: string) => void} [onLog] — logs each removed
 *   image/background so a silently emptied media area is not a silent
 *   failure mode.
 * @returns {string}
 */
function stripFabricatedImages(markdown, allowedSrcs, onLog) {
  const allowed = new Set(allowedSrcs.map(normalizeImageSrc));
  // Collect removal ranges (byte offsets into the markdown) in document
  // order, then apply them in reverse so earlier offsets don't shift.
  const removals = [];

  // Multiline <img> and markdown images outside fences.
  for (const img of parseAllImagesOutsideFences(markdown)) {
    if (!allowed.has(normalizeImageSrc(img.src))) {
      removals.push({ start: img.start, end: img.end });
      onLog?.(`Removing fabricated image reference not in the allowed set: ${img.src}`, "warn");
    }
  }

  // background: url(...) directives outside fences. A directive line is
  // dropped entirely when it references at least one disallowed url; mixed
  // layers with any disallowed url are dropped too (the validator already
  // flagged them, so the backstop mirrors that strictness).
  const lines = markdown.split("\n");
  const fences = findFencedRanges(markdown);
  const inFenceAt = (offset) => fences.some((r) => offset >= r.start && offset < r.end);
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = offset;
    const lineEnd = offset + line.length + (i < lines.length - 1 ? 1 : 0);
    if (!inFenceAt(lineStart)) {
      const bgMatch = line.match(/^\s*background\s*:\s*(.+)$/i);
      if (bgMatch) {
        const urls = [...bgMatch[1].matchAll(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/gi)].map(
          (m) => m[1],
        );
        const disallowed = urls.filter((u) => !allowed.has(normalizeImageSrc(u)));
        if (disallowed.length > 0) {
          removals.push({ start: lineStart, end: lineEnd });
          onLog?.(
            `Removing background referencing fabricated image(s) not in the allowed set: ${disallowed.join(", ")}`,
            "warn",
          );
        }
      }
    }
    offset = lineEnd;
  }

  if (removals.length === 0) return markdown;
  removals.sort((a, b) => a.start - b.start);
  let result = markdown;
  for (let i = removals.length - 1; i >= 0; i--) {
    const { start, end } = removals[i];
    result = result.slice(0, start) + result.slice(end);
  }
  return result.trim();
}
