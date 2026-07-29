/**
 * AiSidebar
 *
 * Non-blocking sidebar panel for AI processing.
 * Streams batches of slides at a time, rendering them live into the deck
 * with truncation detection and snapshot-based revert on error/cancellation.
 */

import { SettingsModal } from "./settings-modal.js";

const P = "ai-sidebar__";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const BATCH_SIZE = 5;

/**
 * Deep-clone a slides array for snapshot/revert.
 * @param {Array} slides
 * @returns {Array}
 */
function cloneSlides(slides) {
  return slides.map((s) => ({
    ...s,
    areas: { ...(s.areas || {}) },
  }));
}

/**
 * Restore the deck from a snapshot.
 * @param {object} deckController
 * @param {Array} snapshotSlides
 * @param {number} snapshotIndex
 */
function restoreDeck(deckController, snapshotSlides, snapshotIndex) {
  deckController.deck.slides = cloneSlides(snapshotSlides);
  const container = deckController.elements.slidesContainer;
  container.innerHTML = "";
  snapshotSlides.forEach((s, i) => {
    const el = window.SlideRenderer.createSlideElement(
      deckController.deck,
      s,
      i,
      i === snapshotIndex,
    );
    container.appendChild(el);
  });
  deckController.slideNavigator.goTo(snapshotIndex, { broadcast: false });
  deckController.dispatchEvent("deckchange", { deck: deckController.deck });
}

/**
 * Convert an AI JSON slide to a normalized slide object for the deck.
 * @param {object} aiSlide - { layout, content, background, theme }
 * @param {number} index
 * @returns {object}
 */
function normalizeAiSlide(aiSlide, index) {
  const { areas } = window.MarkdownParser.parseAreas(aiSlide.content);
  return {
    id: `ai-slide-${Date.now()}-${index}`,
    title: "",
    notes: "",
    layout: aiSlide.layout || "header-content",
    background: aiSlide.background || "",
    theme: aiSlide.theme || "",
    areas,
  };
}

/**
 * Add a single slide to the live deck.
 * @param {object} deckController
 * @param {object} normalizedSlide
 * @param {number} insertIndex
 * @param {boolean} isActive
 */
function addSlideToDeck(deckController, normalizedSlide, insertIndex, isActive) {
  deckController.deck.slides.splice(insertIndex, 0, normalizedSlide);
  const container = deckController.elements.slidesContainer;
  const el = window.SlideRenderer.createSlideElement(
    deckController.deck,
    normalizedSlide,
    insertIndex,
    isActive,
  );
  // Insert at the correct position among existing slide elements
  const existingSlides = container.querySelectorAll(".slide");
  const anchor = existingSlides[insertIndex];
  if (anchor) {
    container.insertBefore(el, anchor);
  } else {
    container.appendChild(el);
  }
  window.ContentEnhancer.enhanceRenderedContent(el).catch(() => {});
}

export class AiSidebar {
  static _currentPanel = null;
  static _abortController = null;
  static _minimized = false;
  /** @type {Symbol|null} Tracks the current show() call to prevent cross-call resolver leaks. */
  static _showId = null;

  static cancel() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  }

  static close() {
    this.cancel();
    this._showId = null;
    if (this._finishResolve) {
      this._finishResolve();
      this._finishResolve = null;
    }
    if (this._currentPanel) {
      this._currentPanel.remove();
      this._currentPanel = null;
      this._minimized = false;
    }
  }

  /**
   * Stream a single batch from the API and return the accumulated text.
   * @param {{ model: string, messages: Array, max_tokens: number, reasoning?: object }} body
   * @param {HTMLElement} statusEl
   * @param {HTMLElement} outputEl
   * @param {AbortSignal} signal
   * @returns {Promise<{ contentText: string, finishReason: string|null }>}
   */
  static async #streamBatch(body, statusEl, outputEl, signal) {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SettingsModal.getApiKey()}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`API error ${res.status}: ${errorText.slice(0, 200)}`);
    }

    statusEl.textContent = "AI is working\u2026";

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let contentText = "";
    let reasoningText = "";
    let buffer = "";
    let streamDone = false;
    let finishReason = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") {
          streamDone = true;
          break;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          finishReason = parsed.choices?.[0]?.finish_reason || finishReason;
          if (!delta) continue;

          // Collect reasoning tokens separately (for display only)
          const reasoningDelta = delta.reasoning || delta.reasoning_details?.[0]?.text || "";
          if (reasoningDelta) {
            reasoningText += reasoningDelta;
            // Show reasoning in sidebar while thinking (before content arrives)
            if (!contentText) {
              outputEl.textContent = reasoningText;
              outputEl.scrollTop = outputEl.scrollHeight;
              statusEl.textContent = "Thinking\u2026";
            }
          }

          // Collect content tokens (actual JSON output)
          if (delta.content) {
            contentText += delta.content;
            // Show reasoning + content in the output panel
            const display = reasoningText ? reasoningText + "\n\n" + contentText : contentText;
            outputEl.textContent = display;
            outputEl.scrollTop = outputEl.scrollHeight;
          }
        } catch {
          // skip malformed JSON
        }
      }
      if (streamDone) break;
    }

    return { contentText, finishReason };
  }

  /**
   * Show the AI sidebar and stream the response in batches.
   * If a deckController is provided, slides are rendered live into the deck.
   * @param {string} markdown - The markdown to enhance.
   * @param {"fix"|"generate"} mode - Enhancement mode.
   * @param {object} [deckController] - Optional deck controller for live rendering.
   * @returns {Promise<string|null>} Enhanced markdown, or null if cancelled/failed.
   */
  static async show(markdown, mode, deckController) {
    // Clean up any existing panel before starting a new one
    this.cancel();
    this.close();
    const myShowId = Symbol();
    this._showId = myShowId;

    const panel = this.#createPanel(mode);
    document.body.appendChild(panel);
    this._currentPanel = panel;

    const outputEl = panel.querySelector(`.${P}output`);
    const statusEl = panel.querySelector(`.${P}status`);
    const noticeEl = panel.querySelector(`.${P}notice`);
    const cancelBtn = panel.querySelector('[data-action="cancel"]');
    const closeBtn = panel.querySelector('[data-action="close"]');
    const minimizeBtn = panel.querySelector('[data-action="minimize"]');
    const seeResultBtn = panel.querySelector('[data-action="see-result"]');
    const keepBtn = panel.querySelector('[data-action="keep"]');
    const revertBtn = panel.querySelector('[data-action="revert"]');

    let cancelled = false;
    let result = null;

    // Snapshot for revert on error/cancellation
    let snapshotSlides = null;
    let snapshotIndex = 0;
    if (deckController) {
      snapshotSlides = cloneSlides(deckController.deck.slides);
      snapshotIndex = deckController.slideNavigator.currentIndex;
    }

    // Helper: revert deck to snapshot
    const revertDeck = () => {
      if (deckController && snapshotSlides) {
        restoreDeck(deckController, snapshotSlides, snapshotIndex);
      }
    };

    // Helper: show error state with close button
    const showError = (msg) => {
      revertDeck();
      statusEl.textContent = msg;
      statusEl.className = `${P}status ${P}status--error`;
      noticeEl.hidden = true;
      cancelBtn.hidden = true;
      keepBtn.hidden = true;
      revertBtn.hidden = true;
      closeBtn.hidden = false;
      closeBtn.textContent = "Close";
      outputEl.style.overflowY = "";
      panel.removeEventListener("wheel", preventWheel);
    };

    // Helper: show cancel confirmation (keep / revert)
    const showCancelConfirm = () => {
      if (!deckController || allSlides.length === 0) {
        // No slides were added, just close
        revertDeck();
        this.close();
        return;
      }
      statusEl.textContent = `Keep ${allSlides.length} processed slides?`;
      statusEl.className = `${P}status`;
      noticeEl.hidden = true;
      cancelBtn.hidden = true;
      outputEl.style.overflowY = "";
      panel.removeEventListener("wheel", preventWheel);
      keepBtn.hidden = false;
      revertBtn.hidden = false;
    };

    cancelBtn.addEventListener("click", () => {
      cancelled = true;
      this.cancel();
    });

    const finish = () => {
      // Only resolve if this is still the active show() call
      if (this._showId === myShowId) {
        this._finishResolve?.();
      }
    };

    closeBtn.addEventListener("click", finish);
    seeResultBtn.addEventListener("click", finish);

    keepBtn.addEventListener("click", () => {
      // Keep partial slides, apply as result
      if (deckController && allSlides.length > 0) {
        const { extractDirectives, fixSlideLayouts, slidesToMarkdown } =
          window._aiEnhancerCache || {};
        if (extractDirectives && fixSlideLayouts && slidesToMarkdown) {
          const origDirectives = extractDirectives(markdown);
          const fixedSlides = fixSlideLayouts(allSlides, origDirectives, mode);
          result = slidesToMarkdown(fixedSlides);
        }
      }
      finish();
    });

    revertBtn.addEventListener("click", () => {
      revertDeck();
      allSlides = [];
      this.close();
    });

    minimizeBtn.addEventListener("click", () => {
      this._minimized = !this._minimized;
      panel.classList.toggle(`${P}panel--minimized`, this._minimized);
      minimizeBtn.textContent = this._minimized ? "+" : "\u2212";
    });

    let preventWheel = (e) => e.preventDefault();
    let allSlides = [];

    try {
      const apiKey = SettingsModal.getApiKey();
      const model = SettingsModal.getModel();

      if (!apiKey) {
        statusEl.textContent = "No API key \u2014 open Settings to configure";
        statusEl.className = `${P}status ${P}status--error`;
        noticeEl.hidden = true;
        closeBtn.hidden = false;
        closeBtn.textContent = "Close";
        cancelBtn.hidden = true;
        keepBtn.hidden = true;
        revertBtn.hidden = true;
        return null;
      }

      statusEl.textContent = "Preparing\u2026";
      const {
        buildBatchMessages,
        estimateMaxTokens,
        parseAiResponse,
        slidesToMarkdown,
        extractDirectives,
        fixSlideLayouts,
      } = await import("../data/ai-enhancer.js");

      // Cache for keep button handler
      window._aiEnhancerCache = { extractDirectives, fixSlideLayouts, slidesToMarkdown };

      // Load rendering dependencies if deckController provided
      if (deckController) {
        const { SlideRenderer } = await import("../renderer/slide-renderer.js");
        const { ContentEnhancer } = await import("../renderer/content-enhancer.js");
        const { MarkdownParser } = await import("../data/markdown-parser.js");
        window.SlideRenderer = SlideRenderer;
        window.ContentEnhancer = ContentEnhancer;
        window.MarkdownParser = MarkdownParser;
      }

      const totalSlides = markdown.split(/\n---\n/).length;
      const maxTokens = estimateMaxTokens(markdown, mode);
      statusEl.textContent = `Processing ${totalSlides} slides in batches of ${BATCH_SIZE}\u2026`;

      this._abortController = new AbortController();
      const signal = this._abortController.signal;

      // Only enable reasoning for "generate" mode — fix mode should be quick and conservative
      const useReasoning = mode === "generate" && SettingsModal.getReasoning();
      const effort = SettingsModal.getEffort();

      let startIdx = 0;

      // Disable scrolling during streaming — prevents scrollbar jumping
      // and stops wheel events from bubbling up to the slide navigator
      outputEl.style.overflowY = "hidden";
      panel.addEventListener("wheel", preventWheel, { passive: false });

      let deckCleared = false;

      while (startIdx < totalSlides) {
        if (cancelled) break;

        const { system, user } = buildBatchMessages(
          markdown,
          mode,
          startIdx,
          BATCH_SIZE,
          totalSlides,
        );

        const body = {
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          max_tokens: maxTokens,
          stream: true,
          response_format: { type: "json_object" },
        };
        if (useReasoning) {
          body.reasoning = { effort };
        }

        statusEl.textContent = `Batch ${Math.floor(startIdx / BATCH_SIZE) + 1}\u2026 (${allSlides.length}/${totalSlides} slides done)`;

        const { contentText, finishReason } = await this.#streamBatch(
          body,
          statusEl,
          outputEl,
          signal,
        );

        if (cancelled) break;

        // Detect truncation
        if (finishReason === "length") {
          showError(
            "Response truncated \u2014 deck too large for AI. Try fix mode or reduce slides.",
          );
          await new Promise((resolve) => {
            closeBtn.addEventListener("click", resolve, { once: true });
          });
          if (this._showId === myShowId) {
            this._currentPanel = null;
            this._showId = null;
          }
          panel.remove();
          return null;
        }

        const parsed = parseAiResponse(contentText);
        if (!parsed || !parsed.slides.length) {
          // AI signaled done (empty slides) or invalid response
          break;
        }

        // Clear existing slides only after the first batch is ready to render
        if (deckController && !deckCleared) {
          deckController.deck.slides = [];
          deckController.elements.slidesContainer.innerHTML = "";
          deckCleared = true;
        }

        // Apply fixSlideLayouts to this batch
        const origDirectives = extractDirectives(markdown);
        const fixedBatch = fixSlideLayouts(parsed.slides, origDirectives, mode);

        // Add each slide to the deck live
        if (deckController) {
          for (let i = 0; i < fixedBatch.length; i++) {
            const normalized = normalizeAiSlide(fixedBatch[i], startIdx + i);
            const isActive = allSlides.length === 0 && i === 0;
            addSlideToDeck(deckController, normalized, allSlides.length, isActive);
          }
          // Navigate to first slide of this batch
          const batchStart = allSlides.length - fixedBatch.length + fixedBatch.length - 1;
          deckController.slideNavigator.goTo(Math.max(0, batchStart));
          // Refresh thumbnails
          deckController.dispatchEvent("deckchange", { deck: deckController.deck });
        }

        allSlides.push(...fixedBatch);
        statusEl.textContent = `Processed ${allSlides.length}/${totalSlides} slides\u2026`;

        startIdx += BATCH_SIZE;
      }

      // Re-enable scrolling now that streaming is done
      outputEl.style.overflowY = "";
      panel.removeEventListener("wheel", preventWheel);

      if (cancelled) {
        showCancelConfirm();
        // Wait for keep/revert decision
        await new Promise((resolve) => {
          this._finishResolve = resolve;
        });
        if (this._showId === myShowId) {
          this._currentPanel = null;
        }
        panel.remove();
        return result;
      }

      if (allSlides.length === 0) {
        showError("Error: AI did not return valid JSON");
        await new Promise((resolve) => {
          closeBtn.addEventListener("click", resolve, { once: true });
        });
        if (this._showId === myShowId) {
          this._currentPanel = null;
          this._showId = null;
        }
        panel.remove();
        return null;
      }

      // If no deckController, build result markdown the old way
      if (!deckController) {
        result = slidesToMarkdown(allSlides);
      } else {
        // Slides are already in the deck — result is the final markdown for localStorage
        result = slidesToMarkdown(allSlides);
      }

      statusEl.textContent = 'Done! Click "See result" to apply.';
      statusEl.className = `${P}status ${P}status--done`;
      noticeEl.hidden = true;
      cancelBtn.hidden = true;
      keepBtn.hidden = true;
      revertBtn.hidden = true;
      closeBtn.hidden = false;
      closeBtn.textContent = "See result";
      seeResultBtn.hidden = false;
      panel.classList.add(`${P}panel--done`);
    } catch (err) {
      if (err.name === "AbortError") {
        revertDeck();
        this.close();
        return null;
      }
      showError(`Error: ${err.message}`);
    }

    await new Promise((resolve) => {
      this._finishResolve = resolve;
    });

    if (this._showId === myShowId) {
      this._currentPanel = null;
    }
    panel.remove();
    return result;
  }

  static #createPanel(mode) {
    const panel = document.createElement("div");
    panel.className = P + "panel";
    const title = mode === "fix" ? "AI: Fix Issues" : "AI: Inspired Deck";
    panel.innerHTML = `
      <div class="${P}header">
        <span class="${P}title">${title}</span>
        <div class="${P}header-right">
          <button type="button" data-action="see-result" class="${P}btn ${P}btn--see-result" hidden>See result</button>
          <button type="button" data-action="minimize" class="${P}icon-btn" title="Minimize">\u2212</button>
        </div>
      </div>
      <div class="${P}status">Starting\u2026</div>
      <div class="${P}notice">AI result not yet applied \u2014 click "See result" when done.</div>
      <div class="${P}output"></div>
      <div class="${P}actions">
        <button type="button" data-action="cancel" class="${P}btn">Cancel</button>
        <button type="button" data-action="keep" class="${P}btn ${P}btn--primary" hidden>Keep slides</button>
        <button type="button" data-action="revert" class="${P}btn" hidden>Revert</button>
        <button type="button" data-action="close" class="${P}btn ${P}btn--primary" hidden>Close</button>
      </div>
    `;
    return panel;
  }
}
