/**
 * AI Provider Registry
 * Pluggable architecture for AI providers supporting multiple services
 * Primary: GLM (Zhipu AI) via OpenAI-compatible API
 */

export class AIProviderRegistry {
  static providers = new Map();
  static STORAGE_KEY = "webdeck_ai_api_keys";
  static SETTINGS_KEY = "webdeck_ai_settings";

  /**
   * Register an AI provider
   * @param {string} providerId - Unique provider ID
   * @param {Object} providerConfig - Provider configuration
   */
  static registerProvider(providerId, providerConfig) {
    this.providers.set(providerId, {
      ...providerConfig,
      providerId,
    });
  }

  /**
   * Get a registered provider
   * @param {string} providerId - The provider ID
   * @returns {Object|null} Provider configuration or null
   */
  static getProvider(providerId) {
    return this.providers.get(providerId) || null;
  }

  /**
   * Get all registered providers
   * @returns {Array<Object>} Array of provider configurations
   */
  static getAllProviders() {
    return Array.from(this.providers.values());
  }

  /**
   * Get the default provider
   * @returns {Object|null} Default provider configuration
   */
  static getDefaultProvider() {
    return this.getAllProviders().find((p) => p.isDefault) || null;
  }

  /**
   * Store API key for a provider in localStorage
   * @param {string} providerId - The provider ID
   * @param {string} apiKey - The API key to store
   */
  static setApiKey(providerId, apiKey) {
    const keys = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || "{}");
    keys[providerId] = apiKey;
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(keys));
  }

  /**
   * Get API key for a provider from localStorage
   * @param {string} providerId - The provider ID
   * @returns {string|null} The API key or null
   */
  static getApiKey(providerId) {
    const keys = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || "{}");
    return keys[providerId] || null;
  }

  /**
   * Remove API key for a provider
   * @param {string} providerId - The provider ID
   */
  static removeApiKey(providerId) {
    const keys = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || "{}");
    delete keys[providerId];
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(keys));
  }

  /**
   * Store selected model for a provider
   * @param {string} providerId - The provider ID
   * @param {string} modelId - The model ID
   */
  static setModel(providerId, modelId) {
    const settings = JSON.parse(localStorage.getItem(this.SETTINGS_KEY) || "{}");
    if (!settings[providerId]) settings[providerId] = {};
    settings[providerId].model = modelId;
    localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
  }

  /**
   * Get selected model for a provider
   * @param {string} providerId - The provider ID
   * @returns {string|null} The model ID or null
   */
  static getModel(providerId) {
    const settings = JSON.parse(localStorage.getItem(this.SETTINGS_KEY) || "{}");
    return settings[providerId]?.model || null;
  }

  /**
   * Validate an API key against a provider's pattern
   * @param {string} providerId - The provider ID
   * @param {string} apiKey - The API key to validate
   * @returns {Object} { valid: boolean, error: string|null }
   */
  static validateApiKey(providerId, apiKey) {
    const provider = this.getProvider(providerId);
    if (!provider) {
      return { valid: false, error: "Unknown provider" };
    }

    if (!apiKey || typeof apiKey !== "string") {
      return { valid: false, error: "API key is required" };
    }

    if (provider.apiKeyPattern && !provider.apiKeyPattern.test(apiKey)) {
      return { valid: false, error: "Invalid API key format" };
    }

    return { valid: true, error: null };
  }

  /**
   * Generate a completion using the specified provider
   * @param {string} providerId - The provider ID
   * @param {Object} options - Generation options
   * @param {string} options.model - Model ID
   * @param {Array<Object>} options.messages - Chat messages
   * @param {number} options.maxTokens - Maximum tokens to generate
   * @param {number} options.temperature - Temperature (0-1)
   * @param {number} options.topP - Nucleus sampling (0-1)
   * @param {boolean} options.reasoning - Enable reasoning mode (OpenRouter)
   * @param {Object} options.chatTemplateKwargs - Provider-specific chat template options
   * @param {number} options.timeoutMs - Request timeout in milliseconds
   * @param {AbortSignal} options.signal - Abort signal
   * @returns {Promise<string>} Generated content
   */
  static async generateCompletion(providerId, options) {
    const provider = this.getProvider(providerId);
    if (!provider) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    const apiKey = this.getApiKey(providerId);
    if (!apiKey && provider.requiresAuth !== false) {
      throw new Error(`API key not configured for ${provider.name}`);
    }

    const model = options.model || this.getModel(providerId) || provider.models[0].id;
    const mergedOptions = {
      ...provider.defaultOptions,
      ...options,
      model,
    };

    try {
      if (provider.openaiCompatible) {
        return await this._openAICompatibleRequest(provider.baseUrl, apiKey, mergedOptions);
      } else if (provider.customRequest) {
        return await provider.customRequest(apiKey, model, mergedOptions);
      } else {
        throw new Error(`Provider ${providerId} has no request implementation`);
      }
    } catch (error) {
      console.error(`AI generation failed for ${providerId}:`, error);
      throw error;
    }
  }

  /**
   * Make an OpenAI-compatible API request
   * @private
   */
  static async _openAICompatibleRequest(baseUrl, apiKey, options) {
    const {
      model,
      messages,
      maxTokens = 131072,
      temperature = 1.0,
      topP = 0.95,
      reasoning,
      chatTemplateKwargs,
      signal,
      timeoutMs,
    } = options;

    const payload = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
    };

    if (typeof reasoning === "boolean") {
      payload.reasoning = reasoning;
    }

    if (chatTemplateKwargs && typeof chatTemplateKwargs === "object") {
      payload.chat_template_kwargs = chatTemplateKwargs;
    }

    const { requestSignal, cleanupTimeout } = this.createRequestSignal(signal, timeoutMs);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: requestSignal,
      body: JSON.stringify(payload),
    }).finally(() => {
      cleanupTimeout();
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API error: ${response.status}`;

      if (response.status === 401) {
        errorMessage = "Invalid API key";
      } else if (response.status === 429) {
        errorMessage = "Rate limit exceeded";
      } else if (response.status === 500) {
        errorMessage = "Provider server error";
      }

      throw new Error(`${errorMessage}${errorText ? ` - ${errorText}` : ""}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  /**
   * Combine abort signal with an optional timeout
   * @param {AbortSignal|undefined} signal - External signal
   * @param {number|undefined} timeoutMs - Timeout in milliseconds
   * @returns {{requestSignal: AbortSignal|undefined, cleanupTimeout: Function}}
   */
  static createRequestSignal(signal, timeoutMs) {
    const hasTimeout = typeof timeoutMs === "number" && timeoutMs > 0;
    if (!hasTimeout && !signal) {
      return { requestSignal: undefined, cleanupTimeout: () => {} };
    }

    const controller = new AbortController();
    let timeoutId = null;

    if (signal) {
      if (signal.aborted) {
        controller.abort(signal.reason);
      } else {
        signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
      }
    }

    if (hasTimeout) {
      timeoutId = setTimeout(() => {
        controller.abort(new DOMException("Request timed out", "AbortError"));
      }, timeoutMs);
    }

    return {
      requestSignal: controller.signal,
      cleanupTimeout: () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      },
    };
  }

  /**
   * Test API key by making a minimal request
   * @param {string} providerId - The provider ID
   * @param {string} apiKey - The API key to test
   * @returns {Promise<Object>} { valid: boolean, error: string|null }
   */
  static async testApiKey(providerId, apiKey) {
    const validation = this.validateApiKey(providerId, apiKey);
    if (!validation.valid) {
      return validation;
    }

    // Temporarily set the key for testing
    const originalKey = this.getApiKey(providerId);
    this.setApiKey(providerId, apiKey);

    try {
      const provider = this.getProvider(providerId);
      const model = provider.models[0].id;

      await this.generateCompletion(providerId, {
        model,
        messages: [{ role: "user", content: "Test" }],
        maxTokens: 10,
      });

      return { valid: true, error: null };
    } catch (error) {
      return { valid: false, error: error.message };
    } finally {
      // Restore original key
      if (originalKey) {
        this.setApiKey(providerId, originalKey);
      } else {
        this.removeApiKey(providerId);
      }
    }
  }
}

/**
 * Initialize default providers
 * Called from main.js on app startup
 */
export function initializeDefaultProviders() {
  // Primary: GLM (Zhipu AI) via OpenAI-compatible API
  AIProviderRegistry.registerProvider("glm", {
    name: "GLM (Zhipu AI)",
    models: [{ id: "glm-5", name: "GLM-5", maxTokens: 131072 }],
    apiKeyPattern: /^[a-z0-9]{32,}/,
    baseUrl: "https://api.z.ai/api/coding/paas/v4",
    openaiCompatible: true,
    requiresAuth: true,
    isDefault: true,
    defaultOptions: {
      temperature: 1.0,
      topP: 0.95,
      maxTokens: 131072,
    },
  });

  // Alternative: OpenRouter
  AIProviderRegistry.registerProvider("openrouter", {
    name: "OpenRouter",
    models: [{ id: "openrouter/pony-alpha", name: "Pony Alpha", maxTokens: 200000 }],
    apiKeyPattern: /^sk-or-/,
    baseUrl: "https://openrouter.ai/api/v1",
    openaiCompatible: true,
    requiresAuth: true,
    isDefault: false,
    defaultOptions: {
      reasoning: true,
    },
  });
}
