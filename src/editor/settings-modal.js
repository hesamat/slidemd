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
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";
const DEFAULT_EFFORT = "high";
const P = "settings-modal__";

export class SettingsModal {
  static _currentBackdrop = null;
  /** @type {Map<string, {supported_efforts: string[]|null, mandatory: boolean}>} */
  static _modelReasoningMap = new Map();
  /** @type {Map<string, number|null>} */
  static _modelMaxOutputMap = new Map();
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

  static getModelMaxTokens(modelId) {
    return this._modelMaxOutputMap.get(modelId) || null;
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

      // Load saved values
      apiKeyInput.value = this.getApiKey();
      modelInput.value = selectedModel;
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
        const fragment = document.createDocumentFragment();
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
          item.addEventListener("mousedown", (e) => {
            e.preventDefault(); // Prevents blur from firing
            e.stopPropagation();
            selectedModel = m.id;
            closeDropdown();
            filterModels("");
            updateReasoningState();
          });
          fragment.appendChild(item);
        }
        if (filtered.length === 0) {
          const empty = document.createElement("div");
          empty.className = `${P}model-item ${P}model-item--empty`;
          empty.textContent = "No models found";
          fragment.appendChild(empty);
        }
        modelList.innerHTML = "";
        modelList.appendChild(fragment);
      };

      modelInput.addEventListener("focus", () => {
        modelInput.value = "";
        modelDropdown.hidden = false;
        dialog.style.overflowY = "hidden";
        filterModels("");
      });

      modelInput.addEventListener("input", () => {
        modelDropdown.hidden = false;
        dialog.style.overflowY = "hidden";
        filterModels(modelInput.value);
      });

      modelInput.addEventListener("blur", () => {
        // Restore selected model name when not searching
        modelInput.value = selectedModel;
      });

      const closeDropdown = () => {
        modelDropdown.hidden = true;
        dialog.style.overflowY = "";
        modelInput.value = selectedModel;
      };

      // Prevent clicks and wheel inside dropdown from propagating to dialog/backdrop
      modelDropdown.addEventListener("click", (e) => e.stopPropagation());
      modelDropdown.addEventListener("wheel", (e) => e.stopPropagation());

      // Close dropdown on click anywhere (dialog or backdrop)
      const handleOutsideClick = (e) => {
        if (!modelInput.contains(e.target) && !modelDropdown.contains(e.target)) {
          closeDropdown();
        }
      };
      dialog.addEventListener("click", handleOutsideClick);
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch("https://openrouter.ai/api/v1/models", { signal: controller.signal });
      clearTimeout(timeout);
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
        this._modelMaxOutputMap.set(m.id, m.top_provider?.max_completion_tokens ?? null);
      }

      // Ensure saved model is in the list
      if (!this._allModels.some((m) => m.id === saved)) {
        this._allModels.unshift({ id: saved, name: saved });
      }

      if (!this._modelReasoningMap.has(saved)) {
        this._modelReasoningMap.set(saved, { supported_efforts: null, mandatory: false });
      }
      if (!this._modelMaxOutputMap.has(saved)) {
        this._modelMaxOutputMap.set(saved, null);
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
    return backdrop;
  }

  static #escHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
