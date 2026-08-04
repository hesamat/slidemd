/**
 * SettingsModal
 *
 * Two-card settings modal:
 * - Connection card: provider, API key, base URL. Collapses to a status
 *   summary when configured; click Edit to expand.
 * - Model card: model selection, reasoning, effort. Always visible.
 * - Advanced section: remember key. Collapsed by default.
 *
 * API keys are stored per-provider so switching providers doesn't lose keys.
 * Keys live in sessionStorage by default; "Remember key" promotes to localStorage.
 */

import { OPENCODE_MODELS, OPENCODE_BASE_URL } from "../data/ai/opencode-models.js";

const STORAGE_KEY_MODEL = "webdeck_openrouter_model";
const STORAGE_KEY_REASONING = "webdeck_openrouter_reasoning";
const STORAGE_KEY_EFFORT = "webdeck_openrouter_effort";
const STORAGE_KEY_BASE_URL = "webdeck_ai_base_url";
const STORAGE_KEY_PROVIDER = "webdeck_ai_provider";
const REMEMBER_KEY = "webdeck_openrouter_remember";
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash-latest";
const DEFAULT_EFFORT = "high";
const DEFAULT_PROVIDER = "OpenRouter";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const P = "settings-modal__";

// Legacy key — used for one-time migration to per-provider storage
const LEGACY_KEY_API = "webdeck_openrouter_api_key";

const PROVIDER_DEFAULTS = {
  OpenRouter: "https://openrouter.ai/api/v1",
  OpenAI: "https://api.openai.com/v1",
  Anthropic: "https://api.anthropic.com",
  Gemini: "https://generativelanguage.googleapis.com/v1beta",
  OpenCode: OPENCODE_BASE_URL,
  Ollama: "http://localhost:11434/v1",
  "LM Studio": "http://localhost:1234/v1",
  Custom: "",
};

const KEY_REQUIRED_PROVIDERS = new Set(["OpenAI", "OpenRouter", "Anthropic", "Gemini", "OpenCode"]);

/**
 * Get the per-provider storage key for an API key.
 * @param {string} provider
 * @returns {string}
 */
function providerKeyStorageKey(provider) {
  return `webdeck_ai_key_${provider.toLowerCase().replace(/\s+/g, "_")}`;
}

export class SettingsModal {
  static _currentBackdrop = null;
  /** @type {Map<string, {supported_efforts: string[]|null, mandatory: boolean}>} */
  static _modelReasoningMap = new Map();
  /** @type {Map<string, number|null>} */
  static _modelMaxOutputMap = new Map();
  /** @type {Array<{id: string, name: string}>} */
  static _allModels = [];

  /**
   * Get the API key for a specific provider (or the current provider).
   * @param {string} [provider] — defaults to current provider
   * @returns {string}
   */
  static getApiKey(provider) {
    const prov = provider || this.getProvider();
    const key = providerKeyStorageKey(prov);
    try {
      return (
        sessionStorage.getItem(key) ||
        localStorage.getItem(key) ||
        // Migrate from legacy key (only for the default/OpenRouter provider)
        (prov === DEFAULT_PROVIDER
          ? sessionStorage.getItem(LEGACY_KEY_API) || localStorage.getItem(LEGACY_KEY_API) || ""
          : "")
      );
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

  static getBaseUrl() {
    try {
      return localStorage.getItem(STORAGE_KEY_BASE_URL) || DEFAULT_BASE_URL;
    } catch {
      return DEFAULT_BASE_URL;
    }
  }

  static getProvider() {
    try {
      return localStorage.getItem(STORAGE_KEY_PROVIDER) || DEFAULT_PROVIDER;
    } catch {
      return DEFAULT_PROVIDER;
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

  static requiresApiKey(provider) {
    return KEY_REQUIRED_PROVIDERS.has(provider);
  }

  static clearKey() {
    try {
      const prov = this.getProvider();
      const key = providerKeyStorageKey(prov);
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
      localStorage.removeItem(REMEMBER_KEY);
      sessionStorage.removeItem(LEGACY_KEY_API);
      localStorage.removeItem(LEGACY_KEY_API);
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
   * Mask an API key for display, showing only the last 4 characters.
   * @param {string} key
   * @returns {string}
   */
  static #maskKey(key) {
    if (!key) return "";
    if (key.length <= 4) return "••••";
    return "•".repeat(Math.min(20, key.length - 4)) + key.slice(-4);
  }

  /**
   * Show the settings modal.
   * @static
   * @returns {Promise<{ apiKey: string, model: string, reasoning: boolean, effort: string, baseUrl: string, provider: string }|null>}
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

      const dialog = backdrop.querySelector(`.${P}dialog`);
      const errorEl = backdrop.querySelector(`.${P}error`);

      // --- Connection card ---
      const connCard = backdrop.querySelector(`.${P}card--connection`);
      const connHeader = connCard.querySelector(`.${P}card-header`);
      const connBody = connCard.querySelector(`.${P}card-body`);
      const connSummary = connCard.querySelector(`.${P}card-summary-text`);
      const connStatus = connCard.querySelector(`.${P}card-status`);

      const providerSelect = connBody.querySelector('[data-field="provider"]');
      const apiKeyInput = connBody.querySelector('[data-field="api-key"]');
      const baseUrlInput = connBody.querySelector('[data-field="base-url"]');
      const baseOverrideCheckbox = connBody.querySelector('[data-field="base-override"]');

      // --- Model card ---
      const modelCard = backdrop.querySelector(`.${P}card--model`);
      const modelHeader = modelCard.querySelector(`.${P}card-header`);
      const modelBody = modelCard.querySelector(`.${P}card-body`);
      const modelSummary = modelCard.querySelector(`.${P}card-summary-text`);

      const modelInput = modelBody.querySelector(`.${P}model-input`);
      const modelDropdown = modelBody.querySelector(`.${P}model-dropdown`);
      const modelList = modelBody.querySelector(`.${P}model-list`);
      const fetchModelsBtn = modelBody.querySelector('[data-action="fetch-models"]');
      const reasoningCheckbox = modelBody.querySelector('[data-field="reasoning"]');
      const reasoningHint = modelBody.querySelector(`.${P}reasoning-hint`);
      const effortRow = modelBody.querySelector(`.${P}effort-row`);
      const effortSelect = modelBody.querySelector('[data-field="effort"]');

      // --- Remember key (inside connection body) ---
      const rememberCheckbox = connBody.querySelector('[data-field="remember"]');

      // --- Actions ---
      const saveBtn = backdrop.querySelector('[data-action="save"]');
      const cancelBtn = backdrop.querySelector('[data-action="cancel"]');

      dialog.addEventListener("click", (e) => e.stopPropagation());

      // State
      let selectedModel = this.getModel();
      let selectedProvider = this.getProvider();
      let selectedBaseUrl = this.getBaseUrl();
      let baseOverridden = false;

      // --- Card fold/unfold ---
      const updateConnSummary = () => {
        const provider = this.getProvider();
        const key = this.getApiKey(provider);
        connSummary.textContent = key
          ? `${provider} · ${this.#maskKey(key)}`
          : `${provider} · Not set`;
        connStatus.classList.toggle(`${P}card-status--ok`, !!key);
        connStatus.classList.toggle(`${P}card-status--off`, !key);
        connStatus.textContent = key ? "Connected" : "Not configured";
      };

      const updateModelSummary = () => {
        modelSummary.textContent = selectedModel || "Not set";
      };

      const toggleCard = (card, header, body, summaryEl, updateSummary, defaultOpen) => {
        let open = defaultOpen;
        const apply = () => {
          card.classList.toggle(`${P}card--open`, open);
          body.hidden = !open;
          summaryEl.hidden = open;
          if (open) {
            // Refresh summary for next collapse
            updateSummary();
          }
        };
        header.addEventListener("click", () => {
          open = !open;
          apply();
        });
        apply();
      };

      const wasConfigured = this.isConfigured();

      toggleCard(
        connCard,
        connHeader,
        connBody,
        connSummary,
        updateConnSummary,
        !wasConfigured, // open if not configured
      );
      toggleCard(
        modelCard,
        modelHeader,
        modelBody,
        modelSummary,
        updateModelSummary,
        true, // model card open by default
      );

      // --- Load form values ---
      apiKeyInput.value = this.getApiKey(selectedProvider);
      providerSelect.value = selectedProvider;
      baseUrlInput.value = selectedBaseUrl;
      modelInput.value = selectedModel;
      effortSelect.value = this.getEffort();

      let remembered = false;
      try {
        remembered = localStorage.getItem(REMEMBER_KEY) === "true";
      } catch {
        // ignore
      }
      rememberCheckbox.checked = remembered;

      // --- Helpers ---
      const updateBaseUrlEditability = () => {
        const editable = selectedProvider === "Custom" || baseOverridden;
        baseUrlInput.readOnly = !editable;
        baseUrlInput.classList.toggle(`${P}input--readonly`, !editable);
      };

      const applyProviderDefaults = () => {
        if (selectedProvider === "Custom") {
          baseOverridden = true;
          baseOverrideCheckbox.checked = true;
          baseUrlInput.value = selectedBaseUrl;
        } else if (!baseOverridden) {
          baseUrlInput.value = PROVIDER_DEFAULTS[selectedProvider] || "";
        }
        selectedBaseUrl = baseUrlInput.value;
        updateBaseUrlEditability();
      };

      const isModelSearchProvider = () =>
        selectedProvider === "OpenRouter" ||
        selectedProvider === "OpenAI" ||
        selectedProvider === "OpenCode";

      const isFetchModelsSupported = () =>
        selectedProvider === "OpenRouter" ||
        selectedProvider === "OpenAI" ||
        selectedProvider === "Ollama" ||
        selectedProvider === "LM Studio";

      // --- Model dropdown ---
      const filterModels = (query) => {
        const q = query.toLowerCase();
        const fragment = document.createDocumentFragment();
        const filtered = this._allModels.filter(
          (m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
        );
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
            e.preventDefault();
            e.stopPropagation();
            selectedModel = m.id;
            updateModelSummary();
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

      const openDropdown = () => {
        modelDropdown.hidden = false;
        // Position the dropdown with fixed coordinates so it escapes
        // the dialog's overflow clipping.
        const rect = modelInput.getBoundingClientRect();
        modelDropdown.style.position = "fixed";
        modelDropdown.style.left = `${rect.left}px`;
        modelDropdown.style.top = `${rect.bottom + 2}px`;
        modelDropdown.style.width = `${rect.width}px`;
      };

      const closeDropdown = () => {
        modelDropdown.hidden = true;
        modelInput.value = selectedModel;
      };

      const updateReasoningState = () => {
        const supports = this.modelSupportsReasoning(selectedModel);
        reasoningCheckbox.disabled = !supports;
        if (!supports) {
          reasoningCheckbox.checked = false;
        }
        reasoningHint.hidden = supports;

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

      const fetchModels = async () => {
        fetchModelsBtn.disabled = true;
        errorEl.hidden = true;
        try {
          const baseUrl = (selectedBaseUrl || "").replace(/\/+$/, "");
          const modelKey = apiKeyInput.value.trim();
          const headers = {};
          if (modelKey) headers.Authorization = `Bearer ${modelKey}`;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          const res = await fetch(`${baseUrl}/models`, { headers, signal: controller.signal });
          clearTimeout(timeout);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const models = Array.isArray(data.data)
            ? data.data
            : Array.isArray(data.models)
              ? data.models
              : Array.isArray(data)
                ? data
                : [];

          this._allModels = [];
          this._modelReasoningMap.clear();
          this._modelMaxOutputMap.clear();

          for (const m of models) {
            const id = m.id || m.model || String(m);
            const name = m.name || id;
            this._allModels.push({ id, name });
            if (m.reasoning) {
              this._modelReasoningMap.set(id, {
                supported_efforts: m.reasoning.supported_efforts || null,
                mandatory: m.reasoning.mandatory || false,
              });
            }
            this._modelMaxOutputMap.set(id, m.top_provider?.max_completion_tokens ?? null);
          }

          if (this._allModels.length === 0) {
            throw new Error("No models returned");
          }

          openDropdown();
          filterModels("");
        } catch (err) {
          errorEl.textContent = `Could not fetch models: ${err.message}`;
          errorEl.hidden = false;
        } finally {
          fetchModelsBtn.disabled = false;
        }
      };

      const populateOpenCodeModels = () => {
        this._allModels = OPENCODE_MODELS.map((m) => ({ id: m.id, name: m.name }));
        this._modelReasoningMap.clear();
        this._modelMaxOutputMap.clear();
        if (!this._allModels.some((m) => m.id === selectedModel)) {
          selectedModel = this._allModels[0]?.id || selectedModel;
          modelInput.value = selectedModel;
        }
      };

      // --- Provider / base URL handlers ---
      providerSelect.addEventListener("change", () => {
        selectedProvider = providerSelect.value;
        applyProviderDefaults();
        apiKeyInput.value = this.getApiKey(selectedProvider);
        fetchModelsBtn.hidden = !isFetchModelsSupported();

        if (selectedProvider === "OpenCode") {
          populateOpenCodeModels();
          updateReasoningState();
        } else if (isModelSearchProvider()) {
          this.#populateOpenRouterModels(() => {
            filterModels("");
            const savedReasoning = this.getReasoning();
            const supports = this.modelSupportsReasoning(selectedModel);
            reasoningCheckbox.checked = savedReasoning && supports;
            updateReasoningState();
          });
        } else {
          updateReasoningState();
        }
      });

      baseOverrideCheckbox.addEventListener("change", () => {
        baseOverridden = baseOverrideCheckbox.checked;
        updateBaseUrlEditability();
        if (!baseOverridden) {
          baseUrlInput.value = PROVIDER_DEFAULTS[selectedProvider] || "";
          selectedBaseUrl = baseUrlInput.value;
        }
      });

      baseUrlInput.addEventListener("input", () => {
        selectedBaseUrl = baseUrlInput.value.trim();
      });

      fetchModelsBtn.addEventListener("click", fetchModels);

      // --- Model input interactions ---
      modelInput.addEventListener("focus", () => {
        if (isModelSearchProvider()) {
          modelInput.value = "";
          openDropdown();
          filterModels("");
        }
      });

      modelInput.addEventListener("input", () => {
        if (isModelSearchProvider()) {
          openDropdown();
          filterModels(modelInput.value);
        } else {
          selectedModel = modelInput.value.trim();
          updateReasoningState();
        }
      });

      modelInput.addEventListener("blur", () => {
        modelInput.value = selectedModel;
      });

      modelDropdown.addEventListener("click", (e) => e.stopPropagation());
      modelDropdown.addEventListener("wheel", (e) => e.stopPropagation());

      // Reposition dropdown on scroll/resize while open
      const repositionDropdown = () => {
        if (modelDropdown.hidden) return;
        const rect = modelInput.getBoundingClientRect();
        modelDropdown.style.left = `${rect.left}px`;
        modelDropdown.style.top = `${rect.bottom + 2}px`;
        modelDropdown.style.width = `${rect.width}px`;
      };
      window.addEventListener("scroll", repositionDropdown, true);
      window.addEventListener("resize", repositionDropdown);

      const handleOutsideClick = (e) => {
        if (
          !modelInput.contains(e.target) &&
          !modelDropdown.contains(e.target) &&
          !fetchModelsBtn.contains(e.target)
        ) {
          closeDropdown();
        }
      };
      dialog.addEventListener("click", handleOutsideClick);
      backdrop.addEventListener("click", handleOutsideClick);

      // --- Initial population ---
      fetchModelsBtn.hidden = !isFetchModelsSupported();

      if (selectedProvider === "OpenCode") {
        populateOpenCodeModels();
        updateReasoningState();
      } else if (isModelSearchProvider()) {
        this.#populateOpenRouterModels(() => {
          filterModels("");
          const savedReasoning = this.getReasoning();
          const supports = this.modelSupportsReasoning(selectedModel);
          reasoningCheckbox.checked = savedReasoning && supports;
          updateReasoningState();
        });
      } else {
        updateReasoningState();
      }

      applyProviderDefaults();

      // --- Save / Cancel ---
      const showError = (msg) => {
        errorEl.textContent = msg;
        errorEl.hidden = false;
      };

      saveBtn.addEventListener("click", () => {
        const apiKey = apiKeyInput.value.trim();
        const remember = rememberCheckbox.checked;
        const reasoning = reasoningCheckbox.checked && this.modelSupportsReasoning(selectedModel);
        const effort = effortSelect.value || DEFAULT_EFFORT;

        if (!apiKey && this.requiresApiKey(selectedProvider)) {
          showError(`API key is required for ${selectedProvider}`);
          return;
        }

        const keyStorage = providerKeyStorageKey(selectedProvider);

        try {
          sessionStorage.setItem(keyStorage, apiKey);
          sessionStorage.setItem(STORAGE_KEY_MODEL, selectedModel);
          sessionStorage.setItem(STORAGE_KEY_REASONING, String(reasoning));
          sessionStorage.setItem(STORAGE_KEY_EFFORT, effort);

          localStorage.setItem(STORAGE_KEY_BASE_URL, selectedBaseUrl);
          localStorage.setItem(STORAGE_KEY_PROVIDER, selectedProvider);

          if (remember) {
            localStorage.setItem(keyStorage, apiKey);
            localStorage.setItem(STORAGE_KEY_MODEL, selectedModel);
            localStorage.setItem(STORAGE_KEY_REASONING, String(reasoning));
            localStorage.setItem(STORAGE_KEY_EFFORT, effort);
            localStorage.setItem(REMEMBER_KEY, "true");
          } else {
            localStorage.removeItem(keyStorage);
            localStorage.removeItem(STORAGE_KEY_MODEL);
            localStorage.removeItem(STORAGE_KEY_REASONING);
            localStorage.removeItem(STORAGE_KEY_EFFORT);
            localStorage.removeItem(REMEMBER_KEY);
          }

          if (selectedProvider === DEFAULT_PROVIDER) {
            sessionStorage.removeItem(LEGACY_KEY_API);
            localStorage.removeItem(LEGACY_KEY_API);
          }
        } catch {
          // ignore
        }

        cleanup();
        restoreScroll();
        backdrop.remove();
        this._currentBackdrop = null;
        resolve({
          apiKey,
          model: selectedModel,
          reasoning,
          effort,
          baseUrl: selectedBaseUrl,
          provider: selectedProvider,
        });
      });

      const cleanup = () => {
        window.removeEventListener("scroll", repositionDropdown, true);
        window.removeEventListener("resize", repositionDropdown);
      };

      cancelBtn.addEventListener("click", () => {
        cleanup();
        restoreScroll();
        backdrop.remove();
        this._currentBackdrop = null;
        resolve(null);
      });

      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) {
          cleanup();
          restoreScroll();
          backdrop.remove();
          this._currentBackdrop = null;
          resolve(null);
        }
      });
    });
  }

  static async #populateOpenRouterModels(onLoaded) {
    if (this._allModels.length > 0) {
      onLoaded?.();
      return;
    }

    const saved = this.getModel();
    this._allModels = [{ id: saved, name: saved }];

    try {
      const baseUrl = (this.getBaseUrl() || DEFAULT_BASE_URL).replace(/\/+$/, "");
      const modelKey = this.getApiKey();
      const headers = {};
      if (modelKey) headers.Authorization = `Bearer ${modelKey}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${baseUrl}/models`, { headers, signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return;
      const data = await res.json();
      const models = Array.isArray(data.data) ? data.data : [];

      this._allModels = [];
      for (const m of models) {
        const id = m.id || m.model || String(m);
        const name = m.name || id;
        this._allModels.push({ id, name });
        if (m.reasoning) {
          this._modelReasoningMap.set(id, {
            supported_efforts: m.reasoning.supported_efforts || null,
            mandatory: m.reasoning.mandatory || false,
          });
        }
        this._modelMaxOutputMap.set(id, m.top_provider?.max_completion_tokens ?? null);
      }

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

        <!-- Connection card -->
        <div class="${P}card ${P}card--connection">
          <div class="${P}card-header">
            <span class="${P}chevron"></span>
            <span class="${P}card-title">Connection</span>
            <span class="${P}card-summary-text" hidden></span>
            <span class="${P}card-status"></span>
          </div>
          <div class="${P}card-body" hidden>
            <label class="${P}label" for="${P}provider">Provider</label>
            <select id="${P}provider" class="${P}select" data-field="provider">
              <option>OpenRouter</option>
              <option>OpenAI</option>
              <option>Anthropic</option>
              <option>Gemini</option>
              <option>OpenCode</option>
              <option>Ollama</option>
              <option>LM Studio</option>
              <option>Custom</option>
            </select>

            <label class="${P}label" for="${P}api-key">API Key</label>
            <input
              id="${P}api-key"
              class="${P}input"
              type="password"
              data-field="api-key"
              placeholder="sk-..."
              autocomplete="off"
            />

            <div class="${P}base-row">
              <label class="${P}label" for="${P}base-url">Base URL</label>
              <input
                id="${P}base-url"
                class="${P}input"
                type="text"
                data-field="base-url"
                placeholder="https://..."
              />
              <label class="${P}checkbox-row">
                <input type="checkbox" data-field="base-override" />
                <span>Use custom base URL instead of provider default</span>
              </label>
            </div>

            <label class="${P}checkbox-row">
              <input type="checkbox" data-field="remember" />
              <span>Remember key across sessions</span>
            </label>
            <span class="${P}warning">Key is stored in this browser only.</span>
          </div>
        </div>

        <!-- Model card -->
        <div class="${P}card ${P}card--model">
          <div class="${P}card-header">
            <span class="${P}chevron"></span>
            <span class="${P}card-title">Model</span>
            <span class="${P}card-summary-text" hidden></span>
          </div>
          <div class="${P}card-body" hidden>
            <div class="${P}model-wrapper">
              <input
                class="${P}input ${P}model-input"
                type="text"
                placeholder="Type to search or enter model ID..."
                autocomplete="off"
              />
              <button type="button" data-action="fetch-models" class="${P}btn ${P}btn--secondary ${P}fetch-btn">Fetch</button>
              <div class="${P}model-dropdown" hidden>
                <div class="${P}model-list"></div>
              </div>
            </div>

            <label class="${P}checkbox-row">
              <input type="checkbox" data-field="reasoning" disabled />
              <span>Enable extended thinking (reasoning)</span>
            </label>
            <span class="${P}reasoning-hint">Selected model does not support reasoning</span>

            <div class="${P}effort-row" hidden>
              <label class="${P}label">Reasoning Effort</label>
              <select class="${P}select" data-field="effort"></select>
            </div>
          </div>
        </div>

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
