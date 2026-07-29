/**
 * AiSidebar
 *
 * Non-blocking sidebar panel for AI processing.
 * Streams batches of slides at a time with truncation detection.
 *
 * Fix mode: slides are updated live in the deck as each batch arrives.
 * Generate mode: batches are collected, then applied all at once.
 */

import { SettingsModal } from "./settings-modal.js";

const P = "ai-sidebar__";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const BATCH_SIZE = 10;

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
            if (!contentText) {
              outputEl.textContent = reasoningText;
              outputEl.scrollTop = outputEl.scrollHeight;
              statusEl.textContent = "Thinking\u2026";
            }
          }

          // Collect content tokens (actual JSON output)
          if (delta.content) {
            contentText += delta.content;
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
   * @param {string} markdown - The markdown to enhance.
   * @param {"fix"|"generate"} mode - Enhancement mode.
   * @param {object} [deckController] - Deck controller (only used in fix mode for live updates).
   * @returns {Promise<string|null>} Enhanced markdown, or null if cancelled/failed.
   */
  static async show(markdown, mode, deckController) {
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
    const progressEl = panel.querySelector(`.${P}progress`);
    const progressCountEl = panel.querySelector(`.${P}progress-count`);
    const progressTotalEl = panel.querySelector(`.${P}progress-total`);
    const cancelBtn = panel.querySelector('[data-action="cancel"]');
    const closeBtn = panel.querySelector('[data-action="close"]');
    const minimizeBtn = panel.querySelector('[data-action="minimize"]');
    const seeResultBtn = panel.querySelector('[data-action="see-result"]');
    const keepBtn = panel.querySelector('[data-action="keep"]');
    const revertBtn = panel.querySelector('[data-action="revert"]');

    let cancelled = false;
    let result = null;

    // Only use live deck updates for fix mode
    const liveMode = mode === "fix" && deckController;

    // Snapshot for revert (fix mode only)
    let snapshotSlides = null;
    let snapshotIndex = 0;
    if (liveMode) {
      snapshotSlides = deckController.deck.slides.map((s) => ({
        ...s,
        areas: { ...(s.areas || {}) },
      }));
      snapshotIndex = deckController.slideNavigator.currentIndex;
    }

    const revertDeck = () => {
      if (liveMode && snapshotSlides && deckController) {
        deckController.deck.slides = snapshotSlides.map((s) => ({
          ...s,
          areas: { ...(s.areas || {}) },
        }));
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
    };

    cancelBtn.addEventListener("click", () => {
      cancelled = true;
      this.cancel();
    });

    const finish = () => {
      if (this._showId === myShowId) {
        this._finishResolve?.();
      }
    };

    closeBtn.addEventListener("click", finish);
    seeResultBtn.addEventListener("click", finish);

    keepBtn.addEventListener("click", () => {
      // Keep current state (slides are already in the deck for fix mode)
      finish();
    });

    revertBtn.addEventListener("click", () => {
      revertDeck();
      result = null;
      this.close();
    });

    minimizeBtn.addEventListener("click", () => {
      this._minimized = !this._minimized;
      panel.classList.toggle(`${P}panel--minimized`, this._minimized);
      minimizeBtn.textContent = this._minimized ? "+" : "\u2212";
    });

    const preventWheel = (e) => e.preventDefault();
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
        buildDeckSummary,
        estimateMaxTokens,
        parseAiResponse,
        slidesToMarkdown,
        extractDirectives,
        fixSlideLayouts,
      } = await import("../data/ai-enhancer.js");

      // Load rendering deps for fix mode live updates
      if (liveMode) {
        const { SlideRenderer } = await import("../renderer/slide-renderer.js");
        const { ContentEnhancer } = await import("../renderer/content-enhancer.js");
        const { MarkdownParser } = await import("../data/markdown-parser.js");
        const { escapeBareHtmlTags } = await import("../core/utils.js");
        window.SlideRenderer = SlideRenderer;
        window.ContentEnhancer = ContentEnhancer;
        window.MarkdownParser = MarkdownParser;
        window.escapeBareHtmlTags = escapeBareHtmlTags;
      }

      const totalSlides = markdown.split(/\n---\n/).length;
      const maxTokens = estimateMaxTokens(markdown, mode);
      const deckSummary = buildDeckSummary(markdown);
      statusEl.textContent = `Processing ${totalSlides} slides in batches of ${BATCH_SIZE}\u2026`;

      this._abortController = new AbortController();
      const signal = this._abortController.signal;

      const useReasoning = SettingsModal.getReasoning();
      const effort = SettingsModal.getEffort();

      let startIdx = 0;

      // Show progress indicator
      progressTotalEl.textContent = totalSlides;
      progressCountEl.textContent = "0";
      progressEl.hidden = false;

      outputEl.style.overflowY = "hidden";
      panel.addEventListener("wheel", preventWheel, { passive: false });

      while (startIdx < totalSlides) {
        if (cancelled) break;

        const { system, user } = buildBatchMessages(
          markdown,
          mode,
          startIdx,
          BATCH_SIZE,
          totalSlides,
          deckSummary,
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

        const batchNum = Math.floor(startIdx / BATCH_SIZE) + 1;
        statusEl.textContent = `Batch ${batchNum}\u2026 (${allSlides.length}/${totalSlides} slides done)`;

        const { contentText, finishReason } = await this.#streamBatch(
          body,
          statusEl,
          outputEl,
          signal,
        );

        if (cancelled) break;

        if (finishReason === "length") {
          progressEl.hidden = true;
          if (liveMode) revertDeck();
          statusEl.textContent =
            "Response truncated \u2014 deck too large for AI. Try fix mode or reduce slides.";
          statusEl.className = `${P}status ${P}status--error`;
          noticeEl.hidden = true;
          cancelBtn.hidden = true;
          keepBtn.hidden = true;
          revertBtn.hidden = true;
          closeBtn.hidden = false;
          closeBtn.textContent = "Close";
          outputEl.style.overflowY = "";
          panel.removeEventListener("wheel", preventWheel);
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
        if (!parsed || !parsed.slides.length) break;

        const origDirectives = extractDirectives(markdown);
        const fixedBatch = fixSlideLayouts(parsed.slides, origDirectives, mode);

        // Fix mode: update slides in-place in the deck
        if (liveMode && deckController) {
          const parser = new window.MarkdownParser();
          parser.ensureMarkdownIt();
          for (let i = 0; i < fixedBatch.length; i++) {
            const globalIdx = startIdx + i;
            const aiSlide = fixedBatch[i];
            // Parse raw markdown areas, then render to HTML
            const { areas: rawAreas } = window.MarkdownParser.parseAreas(aiSlide.content);
            const htmlAreas = {};
            for (const [name, src] of Object.entries(rawAreas)) {
              const escaped = window.escapeBareHtmlTags(src);
              let html = parser.md.render(escaped);
              html = parser.convertMermaidCodeBlocksToDiv(html);
              htmlAreas[name] = html;
            }

            // Update existing slide in-place
            if (globalIdx < deckController.deck.slides.length) {
              const existing = deckController.deck.slides[globalIdx];
              existing.layout = aiSlide.layout || existing.layout;
              existing.background = aiSlide.background || existing.background;
              existing.theme = aiSlide.theme || existing.theme;
              existing.areas = htmlAreas;

              // Re-render the DOM element
              const container = deckController.elements.slidesContainer;
              const slideEls = container.querySelectorAll(".slide");
              if (slideEls[globalIdx]) {
                const newEl = window.SlideRenderer.createSlideElement(
                  deckController.deck,
                  existing,
                  globalIdx,
                  globalIdx === deckController.slideNavigator.currentIndex,
                );
                slideEls[globalIdx].replaceWith(newEl);
                window.ContentEnhancer.enhanceRenderedContent(newEl).catch(() => {});
              }
            }
          }
          deckController.dispatchEvent("deckchange", { deck: deckController.deck });
        }

        allSlides.push(...fixedBatch);
        progressCountEl.textContent = allSlides.length;
        statusEl.textContent = `Batch ${Math.floor(startIdx / BATCH_SIZE) + 1} done`;

        startIdx += BATCH_SIZE;
      }

      outputEl.style.overflowY = "";
      panel.removeEventListener("wheel", preventWheel);

      if (cancelled) {
        progressEl.hidden = true;
        if (liveMode) {
          statusEl.textContent = `Keep ${allSlides.length} processed slides?`;
          statusEl.className = `${P}status`;
          noticeEl.hidden = true;
          cancelBtn.hidden = true;
          keepBtn.hidden = false;
          revertBtn.hidden = false;
          outputEl.style.overflowY = "";
          panel.removeEventListener("wheel", preventWheel);
          await new Promise((resolve) => {
            this._finishResolve = resolve;
          });
          if (this._showId === myShowId) {
            this._currentPanel = null;
          }
          panel.remove();
          return null;
        }
        this.close();
        return null;
      }

      if (allSlides.length === 0) {
        progressEl.hidden = true;
        if (liveMode) revertDeck();
        statusEl.textContent = "Error: AI did not return valid JSON";
        statusEl.className = `${P}status ${P}status--error`;
        noticeEl.hidden = true;
        cancelBtn.hidden = true;
        keepBtn.hidden = true;
        revertBtn.hidden = true;
        closeBtn.hidden = false;
        closeBtn.textContent = "Close";
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

      result = slidesToMarkdown(allSlides);

      progressEl.hidden = true;
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
      progressEl.hidden = true;
      if (err.name === "AbortError") {
        if (liveMode) revertDeck();
        this.close();
        return null;
      }
      if (liveMode) revertDeck();
      statusEl.textContent = `Error: ${err.message}`;
      statusEl.className = `${P}status ${P}status--error`;
      noticeEl.hidden = true;
      cancelBtn.hidden = true;
      keepBtn.hidden = true;
      revertBtn.hidden = true;
      closeBtn.hidden = false;
      closeBtn.textContent = "Close";
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
      <div class="${P}progress" hidden>
        <span class="${P}progress-count">0</span>
        <span class="${P}progress-sep">/</span>
        <span class="${P}progress-total">0</span>
        <span class="${P}progress-label">slides</span>
      </div>
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
