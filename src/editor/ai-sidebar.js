/**
 * AiSidebar
 *
 * Non-blocking sidebar panel for AI processing.
 * Shows streaming response while slides render in the background.
 */

import { SettingsModal } from "./settings-modal.js";

const P = "ai-sidebar__";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export class AiSidebar {
  static _currentPanel = null;
  static _abortController = null;

  static cancel() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  }

  static close() {
    this.cancel();
    if (this._currentPanel) {
      this._currentPanel.remove();
      this._currentPanel = null;
    }
  }

  /**
   * Show the AI sidebar and stream the response.
   * @param {string} markdown - The markdown to enhance.
   * @param {"fix"|"generate"} mode - Enhancement mode.
   * @param {(partialMarkdown: string, slideCount: number) => void} [onSlideRender] - Called on slide boundaries.
   * @returns {Promise<string|null>} Enhanced markdown, or null if cancelled/failed.
   */
  static async show(markdown, mode, onSlideRender) {
    const panel = this.#createPanel(mode);
    document.body.appendChild(panel);
    this._currentPanel = panel;

    const outputEl = panel.querySelector(`.${P}output`);
    const statusEl = panel.querySelector(`.${P}status`);
    const slideCountEl = panel.querySelector(`.${P}slide-count`);
    const cancelBtn = panel.querySelector('[data-action="cancel"]');
    const closeBtn = panel.querySelector('[data-action="close"]');

    let cancelled = false;
    let result = null;

    cancelBtn.addEventListener("click", () => {
      cancelled = true;
      this.cancel();
    });

    closeBtn.addEventListener("click", () => {
      this.close();
    });

    try {
      const apiKey = SettingsModal.getApiKey();
      const model = SettingsModal.getModel();

      if (!apiKey) {
        statusEl.textContent = "No API key — open Settings to configure";
        statusEl.className = `${P}status ${P}status--error`;
        closeBtn.hidden = false;
        cancelBtn.hidden = true;
        return null;
      }

      statusEl.textContent = "Preparing…";
      const { buildMessages, estimateTokens } = await import("../data/ai-enhancer.js");
      const { system, user } = buildMessages(markdown, mode);
      const inputTokens = estimateTokens(system + user);
      statusEl.textContent = `Sending (~${inputTokens.toLocaleString()} tokens)…`;

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
            { role: "system", content: system },
            { role: "user", content: user },
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
      let contentText = "";
      let displayHtml = "";
      let inReasoning = true;
      let buffer = "";
      let lastRenderedSlideCount = 0;

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
            const delta = parsed.choices?.[0]?.delta;
            const content = delta?.content || "";
            const reasoning = delta?.reasoning || delta?.reasoning_details?.[0]?.text || "";

            if (content) {
              if (inReasoning) {
                inReasoning = false;
                displayHtml += `</span>`;
              }
              contentText += content;
              displayHtml += this.#escHtml(content);
            } else if (reasoning && inReasoning) {
              displayHtml += this.#escHtml(reasoning);
            }

            if (content || reasoning) {
              outputEl.innerHTML = displayHtml + `<span class="${P}cursor"></span>`;
              outputEl.scrollTop = outputEl.scrollHeight;

              if (onSlideRender && contentText) {
                const slideCount = (contentText.split(/^---$/m) || []).length;
                if (slideCount > lastRenderedSlideCount) {
                  lastRenderedSlideCount = slideCount;
                  slideCountEl.textContent = `${slideCount} slides`;
                  statusEl.textContent = inReasoning
                    ? `Thinking… (${slideCount} slides)`
                    : `Generating… (${slideCount} slides)`;
                  try {
                    onSlideRender(contentText, slideCount);
                  } catch {
                    // ignore
                  }
                }
              }
            }
          } catch {
            // skip malformed JSON
          }
        }
      }

      if (cancelled) {
        this.close();
        return null;
      }

      result = contentText;
      statusEl.textContent = "Done!";
      statusEl.className = `${P}status ${P}status--done`;
      slideCountEl.textContent = `${lastRenderedSlideCount} slides`;
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
    });

    this._currentPanel = null;
    panel.remove();
    return result;
  }

  static #createPanel(mode) {
    const panel = document.createElement("div");
    panel.className = P + "panel";
    const title = mode === "fix" ? "AI: Fixing Issues" : "AI: Generating Inspired Deck";
    panel.innerHTML = `
      <div class="${P}header">
        <span class="${P}title">${title}</span>
        <span class="${P}slide-count"></span>
      </div>
      <div class="${P}status">Starting…</div>
      <div class="${P}output"></div>
      <div class="${P}actions">
        <button type="button" data-action="cancel" class="${P}btn ${P}btn--secondary">Cancel</button>
        <button type="button" data-action="close" class="${P}btn ${P}btn--accent" hidden>Done</button>
      </div>
    `;
    this.#injectStyles(panel);
    return panel;
  }

  static #injectStyles(container) {
    const style = document.createElement("style");
    style.textContent = `
      .${P}panel {
        position: fixed; top: 0; right: 0; bottom: 0; width: 420px; max-width: 90vw;
        z-index: 10000; display: flex; flex-direction: column;
        background: var(--surface-bg, #fff); color: var(--text-high, #111);
        box-shadow: -4px 0 24px rgba(0,0,0,0.15);
        animation: ${P}slideIn 0.25s ease-out;
        font-family: var(--font-sans, -apple-system, sans-serif);
      }
      @keyframes ${P}slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      .${P}header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 16px 20px; border-bottom: 1px solid var(--border-subtle, rgba(0,0,0,0.08));
      }
      .${P}title { font-size: 15px; font-weight: 600; }
      .${P}slide-count {
        font-size: 12px; color: var(--text-medium, #666);
        background: var(--bg-subtle, rgba(0,0,0,0.04)); padding: 2px 8px;
        border-radius: 10px;
      }
      .${P}status {
        font-size: 12px; color: var(--text-medium, #666); padding: 10px 20px;
        display: flex; align-items: center; gap: 8px;
        border-bottom: 1px solid var(--border-subtle, rgba(0,0,0,0.08));
      }
      .${P}status::before {
        content: ""; display: inline-block; width: 6px; height: 6px;
        border-radius: 50%; background: var(--accent, #6366f1);
        animation: ${P}pulse 1.5s ease-in-out infinite;
      }
      .${P}status--done::before { background: #10b981; animation: none; }
      .${P}status--error::before { background: #dc2626; animation: none; }
      @keyframes ${P}pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
      .${P}output {
        flex: 1; overflow-y: auto; padding: 16px 20px;
        font-size: 12px; line-height: 1.6; white-space: pre-wrap;
        font-family: var(--font-mono, monospace);
        background: var(--code-surface, rgba(0,0,0,0.03));
      }
      .${P}reasoning { color: var(--text-muted, rgba(0,0,0,0.35)); font-style: italic; }
      .${P}cursor::after {
        content: ""; display: inline-block; width: 2px; height: 1em;
        background: var(--accent, #6366f1); margin-left: 2px;
        animation: ${P}blink 1s step-end infinite; vertical-align: text-bottom;
      }
      @keyframes ${P}blink { 50% { opacity: 0; } }
      .${P}actions {
        display: flex; gap: 8px; justify-content: flex-end;
        padding: 12px 20px; border-top: 1px solid var(--border-subtle, rgba(0,0,0,0.08));
      }
      .${P}btn {
        padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 500;
        cursor: pointer; border: 1px solid transparent; transition: all 0.2s;
      }
      .${P}btn--secondary { background: var(--surface-hover, #f0f0f0); color: var(--text-high, #111); }
      .${P}btn--accent { background: var(--accent, #6366f1); color: #fff; }
      .${P}btn--accent:hover { background: var(--accent-hover, #4f46e5); }
    `;
    container.appendChild(style);
  }

  static #escHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
