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

// SettingsModal no longer supports OpenCode due to CORS and endpoint issues.

import { validateAiBaseUrl, KEY_REQUIRED_PROVIDERS } from "../data/ai/ai-provider-client.js";
import { modalOpened, modalClosed } from "../core/modal-state.js";
import { ThemeManager, PALETTES, PALETTE_LABELS } from "../renderer/theme-manager.js";

const STORAGE_KEY_BASE_URL = "webdeck_ai_base_url";
const STORAGE_KEY_BASE_OVERRIDE = "webdeck_ai_base_override";
const STORAGE_KEY_PROVIDER = "webdeck_ai_provider";
const REMEMBER_KEY = "webdeck_openrouter_remember";
const DEFAULT_MODEL = "~deepseek/deepseek-v4-flash-latest";
const DEFAULT_EFFORT = "high";
const DEFAULT_PROVIDER = "OpenRouter";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const P = "settings-modal__";

const SUN_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;
const MOON_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

// Legacy key — used for one-time migration to per-provider storage
const LEGACY_KEY_API = "webdeck_openrouter_api_key";

const PROVIDER_DEFAULTS = {
  OpenRouter: "https://openrouter.ai/api/v1",
  OpenAI: "https://api.openai.com/v1",
  Anthropic: "https://api.anthropic.com",
  Gemini: "https://generativelanguage.googleapis.com/v1beta",
  Ollama: "http://localhost:11434/v1",
  "LM Studio": "http://localhost:1234/v1",
  Custom: "",
};

// KEY_REQUIRED_PROVIDERS is imported from ai-provider-client.js (canonical source).

/**
 * Get the per-provider storage key for an API key.
 * @param {string} provider
 * @returns {string}
 */
function providerKeyStorageKey(provider) {
  return `webdeck_ai_key_${provider.toLowerCase().replace(/\s+/g, "_")}`;
}

function providerModelStorageKey(provider) {
  return `webdeck_ai_model_${provider.toLowerCase().replace(/\s+/g, "_")}`;
}

function providerReasoningStorageKey(provider) {
  return `webdeck_ai_reasoning_${provider.toLowerCase().replace(/\s+/g, "_")}`;
}

function providerEffortStorageKey(provider) {
  return `webdeck_ai_effort_${provider.toLowerCase().replace(/\s+/g, "_")}`;
}

/**
 * Best-effort reasoning metadata for models that don't advertise it in the
 * /models endpoint. Used for OpenAI's o-series and other reasoning models.
 * @param {string} modelId
 * @returns {{supported_efforts: string[], mandatory: boolean}|null}
 */
function guessReasoningForModel(modelId) {
  const id = modelId.toLowerCase();
  const reasoningPatterns = [
    /(?:^|[-/_])o\d+/, // o1, o3, o4, o1-preview, openai/o1-mini, etc.
    /(?:^|[-/_])gpt[-_]5/, // gpt-5 family
    /deepseek[-_]r1/,
    /deepseek[-_]reasoner/,
    /claude[-_]3[-_]7[-_]sonnet/,
    /claude[-_]4/,
    /claude[-_]sonnet[-_]4/,
    /gemini[-_]2\.5[-_]pro/,
    /grok[-_]3/,
    /qwen3/,
    /reasoning/,
    /r1/,
    /thinking/,
  ];
  // This is a best-effort fallback when the /models endpoint does not expose
  // reasoning metadata. The provider's API still controls which values are valid.
  if (reasoningPatterns.some((p) => p.test(id))) {
    return { supported_efforts: ["low", "medium", "high"], mandatory: false };
  }
  return null;
}

/**
 * Check whether a provider-supplied `reasoning` object carries meaningful
 * metadata. A bare `{}` is truthy but conveys no information — some providers
 * include an empty reasoning field for non-reasoning models. Only accept
 * objects with at least one own property so the reasoning toggle doesn't
 * appear for models that can't actually use it.
 * @param {*} reasoning
 * @returns {boolean}
 */
function isMeaningfulReasoning(reasoning) {
  return reasoning != null && typeof reasoning === "object" && Object.keys(reasoning).length > 0;
}

export class SettingsModal {
  static _currentBackdrop = null;
  /** @type {string|null} — which provider the current cache belongs to */
  static _cachedProvider = null;
  /** @type {Map<string, {supported_efforts: string[]|null, mandatory: boolean}>} */
  static _modelReasoningMap = new Map();
  /** @type {Map<string, number|null>} */
  static _modelMaxOutputMap = new Map();
  /** @type {Array<{id: string, name: string}>} */
  static _allModels = [];
  static _loadingModels = false;
  static _lastModelError = "";

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

  static getModel(provider) {
    const prov = provider || this.getProvider();
    const key = providerModelStorageKey(prov);
    try {
      return (
        sessionStorage.getItem(key) ||
        localStorage.getItem(key) ||
        (prov === DEFAULT_PROVIDER ? DEFAULT_MODEL : "")
      );
    } catch {
      return prov === DEFAULT_PROVIDER ? DEFAULT_MODEL : "";
    }
  }

  static getReasoning(provider) {
    const prov = provider || this.getProvider();
    const key = providerReasoningStorageKey(prov);
    try {
      const val = sessionStorage.getItem(key) || localStorage.getItem(key);
      return val === "true";
    } catch {
      return false;
    }
  }

  static getEffort(provider) {
    const prov = provider || this.getProvider();
    const key = providerEffortStorageKey(prov);
    try {
      return sessionStorage.getItem(key) || localStorage.getItem(key) || DEFAULT_EFFORT;
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

  static getBaseOverride() {
    try {
      return localStorage.getItem(STORAGE_KEY_BASE_OVERRIDE) === "true";
    } catch {
      return false;
    }
  }

  static setBaseOverride(value) {
    try {
      if (value) {
        localStorage.setItem(STORAGE_KEY_BASE_OVERRIDE, "true");
      } else {
        localStorage.removeItem(STORAGE_KEY_BASE_OVERRIDE);
      }
    } catch {
      // ignore
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
    // Presence in the reasoning map means the model exposes a `reasoning`
    // object (from the /models endpoint or the best-effort heuristic). Such
    // models support reasoning even when supported_efforts is null (all
    // efforts accepted) or omitted (effort selection not exposed — use
    // reasoning.enabled instead, e.g. xiaomi/mimo-v2.5).
    return this._modelReasoningMap.has(modelId);
  }

  static getSupportedEfforts(modelId) {
    const info = this._modelReasoningMap.get(modelId);
    if (!info) return [];
    if (info.supported_efforts === null) return ["low", "medium", "high"];
    if (!info.supported_efforts) return [];
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
      modalClosed();
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
      modalOpened();

      document.body.style.overflow = "hidden";

      const dialog = backdrop.querySelector(`.${P}dialog`);
      const errorEl = backdrop.querySelector(`.${P}error`);

      // --- Appearance card ---
      const appearanceCard = backdrop.querySelector(`.${P}card--appearance`);
      const appearanceHeader = appearanceCard.querySelector(`.${P}card-header`);
      const appearanceBody = appearanceCard.querySelector(`.${P}card-body`);
      const appearanceSummary = appearanceCard.querySelector(`.${P}card-summary-text`);
      const themeModeBtns = appearanceBody.querySelectorAll("[data-theme-mode]");
      const variantBtns = appearanceBody.querySelectorAll("[data-palette]");

      /** @type {"light"|"dark"} */
      let selectedTheme = ThemeManager.getCurrentTheme();
      /** @type {string} */
      let selectedPalette = ThemeManager.getPalette();

      const updateAppearanceSummary = () => {
        const themeLabel = selectedTheme === "dark" ? "Dark" : "Light";
        appearanceSummary.textContent = `${themeLabel} · ${PALETTE_LABELS[selectedPalette]}`;
        appearanceSummary.hidden = false;
      };

      const updateThemeModeButtons = () => {
        themeModeBtns.forEach((btn) => {
          btn.classList.toggle(
            `${P}theme-mode-btn--active`,
            btn.dataset.themeMode === selectedTheme,
          );
        });
      };

      const updateVariantButtons = () => {
        variantBtns.forEach((btn) => {
          btn.classList.toggle(`${P}variant-btn--active`, btn.dataset.palette === selectedPalette);
        });
      };

      const applyAppearanceLive = () => {
        // Live preview: apply immediately so user sees the change
        localStorage.setItem(ThemeManager.THEME_KEY, selectedTheme);
        ThemeManager.applyTheme(selectedTheme);
        ThemeManager.setPalette(selectedPalette);
        updateThemeModeButtons();
        updateVariantButtons();
        updateAppearanceSummary();
      };

      themeModeBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          selectedTheme = /** @type {"light"|"dark"} */ (btn.dataset.themeMode);
          applyAppearanceLive();
        });
      });

      variantBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          selectedPalette = btn.dataset.palette;
          applyAppearanceLive();
        });
      });

      // Card fold/unfold
      appearanceHeader.addEventListener("click", () => {
        const open = appearanceCard.classList.toggle(`${P}card--open`);
        appearanceBody.hidden = !open;
      });

      // Initialize appearance state
      updateThemeModeButtons();
      updateVariantButtons();
      updateAppearanceSummary();

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
      let selectedProvider = this.getProvider();
      let selectedModel = this.getModel(selectedProvider);
      let selectedBaseUrl = this.getBaseUrl();
      let baseOverridden = this.getBaseOverride();

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
          // Always refresh summary so it's populated whether open or collapsed
          updateSummary();
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
      effortSelect.value = this.getEffort(selectedProvider);
      baseOverrideCheckbox.checked = baseOverridden;

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
          // Custom always uses the currently stored base URL and keeps the input editable.
          baseUrlInput.value = selectedBaseUrl;
        } else {
          // Hosted providers: keep a valid override, but reset a leftover/stale
          // custom base URL (e.g. switching back from Custom) to the default.
          const defaultUrl = PROVIDER_DEFAULTS[selectedProvider] || "";
          if (
            !baseOverridden ||
            !validateAiBaseUrl(baseUrlInput.value.trim(), selectedProvider).ok
          ) {
            baseOverridden = false;
            baseOverrideCheckbox.checked = false;
            baseUrlInput.value = defaultUrl;
          }
        }
        selectedBaseUrl = baseUrlInput.value;
        baseOverrideCheckbox.checked = baseOverridden;
        updateBaseUrlEditability();
      };

      const isModelSearchProvider = () =>
        selectedProvider === "OpenRouter" ||
        selectedProvider === "OpenAI" ||
        selectedProvider === "Ollama" ||
        selectedProvider === "LM Studio";

      const isFetchModelsSupported = isModelSearchProvider;

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
        } else if (selectedIdx < 0 && selectedModel && this._allModels.length > 0) {
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
            modelInput.value = m.id;
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
          empty.textContent = this._loadingModels
            ? "Loading models…"
            : this._lastModelError || "No models found";
          fragment.appendChild(empty);
        }
        modelList.innerHTML = "";
        modelList.appendChild(fragment);
        // Ensure the list is scrolled to the top and repainted so items
        // are visible immediately (some browsers defer paint until scroll).
        // Reset scroll on the dropdown (the actual overflow container) so the
        // freshly populated items are visible from the top.
        modelDropdown.scrollTop = 0;
        modelList.offsetHeight; // force reflow of the list itself

        modelDropdown.offsetHeight; // force reflow of the overflow container
        requestAnimationFrame(() => {
          modelDropdown.scrollTop = 0;
          modelList.offsetHeight; // force reflow of the list itself

          modelDropdown.offsetHeight; // force reflow of the overflow container
        });
      };

      const openDropdown = () => {
        modelDropdown.hidden = false;
        // Position the dropdown with fixed coordinates so it escapes
        // the dialog's overflow clipping. Force a reflow so the input
        // has a stable width before we size the dropdown; otherwise the
        // dropdown can end up with a zero width and the item text is hidden.
        const rect = modelInput.getBoundingClientRect();
        const width = Math.max(rect.width, modelInput.offsetWidth, 240);
        modelDropdown.style.position = "fixed";
        modelDropdown.style.left = `${rect.left}px`;
        modelDropdown.style.top = `${rect.bottom + 2}px`;
        modelDropdown.style.width = `${width}px`;
        modelDropdown.scrollTop = 0;

        modelDropdown.offsetHeight;
      };

      const closeDropdown = () => {
        modelDropdown.hidden = true;
        modelInput.value = selectedModel;
      };

      const updateReasoningState = () => {
        if (selectedModel && !this._modelReasoningMap.has(selectedModel)) {
          const guessed = guessReasoningForModel(selectedModel);
          if (guessed) this._modelReasoningMap.set(selectedModel, guessed);
        }
        const supports = this.modelSupportsReasoning(selectedModel);
        reasoningCheckbox.disabled = !supports;
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
        this._loadingModels = true;
        this._lastModelError = "";
        try {
          const baseUrl = (selectedBaseUrl || "").replace(/\/+$/, "");
          const validation = validateAiBaseUrl(baseUrl, selectedProvider);
          if (!validation.ok) {
            throw new Error(validation.error || "Invalid base URL");
          }
          const modelKey = apiKeyInput.value.trim();
          const headers = {};
          if (selectedProvider !== "OpenRouter" && modelKey)
            headers.Authorization = `Bearer ${modelKey}`;
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
          this._cachedProvider = selectedProvider;

          for (const m of models) {
            const id = m.id || m.model || String(m);
            const name = m.name || id;
            this._allModels.push({ id, name });
            const reasoning = isMeaningfulReasoning(m.reasoning)
              ? m.reasoning
              : guessReasoningForModel(id);
            if (reasoning) {
              this._modelReasoningMap.set(id, reasoning);
            }
            this._modelMaxOutputMap.set(id, m.top_provider?.max_completion_tokens ?? null);
          }

          if (this._allModels.length === 0) {
            throw new Error("No models returned");
          }

          // Don't auto-open the dropdown on fetch — only populate it.
          // The user can click/focus the input to open it.
        } catch (err) {
          this._lastModelError = `Could not fetch models: ${err.message}`;
          errorEl.textContent = this._lastModelError;
          errorEl.hidden = false;
        } finally {
          this._loadingModels = false;
          fetchModelsBtn.disabled = false;
          filterModels(modelInput.value);
        }
      };

      // --- Provider / base URL handlers ---
      providerSelect.addEventListener("change", () => {
        selectedProvider = providerSelect.value;
        applyProviderDefaults();
        apiKeyInput.value = this.getApiKey(selectedProvider);
        fetchModelsBtn.hidden = !isFetchModelsSupported();

        // Restore the previously selected model for this provider, if any.
        this._allModels = [];
        this._modelReasoningMap.clear();
        this._modelMaxOutputMap.clear();
        this._cachedProvider = selectedProvider;
        selectedModel = this.getModel(selectedProvider);
        modelInput.value = selectedModel;
        updateModelSummary();

        if (isFetchModelsSupported()) {
          // Auto-fetch for OpenRouter, OpenAI, Ollama, LM Studio.
          // Keep the saved model unless the list comes back empty.
          fetchModels().then(() => {
            if (this._allModels.length > 0 && !selectedModel) {
              selectedModel = this._allModels[0].id;
              modelInput.value = selectedModel;
              updateModelSummary();
            }
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
          if (this._allModels.length === 0 && !this._loadingModels) {
            fetchModels();
          }
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
        const typed = modelInput.value.trim();
        if (typed) {
          selectedModel = typed;
          updateModelSummary();
          updateReasoningState();
        }
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

      if (isModelSearchProvider()) {
        this.#populateOpenRouterModels(() => {
          filterModels("");
          const savedReasoning = this.getReasoning(selectedProvider);
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
        const modelStorage = providerModelStorageKey(selectedProvider);
        const reasoningStorage = providerReasoningStorageKey(selectedProvider);
        const effortStorage = providerEffortStorageKey(selectedProvider);

        try {
          sessionStorage.setItem(keyStorage, apiKey);
          sessionStorage.setItem(modelStorage, selectedModel);
          sessionStorage.setItem(reasoningStorage, String(reasoning));
          sessionStorage.setItem(effortStorage, effort);

          localStorage.setItem(STORAGE_KEY_BASE_URL, selectedBaseUrl);
          localStorage.setItem(STORAGE_KEY_PROVIDER, selectedProvider);
          this.setBaseOverride(baseOverridden);

          if (remember) {
            localStorage.setItem(keyStorage, apiKey);
            localStorage.setItem(modelStorage, selectedModel);
            localStorage.setItem(reasoningStorage, String(reasoning));
            localStorage.setItem(effortStorage, effort);
            localStorage.setItem(REMEMBER_KEY, "true");
          } else {
            localStorage.removeItem(keyStorage);
            localStorage.removeItem(modelStorage);
            localStorage.removeItem(reasoningStorage);
            localStorage.removeItem(effortStorage);
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
        SettingsModal.close();
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
        SettingsModal.close();
        resolve(null);
      });

      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) {
          cleanup();
          SettingsModal.close();
          resolve(null);
        }
      });
    });
  }

  static async #populateOpenRouterModels(onLoaded) {
    const provider = this.getProvider();
    this._loadingModels = true;
    this._lastModelError = "";

    // Only reuse the cache if it belongs to the same provider
    if (this._allModels.length > 0 && this._cachedProvider === provider) {
      this._loadingModels = false;
      onLoaded?.();
      return;
    }

    // Reset cache for the new provider
    this._cachedProvider = provider;
    this._allModels = [];
    this._modelReasoningMap.clear();
    this._modelMaxOutputMap.clear();

    const saved = this.getModel(provider);
    this._allModels = [];

    try {
      const baseUrl = (this.getBaseUrl() || DEFAULT_BASE_URL).replace(/\/+$/, "");
      const validation = validateAiBaseUrl(baseUrl, provider);
      if (!validation.ok) {
        throw new Error(validation.error || "Invalid base URL");
      }
      const modelKey = this.getApiKey();
      const headers = {};
      if (provider !== "OpenRouter" && modelKey) headers.Authorization = `Bearer ${modelKey}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${baseUrl}/models`, { headers, signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const models = Array.isArray(data.data) ? data.data : [];

      // For OpenAI, also ask OpenRouter's public model list for reasoning metadata.
      // OpenRouter's /models endpoint is CORS-enabled and does not require auth.
      const openRouterReasoning =
        provider === "OpenAI" ? await this.#fetchOpenRouterReasoning() : new Map();

      this._allModels = [];
      for (const m of models) {
        const id = m.id || m.model || String(m);
        const name = m.name || id;
        this._allModels.push({ id, name });
        // Prefer the provider's own per-model reasoning metadata, then OpenRouter's,
        // then fall back to the best-effort heuristic so known reasoning models still work.
        // A meaningful `reasoning` object (non-empty) means the model supports
        // reasoning even when supported_efforts is null (all efforts accepted)
        // or omitted (effort selection not exposed — use reasoning.enabled
        // instead). A bare `{}` is rejected — some providers include it for
        // non-reasoning models.
        const apiReasoning = isMeaningfulReasoning(m.reasoning) ? m.reasoning : null;
        const crossRefReasoning = openRouterReasoning.get(id);
        const reasoning = apiReasoning || crossRefReasoning || guessReasoningForModel(id);
        if (reasoning) {
          this._modelReasoningMap.set(id, reasoning);
        }
        this._modelMaxOutputMap.set(id, m.top_provider?.max_completion_tokens ?? null);
      }

      if (saved && !this._allModels.some((m) => m.id === saved)) {
        this._allModels.unshift({ id: saved, name: saved });
      }

      if (saved && !this._modelReasoningMap.has(saved)) {
        const openRouterSaved = openRouterReasoning.get(saved);
        const guessed = openRouterSaved || guessReasoningForModel(saved);
        if (guessed) {
          this._modelReasoningMap.set(saved, guessed);
        }
      }
      if (saved && !this._modelMaxOutputMap.has(saved)) {
        this._modelMaxOutputMap.set(saved, null);
      }
    } catch (err) {
      this._lastModelError = `Could not load models: ${err.message}`;
    }

    this._loadingModels = false;
    onLoaded?.();
  }

  /**
   * Fetch OpenRouter's public /models list and return a map of OpenAI model IDs
   * to their reasoning metadata. This lets OpenAI users see the exact effort
   * levels OpenRouter advertises for `openai/{id}` models.
   * @returns {Promise<Map<string, object>>}
   */
  static async #fetchOpenRouterReasoning() {
    const map = new Map();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) return map;
      const data = await res.json();
      const models = Array.isArray(data.data) ? data.data : [];
      for (const m of models) {
        const id = m.id || "";
        const reasoning = isMeaningfulReasoning(m.reasoning) ? m.reasoning : null;
        if (!id.startsWith("openai/") || !reasoning) continue;
        const openaiId = id.replace("openai/", "");
        map.set(openaiId, reasoning);
      }
    } catch {
      // ignore — best-effort cross-reference
    }
    return map;
  }

  static #createDom() {
    const backdrop = document.createElement("div");
    backdrop.className = `${P}backdrop`;
    backdrop.innerHTML = `
      <div class="${P}dialog">
        <h2 class="${P}title">Settings</h2>

        <!-- Appearance card -->
        <div class="${P}card ${P}card--appearance">
          <div class="${P}card-header">
            <span class="${P}chevron"></span>
            <span class="${P}card-title">Appearance</span>
            <span class="${P}card-summary-text" hidden></span>
          </div>
          <div class="${P}card-body" hidden>
            <label class="${P}label">Theme</label>
            <div class="${P}theme-mode-row">
              <button type="button" class="${P}theme-mode-btn" data-theme-mode="light">
                <span class="${P}theme-mode-icon">${SUN_ICON}</span>
                <span>Light</span>
              </button>
              <button type="button" class="${P}theme-mode-btn" data-theme-mode="dark">
                <span class="${P}theme-mode-icon">${MOON_ICON}</span>
                <span>Dark</span>
              </button>
            </div>

            <label class="${P}label ${P}variant-label">Palette</label>
            <div class="${P}variant-grid" data-palette-grid>
              ${PALETTES.map(
                (v) => `
                <button type="button" class="${P}variant-btn" data-palette="${v}">
                  <span class="${P}variant-swatch ${P}variant-swatch--${v}"></span>
                  <span class="${P}variant-name">${PALETTE_LABELS[v]}</span>
                </button>`,
              ).join("")}
            </div>
          </div>
        </div>

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
