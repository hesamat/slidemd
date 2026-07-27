/**
 * AiSidebar
 *
 * Non-blocking sidebar panel for AI processing.
 * Shows streaming response while the user can still interact with the deck.
 */

import { SettingsModal } from "./settings-modal.js";

const P = "ai-sidebar__";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export class AiSidebar {
  static _currentPanel = null;
  static _abortController = null;
  static _minimized = false;

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
    const panel = this.#createPanel(mode);
    document.body.appendChild(panel);
    this._currentPanel = panel;

    const outputEl = panel.querySelector(`.${P}output`);
    const statusEl = panel.querySelector(`.${P}status`);
    const slideCountEl = panel.querySelector(`.${P}slide-count`);
    const noticeEl = panel.querySelector(`.${P}notice`);
    const cancelBtn = panel.querySelector('[data-action="cancel"]');
    const closeBtn = panel.querySelector('[data-action="close"]');
    const minimizeBtn = panel.querySelector('[data-action="minimize"]');

    let cancelled = false;
    let result = null;

    cancelBtn.addEventListener("click", () => {
      cancelled = true;
      this.cancel();
    });

    closeBtn.addEventListener("click", () => {
      this.close();
    });

    minimizeBtn.addEventListener("click", () => {
      this._minimized = !this._minimized;
      panel.classList.toggle(`${P}panel--minimized`, this._minimized);
      minimizeBtn.textContent = this._minimized ? "+" : "−";
    });

    try {
      const apiKey = SettingsModal.getApiKey();
      const model = SettingsModal.getModel();

      if (!apiKey) {
        statusEl.textContent = "No API key — open Settings to configure";
        statusEl.className = `${P}status ${P}status--error`;
        noticeEl.hidden = true;
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

      noticeEl.hidden = false;
      statusEl.textContent = "AI is working…";
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let contentText = "";
      let buffer = "";
      let lastSlideCount = 0;

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
            const content = parsed.choices?.[0]?.delta?.content || "";
            if (content) {
              contentText += content;
              outputEl.textContent = contentText;
              outputEl.scrollTop = outputEl.scrollHeight;

              const slideCount = (contentText.split(/^---$/m) || []).length;
              if (slideCount > lastSlideCount) {
                lastSlideCount = slideCount;
                slideCountEl.textContent = `${slideCount} slides`;
                statusEl.textContent = `Generating… (${slideCount} slides)`;
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
      statusEl.textContent = "Done! Click \"See result\" to apply.";
      statusEl.className = `${P}status ${P}status--done`;
      slideCountEl.textContent = `${lastSlideCount} slides`;
      noticeEl.hidden = true;
      cancelBtn.hidden = true;
      closeBtn.hidden = false;
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
        <div class="${P}header-actions">
          <span class="${P}slide-count"></span>
          <button type="button" data-action="minimize" class="${P}minimize-btn" title="Minimize">−</button>
        </div>
      </div>
      <div class="${P}status">Starting…</div>
      <div class="${P}notice">Result not yet applied — click "See result" when done.</div>
      <div class="${P}output"></div>
      <div class="${P}actions">
        <button type="button" data-action="cancel" class="${P}btn ${P}btn--secondary">Cancel</button>
        <button type="button" data-action="close" class="${P}btn ${P}btn--accent" hidden>See result</button>
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
        background: var(--surface-bg, #fff); color: #1a1a2e;
        box-shadow: -4px 0 24px rgba(0,0,0,0.15);
        animation: ${P}slideIn 0.25s ease-out;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .${P}panel--minimized { bottom: auto; height: 48px; overflow: hidden; }
      .${P}panel--minimized .${P}status,
      .${P}panel--minimized .${P}notice,
      .${P}panel--minimized .${P}output,
      .${P}panel--minimized .${P}actions { display: none; }
      @keyframes ${P}slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      .${P}header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 16px; border-bottom: 1px solid rgba(0,0,0,0.08); flex-shrink: 0;
      }
      .${P}title { font-size: 14px; font-weight: 600; }
      .${P}header-actions { display: flex; align-items: center; gap: 8px; }
      .${P}slide-count {
        font-size: 11px; color: #666;
        background: rgba(0,0,0,0.06); padding: 2px 8px;
        border-radius: 10px; white-space: nowrap;
      }
      .${P}minimize-btn {
        width: 24px; height: 24px; border: none; background: rgba(0,0,0,0.06);
        border-radius: 4px; cursor: pointer; font-size: 16px; line-height: 1;
        color: #666; display: flex; align-items: center; justify-content: center;
      }
      .${P}minimize-btn:hover { background: rgba(0,0,0,0.1); }
      .${P}status {
        font-size: 12px; color: #666; padding: 8px 16px;
        display: flex; align-items: center; gap: 8px;
        border-bottom: 1px solid rgba(0,0,0,0.08);
      }
      .${P}status::before {
        content: ""; display: inline-block; width: 6px; height: 6px;
        border-radius: 50%; background: #6366f1;
        animation: ${P}pulse 1.5s ease-in-out infinite;
      }
      .${P}status--done::before { background: #10b981; animation: none; }
      .${P}status--error::before { background: #dc2626; animation: none; }
      @keyframes ${P}pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
      .${P}notice {
        font-size: 11px; color: #b45309; background: #fef3c7;
        padding: 6px 16px; border-bottom: 1px solid rgba(0,0,0,0.08);
      }
      .${P}output {
        flex: 1; overflow-y: auto; padding: 12px 16px;
        font-size: 11px; line-height: 1.5; white-space: pre-wrap;
        font-family: "SF Mono", Monaco, "Cascadia Code", monospace;
        background: rgba(0,0,0,0.02);
      }
      .${P}actions {
        display: flex; gap: 8px; justify-content: flex-end;
        padding: 10px 16px; border-top: 1px solid rgba(0,0,0,0.08); flex-shrink: 0;
      }
      .${P}btn {
        padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 500;
        cursor: pointer; border: 1px solid transparent; transition: all 0.2s;
      }
      .${P}btn--secondary { background: #f0f0f0; color: #111; }
      .${P}btn--accent { background: #6366f1; color: #fff; }
      .${P}btn--accent:hover { background: #4f46e5; }
    `;
    container.appendChild(style);
  }
}
