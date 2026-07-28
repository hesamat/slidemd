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
const STORAGE_KEY_EFFORT = "webdeck_openrouter_effort";
const REMEMBER_KEY = "webdeck_openrouter_remember";
const DEFAULT_MODEL = "xiaomi/mimo-v2.5-pro";
const DEFAULT_EFFORT = "high";
const P = "settings-modal__";

export class SettingsModal {
  static _currentBackdrop = null;
  /** @type {Map<string, {supported_efforts: string[]|null, mandatory: boolean}>} */
  static _modelReasoningMap = new Map();
  /** @type {Array<{id: string, name: string}>} */
  static _allModels = [];

  static getApiKey() {
    try {
      return sessionStorage.getItem(STORAGE_KEY_API) || localStorage.getItem(STORAGE_KEY_API) || "";
    } catch {
      return "";
    }
  }

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

  static getEffort() {
    try {
      return (
        sessionStorage.getItem(STORAGE_KEY_EFFORT) ||
        localStorage.getItem(STORAGE_KEY_EFFORT) ||
        DEFAULT_EFFORT
      );
    } catch {
      return DEFAULT_EFFORT;
    }
  }

  static modelSupportsReasoning(modelId) {
    const info = this._modelReasoningMap.get(modelId);
    if (!info) return false;
    return Array.isArray(info.supported_efforts) && info.supported_efforts.length > 0;
  }

  static getSupportedEfforts(modelId) {
    const info = this._modelReasoningMap.get(modelId);
    if (!info || !info.supported_efforts) return [];
    return info.supported_efforts;
  }

  static isConfigured() {
    return !!this.getApiKey();
  }

  static clearKey() {
    try {
      sessionStorage.removeItem(STORAGE_KEY_API);
      localStorage.removeItem(STORAGE_KEY_API);
      localStorage.removeItem(REMEMBER_KEY);
    } catch {
      // ignore
    }
  }

  static close() {
    if (this._currentBackdrop) {
      document.body.style.overflow = "";
      this._currentBackdrop.remove();
      this._currentBackdrop = null;
    }
  }

  /**
   * Show the settings modal.
   * @static
   * @returns {Promise<{ apiKey: string, model: string, reasoning: boolean, effort: string }|null>}
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
      const modelInput = backdrop.querySelector(`.${P}model-input`);
      const modelDropdown = backdrop.querySelector(`.${P}model-dropdown`);
      const modelList = backdrop.querySelector(`.${P}model-list`);
      const modelValue = backdrop.querySelector(`.${P}model-value`);
      const rememberCheckbox = backdrop.querySelector('[data-field="remember"]');
      const reasoningCheckbox = backdrop.querySelector('[data-field="reasoning"]');
      const reasoningHint = backdrop.querySelector(`.${P}reasoning-hint`);
      const effortRow = backdrop.querySelector(`.${P}effort-row`);
      const effortSelect = backdrop.querySelector('[data-field="effort"]');
      const saveBtn = backdrop.querySelector('[data-action="save"]');
      const cancelBtn = backdrop.querySelector('[data-action="cancel"]');
      const dialog = backdrop.querySelector(`.${P}dialog`);
      const errorEl = backdrop.querySelector(`.${P}error`);

      dialog.addEventListener("click", (e) => e.stopPropagation());

      // State
      let selectedModel = this.getModel();
      let modelsLoaded = false;

      // Load saved values
      apiKeyInput.value = this.getApiKey();
      modelValue.textContent = selectedModel;
      effortSelect.value = this.getEffort();

      // Restore "remember" state
      let remembered = false;
      try {
        remembered = localStorage.getItem(REMEMBER_KEY) === "true";
      } catch {
        // ignore
      }
      rememberCheckbox.checked = remembered;

      // --- Model search dropdown ---
      const filterModels = (query) => {
        const q = query.toLowerCase();
        modelList.innerHTML = "";
        const filtered = this._allModels.filter(
          (m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
        );
        // Always show selected model first
        const selectedIdx = filtered.findIndex((m) => m.id === selectedModel);
        if (selectedIdx > 0) {
          const [sel] = filtered.splice(selectedIdx, 1);
          filtered.unshift(sel);
        } else if (selectedIdx < 0 && selectedModel) {
          filtered.unshift({ id: selectedModel, name: selectedModel });
        }
        for (const m of filtered) {
          const item = document.createElement("div");
          item.className = `${P}model-item`;
          if (m.id === selectedModel) item.classList.add(`${P}model-item--selected`);
          item.dataset.value = m.id;
          item.innerHTML = `<span class="${P}model-name">${this.#escHtml(m.name)}</span><span class="${P}model-id">${this.#escHtml(m.id)}</span>`;
          item.addEventListener("click", () => {
            selectedModel = m.id;
            modelValue.textContent = m.id;
            modelInput.value = "";
            modelDropdown.hidden = true;
            filterModels("");
            updateReasoningState();
          });
          modelList.appendChild(item);
        }
        if (modelList.children.length === 0) {
          const empty = document.createElement("div");
          empty.className = `${P}model-item ${P}model-item--empty`;
          empty.textContent = "No models found";
          modelList.appendChild(empty);
        }
      };

      modelInput.addEventListener("focus", () => {
        modelDropdown.hidden = false;
        filterModels(modelInput.value);
      });

      modelInput.addEventListener("input", () => {
        modelDropdown.hidden = false;
        filterModels(modelInput.value);
      });

      // Close dropdown on outside click
      const handleOutsideClick = (e) => {
        if (!modelInput.contains(e.target) && !modelDropdown.contains(e.target)) {
          modelDropdown.hidden = true;
          modelInput.value = "";
        }
      };
      backdrop.addEventListener("click", handleOutsideClick);

      // --- Reasoning state ---
      const updateReasoningState = () => {
        const supports = this.modelSupportsReasoning(selectedModel);
        reasoningCheckbox.disabled = !supports;
        if (!supports) {
          reasoningCheckbox.checked = false;
        }
        reasoningHint.hidden = supports;

        // Populate effort dropdown
        const efforts = this.getSupportedEfforts(selectedModel);
        effortSelect.innerHTML = "";
        if (efforts.length > 0) {
          for (const e of efforts) {
            const opt = document.createElement("option");
            opt.value = e;
            opt.textContent = e;
            effortSelect.appendChild(opt);
          }
          const savedEffort = this.getEffort();
          effortSelect.value = efforts.includes(savedEffort) ? savedEffort : efforts[0];
          effortRow.hidden = false;
        } else {
          effortRow.hidden = true;
        }
      };

      // --- Populate models ---
      this.#populateModels(() => {
        modelsLoaded = true;
        filterModels("");
        const savedReasoning = this.getReasoning();
        const supports = this.modelSupportsReasoning(selectedModel);
        reasoningCheckbox.checked = savedReasoning && supports;
        updateReasoningState();
      });

      const showError = (msg) => {
        errorEl.textContent = msg;
        errorEl.hidden = false;
      };

      saveBtn.addEventListener("click", () => {
        const apiKey = apiKeyInput.value.trim();
        const remember = rememberCheckbox.checked;
        const reasoning = reasoningCheckbox.checked && this.modelSupportsReasoning(selectedModel);
        const effort = effortSelect.value || DEFAULT_EFFORT;

        if (!apiKey) {
          showError("API key is required");
          return;
        }

        try {
          sessionStorage.setItem(STORAGE_KEY_API, apiKey);
          sessionStorage.setItem(STORAGE_KEY_MODEL, selectedModel);
          sessionStorage.setItem(STORAGE_KEY_REASONING, String(reasoning));
          sessionStorage.setItem(STORAGE_KEY_EFFORT, effort);

          if (remember) {
            localStorage.setItem(STORAGE_KEY_API, apiKey);
            localStorage.setItem(STORAGE_KEY_MODEL, selectedModel);
            localStorage.setItem(STORAGE_KEY_REASONING, String(reasoning));
            localStorage.setItem(STORAGE_KEY_EFFORT, effort);
            localStorage.setItem(REMEMBER_KEY, "true");
          } else {
            localStorage.removeItem(STORAGE_KEY_API);
            localStorage.removeItem(STORAGE_KEY_MODEL);
            localStorage.removeItem(STORAGE_KEY_REASONING);
            localStorage.removeItem(STORAGE_KEY_EFFORT);
            localStorage.removeItem(REMEMBER_KEY);
          }
        } catch {
          // ignore
        }

        restoreScroll();
        backdrop.remove();
        this._currentBackdrop = null;
        resolve({ apiKey, model: selectedModel, reasoning, effort });
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

  static async #populateModels(onLoaded) {
    if (this._allModels.length > 0) {
      onLoaded?.();
      return;
    }

    const saved = this.getModel();
    this._allModels = [{ id: saved, name: saved }];

    try {
      const res = await fetch("https://openrouter.ai/api/v1/models");
      if (!res.ok) return;
      const data = await res.json();
      const models = data.data || [];

      this._allModels = [];
      for (const m of models) {
        this._allModels.push({ id: m.id, name: m.name || m.id });
        if (m.reasoning) {
          this._modelReasoningMap.set(m.id, {
            supported_efforts: m.reasoning.supported_efforts || null,
            mandatory: m.reasoning.mandatory || false,
          });
        }
      }

      // Ensure saved model is in the list
      if (!this._allModels.some((m) => m.id === saved)) {
        this._allModels.unshift({ id: saved, name: saved });
      }

      if (!this._modelReasoningMap.has(saved)) {
        this._modelReasoningMap.set(saved, { supported_efforts: null, mandatory: false });
      }
    } catch {
      // ignore
    }

    onLoaded?.();
  }

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

        <label class="${P}label">Model</label>
        <div class="${P}model-wrapper">
          <input
            class="${P}input ${P}model-input"
            type="text"
            placeholder="Type to search models..."
            autocomplete="off"
          />
          <div class="${P}model-value"></div>
          <div class="${P}model-dropdown" hidden>
            <div class="${P}model-list"></div>
          </div>
        </div>

        <label class="${P}reasoning-row">
          <input type="checkbox" data-field="reasoning" disabled />
          <span>Enable extended thinking (reasoning)</span>
        </label>
        <span class="${P}reasoning-hint">Selected model does not support reasoning</span>

        <div class="${P}effort-row" hidden>
          <label class="${P}label">Reasoning Effort</label>
          <select class="${P}select" data-field="effort"></select>
        </div>

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

  static #escHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
        border-radius: 12px; padding: 24px; width: 440px; max-width: 90vw;
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
      .${P}hint {
        display: block; font-size: 12px; color: var(--text-medium, #666);
        margin: 4px 0 0;
      }
      .${P}hint a { color: var(--accent, #6366f1); }
      .${P}select {
        width: 100%; padding: 7px 10px; border: 1px solid var(--border-medium, #ccc);
        border-radius: 6px; font-size: 13px; background: var(--surface-bg, #fff);
        color: var(--text-high, #111); cursor: pointer; box-sizing: border-box;
      }
      .${P}model-wrapper { position: relative; }
      .${P}model-input { cursor: text; }
      .${P}model-value {
        display: none;
      }
      .${P}model-dropdown {
        position: absolute; top: 100%; left: 0; right: 0;
        max-height: 240px; overflow-y: auto;
        border: 1px solid var(--border-medium, #ccc);
        border-top: none; border-radius: 0 0 6px 6px;
        background: var(--surface-bg, #fff);
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10;
      }
      .${P}model-list { max-height: 240px; overflow-y: auto; }
      .${P}model-item {
        padding: 8px 10px; cursor: pointer;
        display: flex; flex-direction: column; gap: 1px;
        border-bottom: 1px solid var(--border-light, rgba(0,0,0,0.05));
        transition: background 0.1s;
      }
      .${P}model-item:hover { background: var(--surface-hover, #f0f0f0); }
      .${P}model-item--selected { background: var(--accent-bg, rgba(99,102,241,0.08)); }
      .${P}model-item--empty {
        padding: 12px 10px; color: var(--text-medium, #888);
        font-style: italic; cursor: default; justify-content: center;
      }
      .${P}model-name { font-size: 13px; color: var(--text-high, #111); }
      .${P}model-id { font-size: 11px; color: var(--text-medium, #888); }
      .${P}reasoning-row {
        display: flex; align-items: center; gap: 6px;
        margin: 14px 0 0; font-size: 13px; cursor: pointer;
      }
      .${P}reasoning-row input { margin: 0; }
      .${P}reasoning-row input:disabled + span { color: var(--text-medium, #888); cursor: not-allowed; }
      .${P}reasoning-hint {
        display: block; font-size: 11px; color: var(--text-medium, #888);
        margin: 4px 0 0;
      }
      .${P}effort-row { margin: 10px 0 0; }
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
