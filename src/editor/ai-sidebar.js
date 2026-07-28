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
    const seeResultBtn = panel.querySelector('[data-action="see-result"]');

    let cancelled = false;
    let result = null;

    cancelBtn.addEventListener("click", () => {
      cancelled = true;
      this.cancel();
    });

    const finish = () => {
      this._finishResolve?.();
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
      const {
        buildMessages,
        estimateTokens,
        parseAiResponse,
        slidesToMarkdown,
        extractDirectives,
        fixSlideLayouts,
      } = await import("../data/ai-enhancer.js");
      const { system, user, original } = buildMessages(markdown, mode);
      const inputTokens = estimateTokens(system + user);
      statusEl.textContent = `Sending (~${inputTokens.toLocaleString()} tokens)\u2026`;

      this._abortController = new AbortController();
      const body = {
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: 16000,
        stream: true,
        response_format: { type: "json_object" },
      };
      // Enable extended thinking for generate mode
      if (mode === "generate") {
        body.reasoning = { effort: "high" };
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
        const body = await res.text().catch(() => "");
        throw new Error(`API error ${res.status}: ${body.slice(0, 200)}`);
      }

      noticeEl.hidden = false;
      statusEl.textContent = "AI is working\u2026";
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
            const delta = parsed.choices?.[0]?.delta;
            const text =
              delta?.content || delta?.reasoning || delta?.reasoning_details?.[0]?.text || "";
            if (text) {
              contentText += text;
              outputEl.textContent = contentText;
              outputEl.scrollTop = outputEl.scrollHeight;

              const slideCount = contentText.split(/^---$/m).length;
              if (slideCount > lastSlideCount) {
                lastSlideCount = slideCount;
                slideCountEl.textContent = `${slideCount} slide${slideCount !== 1 ? "s" : ""}`;
                statusEl.textContent = `Generating\u2026 (${slideCount} slide${slideCount !== 1 ? "s" : ""})`;
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
        this._currentPanel = null;
        panel.remove();
        return null;
      }

      const origDirectives = extractDirectives(original);
      const fixedSlides = fixSlideLayouts(parsed.slides, origDirectives, mode);
      result = slidesToMarkdown(fixedSlides);
      statusEl.textContent = 'Done! Click "See result" to apply.';
      statusEl.className = `${P}status ${P}status--done`;
      slideCountEl.textContent = `${parsed.slides.length} slide${parsed.slides.length !== 1 ? "s" : ""}`;
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

    this._currentPanel = null;
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
          <span class="${P}slide-count">0 slides</span>
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
    this.#injectStyles(panel);
    return panel;
  }

  static #injectStyles(container) {
    const style = document.createElement("style");
    style.textContent = `
      /* ── AI Sidebar ─────────────────────────────────────────────── */
      .${P}panel {
        --ai-bg: #ffffff;
        --ai-surface: #f8f9fa;
        --ai-border: rgba(0,0,0,0.08);
        --ai-text: #1a1a2e;
        --ai-text-secondary: #555;
        --ai-accent: #6366f1;
        --ai-accent-hover: #4f46e5;
        --ai-notice-bg: #fef3c7;
        --ai-notice-text: #92400e;

        position: fixed; top: 10%; right: 16px;
        height: 80%; width: 440px; max-width: 92vw;
        z-index: 10000;
        display: flex; flex-direction: column;
        background: var(--ai-bg);
        color: var(--ai-text);
        box-shadow: 0 8px 32px rgba(0,0,0,0.18);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        border: 1px solid var(--ai-border);
        border-radius: 12px;
        overflow: hidden;
      }

      /* Minimized state: bottom-right chip */
      .${P}panel--minimized {
        top: auto; bottom: 16px; right: 16px;
        width: auto; height: auto;
        border-radius: 12px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.18);
      }
      .${P}panel--minimized .${P}header {
        padding: 8px 14px;
        border-bottom: none;
        border-radius: 12px;
      }
      .${P}panel--minimized .${P}status,
      .${P}panel--minimized .${P}notice,
      .${P}panel--minimized .${P}output,
      .${P}panel--minimized .${P}actions { display: none; }

      /* Done glow effect */
      .${P}panel--done { animation: ${P}doneGlow 2s ease-in-out 3; }
      @keyframes ${P}doneGlow {
        0%,100% { box-shadow: 0 8px 32px rgba(0,0,0,0.18); }
        50% { box-shadow: 0 8px 40px rgba(99,102,241,0.4), 0 0 48px rgba(99,102,241,0.15); }
      }
      .${P}panel--minimized.${P}panel--done {
        animation: ${P}minimizedGlow 2s ease-in-out 3;
        border: 1.5px solid var(--ai-accent);
      }
      @keyframes ${P}minimizedGlow {
        0%,100% { box-shadow: 0 4px 16px rgba(0,0,0,0.18); border-color: var(--ai-accent); }
        50% { box-shadow: 0 4px 24px rgba(99,102,241,0.5), 0 0 40px rgba(99,102,241,0.2); }
      }

      .${P}btn--see-result {
        font-size: 11px; font-weight: 600;
        padding: 4px 10px; border-radius: 6px;
        background: var(--ai-accent); color: #fff;
        border: none; cursor: pointer;
        transition: background 0.15s;
        white-space: nowrap;
      }
      .${P}btn--see-result:hover { background: var(--ai-accent-hover); }

      .${P}header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 14px 18px;
        border-bottom: 1px solid var(--ai-border);
        flex-shrink: 0;
        background: var(--ai-surface);
        border-radius: 12px 12px 0 0;
      }
      .${P}title {
        font-size: 14px; font-weight: 600;
        color: var(--ai-text);
      }
      .${P}header-right { display: flex; align-items: center; gap: 8px; }
      .${P}slide-count {
        font-size: 11px; font-weight: 500;
        color: var(--ai-text-secondary);
        background: var(--ai-border); padding: 2px 10px;
        border-radius: 10px; white-space: nowrap;
      }
      .${P}icon-btn {
        width: 28px; height: 28px; border: none;
        background: transparent; border-radius: 6px;
        cursor: pointer; font-size: 18px; line-height: 1;
        color: var(--ai-text-secondary);
        display: flex; align-items: center; justify-content: center;
        transition: background 0.15s;
      }
      .${P}icon-btn:hover { background: var(--ai-border); }

      .${P}status {
        font-size: 12px; color: var(--ai-text-secondary);
        padding: 10px 18px;
        display: flex; align-items: center; gap: 8px;
        border-bottom: 1px solid var(--ai-border);
        background: var(--ai-surface);
      }
      .${P}status::before {
        content: ""; display: inline-block;
        width: 7px; height: 7px; border-radius: 50%;
        background: var(--ai-accent);
        animation: ${P}pulse 1.4s ease-in-out infinite;
      }
      .${P}status--done { color: #16a34a; }
      .${P}status--done::before { background: #16a34a; animation: none; }
      .${P}status--error { color: #dc2626; }
      .${P}status--error::before { background: #dc2626; animation: none; }
      @keyframes ${P}pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }

      .${P}notice {
        font-size: 11px; color: var(--ai-notice-text);
        background: var(--ai-notice-bg);
        padding: 8px 18px;
        border-bottom: 1px solid var(--ai-border);
      }

      .${P}output {
        flex: 1; min-height: 0; overflow-y: auto;
        padding: 14px 18px;
        font-size: 12px; line-height: 1.6;
        white-space: pre-wrap; word-break: break-word;
        font-family: "SF Mono", "Cascadia Code", "Fira Code", monospace;
        background: var(--ai-bg);
        color: var(--ai-text);
      }

      .${P}actions {
        display: flex; gap: 8px; justify-content: flex-end;
        padding: 12px 18px;
        border-top: 1px solid var(--ai-border);
        flex-shrink: 0;
        background: var(--ai-surface);
        border-radius: 0 0 12px 12px;
      }
      .${P}btn {
        padding: 7px 16px; border-radius: 8px;
        font-size: 13px; font-weight: 500;
        cursor: pointer; border: 1px solid var(--ai-border);
        transition: all 0.15s;
        background: var(--ai-bg); color: var(--ai-text);
      }
      .${P}btn:hover { background: var(--ai-surface); }
      .${P}btn--primary {
        background: var(--ai-accent); color: #fff; border-color: var(--ai-accent);
      }
      .${P}btn--primary:hover { background: var(--ai-accent-hover); }

      /* ── Dark mode ──────────────────────────────────────────────── */
      [data-theme="dark"] .${P}panel,
      .${P}panel[data-theme="dark"] {
        --ai-bg: #1e1e2e;
        --ai-surface: #252536;
        --ai-border: rgba(255,255,255,0.08);
        --ai-text: #e2e2f0;
        --ai-text-secondary: #a0a0b8;
        --ai-notice-bg: #422006;
        --ai-notice-text: #fbbf24;
      }
    `;
    container.appendChild(style);
  }
}
