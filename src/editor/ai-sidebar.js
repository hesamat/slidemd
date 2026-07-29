/**
 * AiSidebar
 *
 * Non-blocking sidebar panel for AI processing.
 * Streams the full AI response with truncation detection.
 */

import { SettingsModal } from "./settings-modal.js";

const P = "ai-sidebar__";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export class AiSidebar {
  static _currentPanel = null;
  static _abortController = null;
  static _minimized = false;
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
   * Show the AI sidebar and stream the response.
   * @param {string} markdown - The markdown to enhance.
   * @param {"fix"|"generate"} mode - Enhancement mode.
   * @returns {Promise<string|null>} Enhanced markdown, or null if cancelled/failed.
   */
  static async show(markdown, mode) {
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

    let cancelled = false;
    let result = null;

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

    minimizeBtn.addEventListener("click", () => {
      this._minimized = !this._minimized;
      panel.classList.toggle(`${P}panel--minimized`, this._minimized);
      minimizeBtn.textContent = this._minimized ? "+" : "\u2212";
    });

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
        return null;
      }

      statusEl.textContent = "Preparing\u2026";
      const { buildMessages, estimateMaxTokens, parseAiResponse, slidesToMarkdown } =
        await import("../data/ai-enhancer.js");

      const { system, user } = buildMessages(markdown, mode);
      const inputTokens = estimateMaxTokens(markdown, mode);
      statusEl.textContent = `Sending (~${inputTokens.toLocaleString()} tokens)\u2026`;

      this._abortController = new AbortController();
      const useReasoning = SettingsModal.getReasoning();
      const effort = SettingsModal.getEffort();
      const body = {
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: inputTokens,
        stream: true,
        response_format: { type: "json_object" },
      };
      if (useReasoning) {
        body.reasoning = { effort };
      }

      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: this._abortController.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`API error ${res.status}: ${errorText.slice(0, 200)}`);
      }

      noticeEl.hidden = false;
      statusEl.textContent = "AI is working\u2026";

      // Disable scrolling during streaming
      outputEl.style.overflowY = "hidden";
      const preventWheel = (e) => e.preventDefault();
      panel.addEventListener("wheel", preventWheel, { passive: false });

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

            const reasoningDelta = delta.reasoning || delta.reasoning_details?.[0]?.text || "";
            if (reasoningDelta) {
              reasoningText += reasoningDelta;
              if (!contentText) {
                outputEl.textContent = reasoningText;
                outputEl.scrollTop = outputEl.scrollHeight;
                statusEl.textContent = "Thinking\u2026";
              }
            }

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

      // Re-enable scrolling
      outputEl.style.overflowY = "";
      panel.removeEventListener("wheel", preventWheel);

      if (cancelled) {
        this.close();
        return null;
      }

      // Detect truncation
      if (finishReason === "length") {
        statusEl.textContent =
          "Response truncated \u2014 deck too large for AI. Try reducing the number of slides.";
        statusEl.className = `${P}status ${P}status--error`;
        noticeEl.hidden = true;
        cancelBtn.hidden = true;
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

      const parsed = parseAiResponse(contentText);
      if (!parsed) {
        statusEl.textContent = "Error: AI did not return valid JSON";
        statusEl.className = `${P}status ${P}status--error`;
        cancelBtn.hidden = true;
        closeBtn.hidden = false;
        closeBtn.textContent = "Close";
        noticeEl.hidden = true;
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

      result = slidesToMarkdown(parsed.slides);
      statusEl.textContent = 'Done! Click "See result" to apply.';
      statusEl.className = `${P}status ${P}status--done`;
      noticeEl.hidden = true;
      cancelBtn.hidden = true;
      closeBtn.hidden = false;
      closeBtn.textContent = "See result";
      seeResultBtn.hidden = false;
      panel.classList.add(`${P}panel--done`);
    } catch (err) {
      if (err.name === "AbortError") {
        this.close();
        return null;
      }
      statusEl.textContent = `Error: ${err.message}`;
      statusEl.className = `${P}status ${P}status--error`;
      noticeEl.hidden = true;
      cancelBtn.hidden = true;
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
      <div class="${P}notice">AI result not yet applied \u2014 click "See result" when done.</div>
      <div class="${P}output"></div>
      <div class="${P}actions">
        <button type="button" data-action="cancel" class="${P}btn">Cancel</button>
        <button type="button" data-action="close" class="${P}btn ${P}btn--primary" hidden>Close</button>
      </div>
    `;
    return panel;
  }
}
