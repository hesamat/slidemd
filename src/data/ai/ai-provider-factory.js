import { AiProviderClient } from "./ai-provider-client.js";
import { AnthropicProviderClient } from "./anthropic-provider-client.js";
import { GeminiProviderClient } from "./gemini-provider-client.js";

/**
 * Factory for creating the right AI provider client.
 *
 * @param {string} providerLabel — value from SettingsModal.getProvider()
 * @param {() => string} getBaseUrl
 * @param {() => string} getApiKey
 * @param {() => string} getModel
 * @returns {import("./ai-provider-client.js").AiProviderClient | AnthropicProviderClient | GeminiProviderClient}
 */
export function createAiProviderClient(providerLabel, getBaseUrl, getApiKey, getModel) {
  switch (providerLabel) {
    case "Anthropic":
      return new AnthropicProviderClient({ getBaseUrl, getApiKey, getModel });
    case "Gemini":
      return new GeminiProviderClient({ getBaseUrl, getApiKey, getModel });
    case "OpenAI":
    case "OpenRouter":
    case "Ollama":
    case "LM Studio":
    case "Custom":
    default:
      return new AiProviderClient({ getBaseUrl, getApiKey, getModel });
  }
}
