/**
 * SettingsModal
 *
 * Modal for configuring AI settings (API key, model selection, reasoning).
 * Settings are stored in sessionStorage by default (cleared when tab closes).
 * An optional "Remember key" checkbox promotes the key to localStorage.
 */

const STORAGE_KEY_API = "webdeck_openrouter_api_key";
const STORAGE_KEY_MODEL = "webdeck_openrouter_model";
const STORAGE_KEY_REASONING = "webdeck_openrouter_reasoning";
const REMEMBER_KEY = "webdeck_openrouter_remember";
const DEFAULT_MODEL = "xiaomi/mimo-v2.5-pro";
const P = "settings-modal__";

export class SettingsModal {
  static _currentBackdrop = null;
  /** @type {Map<string, {supported_efforts: string[]|null, mandatory: boolean}>} */
  static _modelReasoningMap = new Map();

  /**
   * Get stored API key. Checks sessionStorage first, then localStorage.
   * @returns {string}
   */
  static getApiKey() {
    try {
      return sessionStorage.getItem(STORAGE_KEY_API) || localStorage.getItem(STORAGE_KEY_API) || "";
    } catch {
      return "";
    }
  }

  /**
   * Get stored model. Checks sessionStorage first, then localStorage.
   * @returns {string}
   */
  static getModel() {
    try {
      return (
        sessionStorage.getItem(STORAGE_KEY_MODEL) ||
        localStorage.getItem(STORAGE_KEY_MODEL) ||
        DEFAULT_MODEL
      );
    } catch {
      return DEFAULT_MODEL;
    }
  }

  /**
   * Get stored reasoning preference. Checks sessionStorage first, then localStorage.
   * @returns {boolean}
   */
  static getReasoning() {
    try {
      const val =
        sessionStorage.getItem(STORAGE_KEY_REASONING) ||
        localStorage.getItem(STORAGE_KEY_REASONING);
      return val === "true";
    } catch {
      return false;
    }
  }

  /**
   * Check if a model supports reasoning (has supported_efforts defined).
   * @param {string} modelId
   * @returns {boolean}
   */
  static modelSupportsReasoning(modelId) {
    const info = this._modelReasoningMap.get(modelId);
    if (!info) return false;
    return Array.isArray(info.supported_efforts) && info.supported_efforts.length > 0;
  }

  /**
   * Check if API key is configured.
   * @returns {boolean}
   */
  static isConfigured() {
    return !!this.getApiKey();
  }

  /**
   * Clear stored API key from both storages.
   */
  static clearKey() {
    try {
      sessionStorage.removeItem(STORAGE_KEY_API);
      localStorage.removeItem(STORAGE_KEY_API);
      localStorage.removeItem(REMEMBER_KEY);
    } catch {
      // ignore
    }
  }

  /**
   * Close the currently open settings modal (if any).
   */
  static close() {
    if (this._currentBackdrop) {
      document.body.style.overflow = "";
      this._currentBackdrop.remove();
      this._currentBackdrop = null;
    }
  }

  /**
   * Show the settings modal. Returns the saved settings or null if cancelled.
   * @static
   * @returns {Promise<{ apiKey: string, model: string, reasoning: boolean }|null>}
   */
  static async show() {
    return new Promise((resolve) => {
      const backdrop = this.#createDom();
      document.body.appendChild(backdrop);
      this._currentBackdrop = backdrop;

      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const restoreScroll = () => {
        document.body.style.overflow = prevOverflow;
      };

      const apiKeyInput = backdrop.querySelector('[data-field="api-key"]');
      const modelSelect = backdrop.querySelector('[data-field="model"]');
      const rememberCheckbox = backdrop.querySelector('[data-field="remember"]');
      const reasoningRow = backdrop.querySelector(`.${P}reasoning-row`);
      const reasoningCheckbox = backdrop.querySelector('[data-field="reasoning"]');
      const reasoningHint = backdrop.querySelector(`.${P}reasoning-hint`);
      const saveBtn = backdrop.querySelector('[data-action="save"]');
      const cancelBtn = backdrop.querySelector('[data-action="cancel"]');
      const dialog = backdrop.querySelector(`.${P}dialog`);
      const errorEl = backdrop.querySelector(`.${P}error`);

      dialog.addEventListener("click", (e) => e.stopPropagation());

      // Load saved values
      apiKeyInput.value = this.getApiKey();
      modelSelect.value = this.getModel();

      // Restore "remember" state
      let remembered = false;
      try {
        remembered = localStorage.getItem(REMEMBER_KEY) === "true";
      } catch {
        // ignore
      }
      rememberCheckbox.checked = remembered;

      // Show/hide reasoning based on model support
      const updateReasoningVisibility = () => {
        const model = modelSelect.value;
        const supports = this.modelSupportsReasoning(model);
        reasoningRow.hidden = !supports;
        if (!supports) {
          reasoningCheckbox.checked = false;
        }
        reasoningHint.hidden = supports;
      };

      // Initially hide reasoning until models load
      reasoningRow.hidden = true;
      reasoningHint.hidden = false;

      modelSelect.addEventListener("change", updateReasoningVisibility);

      // Fetch available models from OpenRouter
      this.#populateModels(modelSelect, () => {
        // After models load, restore saved reasoning state and update visibility
        const savedReasoning = this.getReasoning();
        const model = modelSelect.value;
        const supports = this.modelSupportsReasoning(model);
        reasoningCheckbox.checked = savedReasoning && supports;
        updateReasoningVisibility();
      });

      const showError = (msg) => {
        errorEl.textContent = msg;
        errorEl.hidden = false;
      };

      saveBtn.addEventListener("click", () => {
        const apiKey = apiKeyInput.value.trim();
        const model = modelSelect.value;
        const remember = rememberCheckbox.checked;
        const reasoning = reasoningCheckbox.checked && this.modelSupportsReasoning(model);

        if (!apiKey) {
          showError("API key is required");
          return;
        }

        try {
          // Always save to sessionStorage (current tab)
          sessionStorage.setItem(STORAGE_KEY_API, apiKey);
          sessionStorage.setItem(STORAGE_KEY_MODEL, model);
          sessionStorage.setItem(STORAGE_KEY_REASONING, String(reasoning));

          if (remember) {
            localStorage.setItem(STORAGE_KEY_API, apiKey);
            localStorage.setItem(STORAGE_KEY_MODEL, model);
            localStorage.setItem(STORAGE_KEY_REASONING, String(reasoning));
            localStorage.setItem(REMEMBER_KEY, "true");
          } else {
            localStorage.removeItem(STORAGE_KEY_API);
            localStorage.removeItem(STORAGE_KEY_MODEL);
            localStorage.removeItem(STORAGE_KEY_REASONING);
            localStorage.removeItem(REMEMBER_KEY);
          }
        } catch {
          // ignore
        }

        restoreScroll();
        backdrop.remove();
        this._currentBackdrop = null;
        resolve({ apiKey, model, reasoning });
      });

      cancelBtn.addEventListener("click", () => {
        restoreScroll();
        backdrop.remove();
        this._currentBackdrop = null;
        resolve(null);
      });

      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) {
          restoreScroll();
          backdrop.remove();
          this._currentBackdrop = null;
          resolve(null);
        }
      });
    });
  }

  /**
   * Fetch models from OpenRouter and populate the select.
   * Caches reasoning support info per model.
   * @static
   * @param {HTMLSelectElement} select
   * @param {() => void} [onLoaded] - Callback after models are loaded
   */
  static async #populateModels(select, onLoaded) {
    const saved = this.getModel();
    // Always ensure the saved model is in the list
    const ensureOption = (id, label) => {
      if (!id) return;
      const existing = select.querySelector(`option[value="${id}"]`);
      if (!existing) {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = label || id;
        select.appendChild(opt);
      }
    };
    ensureOption(saved);

    try {
      const res = await fetch("https://openrouter.ai/api/v1/models");
      if (!res.ok) return;
      const data = await res.json();
      const models = data.data || [];

      // Build reasoning map and populate options
      for (const m of models) {
        ensureOption(m.id, m.name || m.id);
        if (m.reasoning) {
          this._modelReasoningMap.set(m.id, {
            supported_efforts: m.reasoning.supported_efforts || null,
            mandatory: m.reasoning.mandatory || false,
          });
        }
      }

      // Also cache the saved model if it wasn't in the API response
      if (!this._modelReasoningMap.has(saved)) {
        this._modelReasoningMap.set(saved, { supported_efforts: null, mandatory: false });
      }

      // Re-apply saved value after all options are added
      select.value = saved;
    } catch {
      // If fetch fails, ensure saved model is still selectable
      select.value = saved;
    }

    onLoaded?.();
  }

  /**
   * Create the modal DOM.
   * @static
   * @returns {HTMLElement}
   */
  static #createDom() {
    const backdrop = document.createElement("div");
    backdrop.className = `${P}backdrop`;
    backdrop.innerHTML = `
      <div class="${P}dialog">
        <h2 class="${P}title">AI Settings</h2>

        <label class="${P}label" for="${P}api-key">API Key</label>
        <input
          id="${P}api-key"
          class="${P}input"
          type="password"
          data-field="api-key"
          placeholder="sk-or-..."
          autocomplete="off"
        />
        <span class="${P}hint">Get your key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a></span>

        <label class="${P}label" for="${P}model">Model</label>
        <select id="${P}model" class="${P}select" data-field="model">
          <option value="${DEFAULT_MODEL}">${DEFAULT_MODEL}</option>
        </select>

        <label class="${P}reasoning-row" hidden>
          <input type="checkbox" data-field="reasoning" />
          <span>Enable extended thinking (reasoning)</span>
        </label>
        <span class="${P}reasoning-hint">Current model does not support reasoning</span>

        <label class="${P}remember-row">
          <input type="checkbox" data-field="remember" />
          <span>Remember key across sessions</span>
        </label>
        <span class="${P}warning">Key is stored in this browser only. Uncheck to clear on tab close.</span>

        <div class="${P}error" hidden></div>

        <div class="${P}actions">
          <button type="button" data-action="cancel" class="${P}btn ${P}btn--secondary">Cancel</button>
          <button type="button" data-action="save" class="${P}btn ${P}btn--accent">Save</button>
        </div>
      </div>
    `;
    this.#injectStyles(backdrop);
    return backdrop;
  }

  /**
   * Inject modal styles.
   * @static
   * @param {HTMLElement} container
   */
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
        border-radius: 12px; padding: 24px; width: 420px; max-width: 90vw;
        max-height: 85vh; overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      }
      .${P}title { margin: 0 0 16px; font-size: 18px; font-weight: 600; }
      .${P}label {
        display: block; font-size: 13px; font-weight: 500;
        margin: 12px 0 4px; color: var(--text-high, #111);
      }
      .${P}input {
        width: 100%; padding: 7px 10px; border: 1px solid var(--border-medium, #ccc);
        border-radius: 6px; font-size: 13px; background: var(--surface-bg, #fff);
        color: var(--text-high, #111); box-sizing: border-box;
      }
      .${P}input:focus { outline: 2px solid var(--accent, #6366f1); outline-offset: -1px; }
      .${P}select {
        width: 100%; padding: 7px 10px; border: 1px solid var(--border-medium, #ccc);
        border-radius: 6px; font-size: 13px; background: var(--surface-bg, #fff);
        color: var(--text-high, #111); cursor: pointer; box-sizing: border-box;
      }
      .${P}hint {
        display: block; font-size: 12px; color: var(--text-medium, #666);
        margin: 4px 0 0;
      }
      .${P}hint a { color: var(--accent, #6366f1); }
      .${P}reasoning-row {
        display: flex; align-items: center; gap: 6px;
        margin: 14px 0 0; font-size: 13px; cursor: pointer;
      }
      .${P}reasoning-row input { margin: 0; }
      .${P}reasoning-hint {
        display: block; font-size: 11px; color: var(--text-medium, #888);
        margin: 4px 0 0;
      }
      .${P}remember-row {
        display: flex; align-items: center; gap: 6px;
        margin: 14px 0 0; font-size: 13px; cursor: pointer;
      }
      .${P}remember-row input { margin: 0; }
      .${P}warning {
        display: block; font-size: 11px; color: var(--text-medium, #888);
        margin: 4px 0 0;
      }
      .${P}error { font-size: 13px; color: #dc2626; margin: 10px 0; }
      .${P}actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px; padding-top: 12px; }
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
