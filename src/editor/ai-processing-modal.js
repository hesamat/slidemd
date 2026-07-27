/**
 * AiProcessingModal
 *
 * Modal shown during AI post-processing of imported decks.
 * Streams AI response tokens for perceived speed.
 */

import { SettingsModal } from "./settings-modal.js";

const P = "ai-modal__";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export class AiProcessingModal {
  static _currentBackdrop = null;
  static _abortController = null;

  /**
   * Cancel the current AI request.
   */
  static cancel() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  }

  /**
   * Close the modal.
   */
  static close() {
    this.cancel();
    if (this._currentBackdrop) {
      document.body.style.overflow = "";
      this._currentBackdrop.remove();
      this._currentBackdrop = null;
    }
  }

  /**
   * Show the AI processing modal and stream the response.
   * @param {string} markdown - The markdown to enhance.
   * @param {"fix"|"generate"} mode - Enhancement mode.
   * @returns {Promise<string|null>} Enhanced markdown, or null if cancelled/failed.
   */
  static async show(markdown, mode) {
    const backdrop = this.#createDom(mode);
    document.body.appendChild(backdrop);
    this._currentBackdrop = backdrop;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const outputEl = backdrop.querySelector(`.${P}output`);
    const statusEl = backdrop.querySelector(`.${P}status`);
    const cancelBtn = backdrop.querySelector('[data-action="cancel"]');
    const closeBtn = backdrop.querySelector('[data-action="close"]');
    const dialog = backdrop.querySelector(`.${P}dialog`);

    dialog.addEventListener("click", (e) => e.stopPropagation());

    let cancelled = false;
    let result = null;

    cancelBtn.addEventListener("click", () => {
      cancelled = true;
      this.cancel();
    });

    closeBtn.addEventListener("click", () => {
      this.close();
    });

    // Close on backdrop click
    let backdropMouseDown = false;
    backdrop.addEventListener("mousedown", (e) => {
      backdropMouseDown = e.target === backdrop;
    });
    backdrop.addEventListener("click", (e) => {
      if (backdropMouseDown && e.target === backdrop) {
        this.close();
      }
      backdropMouseDown = false;
    });

    try {
      const apiKey = SettingsModal.getApiKey();
      const model = SettingsModal.getModel();

      if (!apiKey) {
        statusEl.textContent = "No API key configured";
        statusEl.className = `${P}status ${P}status--error`;
        closeBtn.hidden = false;
        return null;
      }

      statusEl.textContent = "Sending to AI…";

      // Build messages
      const { buildSystemPrompt, buildFixPrompt, buildGeneratePrompt } = await import(
        "../data/ai-enhancer.js"
      );
      const systemPrompt = buildSystemPrompt();
      const userPrompt = mode === "fix" ? buildFixPrompt(markdown) : buildGeneratePrompt(markdown);

      // Stream the response
      this._abortController = new AbortController();
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 16000,
          stream: true,
        }),
        signal: this._abortController.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`API error ${res.status}: ${body.slice(0, 200)}`);
      }

      statusEl.textContent = "AI is working…";
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              outputEl.textContent = fullText;
              outputEl.scrollTop = outputEl.scrollHeight;
            }
          } catch {
            // skip malformed JSON lines
          }
        }
      }

      if (cancelled) {
        this.close();
        return null;
      }

      result = fullText;
      statusEl.textContent = "Done!";
      statusEl.className = `${P}status ${P}status--done`;
      cancelBtn.hidden = true;
      closeBtn.hidden = false;
    } catch (err) {
      if (err.name === "AbortError") {
        this.close();
        return null;
      }
      statusEl.textContent = `Error: ${err.message}`;
      statusEl.className = `${P}status ${P}status--error`;
      cancelBtn.hidden = true;
      closeBtn.hidden = false;
    }

    // Wait for user to close
    await new Promise((resolve) => {
      closeBtn.addEventListener("click", resolve, { once: true });
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) resolve();
      }, { once: true });
    });

    document.body.style.overflow = prevOverflow;
    this._currentBackdrop = null;
    backdrop.remove();

    return result;
  }

  static #createDom(mode) {
    const backdrop = document.createElement("div");
    backdrop.className = `${P}backdrop`;
    const title = mode === "fix" ? "AI: Fixing Issues" : "AI: Generating Inspired Deck";
    backdrop.innerHTML = `
      <div class="${P}dialog">
        <h2 class="${P}title">${title}</h2>
        <div class="${P}status">Starting…</div>
        <div class="${P}output"></div>
        <div class="${P}actions">
          <button type="button" data-action="cancel" class="${P}btn ${P}btn--secondary">Cancel</button>
          <button type="button" data-action="close" class="${P}btn ${P}btn--accent" hidden>Done</button>
        </div>
      </div>
    `;
    this.#injectStyles(backdrop);
    return backdrop;
  }

  static #injectStyles(container) {
    const style = document.createElement("style");
    style.textContent = `
      .${P}backdrop {
        position: fixed; inset: 0; z-index: 10000;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
      }
      .${P}dialog {
        background: var(--surface-bg, #fff); color: var(--text-high, #111);
        border-radius: 12px; padding: 24px; width: 600px; max-width: 90vw;
        max-height: 85vh; display: flex; flex-direction: column;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      }
      .${P}title { margin: 0 0 12px; font-size: 18px; font-weight: 600; }
      .${P}status {
        font-size: 13px; color: var(--text-medium, #666); margin-bottom: 12px;
        display: flex; align-items: center; gap: 8px;
      }
      .${P}status::before {
        content: ""; display: inline-block; width: 8px; height: 8px;
        border-radius: 50%; background: var(--accent, #6366f1);
        animation: ${P}pulse 1.5s ease-in-out infinite;
      }
      .${P}status--done::before { background: #10b981; animation: none; }
      .${P}status--error::before { background: #dc2626; animation: none; }
      @keyframes ${P}pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
      .${P}output {
        flex: 1; min-height: 200px; max-height: 60vh; overflow-y: auto;
        font-size: 13px; line-height: 1.6; white-space: pre-wrap;
        font-family: var(--font-mono, monospace);
        background: var(--code-surface, rgba(0,0,0,0.03));
        border: 1px solid var(--border-subtle, rgba(0,0,0,0.08));
        border-radius: 8px; padding: 12px; margin-bottom: 12px;
      }
      .${P}actions { display: flex; gap: 8px; justify-content: flex-end; }
      .${P}btn {
        padding: 7px 16px; border-radius: 6px; font-size: 13px; font-weight: 500;
        cursor: pointer; border: 1px solid transparent; transition: all 0.2s;
      }
      .${P}btn--secondary { background: var(--surface-hover, #f0f0f0); color: var(--text-high, #111); }
      .${P}btn--accent { background: var(--accent, #6366f1); color: #fff; }
      .${P}btn--accent:hover { background: var(--accent-hover, #4f46e5); }
    `;
    container.appendChild(style);
  }
}
