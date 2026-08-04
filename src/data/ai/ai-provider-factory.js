import { AiProviderClient } from "./ai-provider-client.js";
import { AnthropicProviderClient } from "./anthropic-provider-client.js";
import { GeminiProviderClient } from "./gemini-provider-client.js";
import { OpenAIResponsesClient } from "./openai-responses-client.js";
import { getOpenCodeApiStyle } from "./opencode-models.js";

/**
 * Factory for creating the right AI provider client.
 *
 * For most providers, the provider label determines the client.
 * For OpenCode, the selected model determines the API style:
 *   - "chat-completions" → AiProviderClient (/v1/chat/completions)
 *   - "responses"         → OpenAIResponsesClient (/v1/responses)
 *   - "messages"          → AnthropicProviderClient (/v1/messages)
 *
 * @param {string} providerLabel — value from SettingsModal.getProvider()
 * @param {() => string} getBaseUrl
 * @param {() => string} getApiKey
 * @param {() => string} getModel
 * @returns {AiProviderClient|AnthropicProviderClient|GeminiProviderClient|OpenAIResponsesClient}
 */
export function createAiProviderClient(providerLabel, getBaseUrl, getApiKey, getModel) {
  switch (providerLabel) {
    case "Anthropic":
      return new AnthropicProviderClient({ getBaseUrl, getApiKey, getModel });
    case "Gemini":
      return new GeminiProviderClient({ getBaseUrl, getApiKey, getModel });
    case "OpenCode": {
      const apiStyle = getOpenCodeApiStyle(getModel());
      if (apiStyle === "responses") {
        return new OpenAIResponsesClient({ getBaseUrl, getApiKey, getModel });
      }
      if (apiStyle === "messages") {
        return new AnthropicProviderClient({ getBaseUrl, getApiKey, getModel });
      }
      return new AiProviderClient({ getBaseUrl, getApiKey, getModel });
    }
    case "OpenAI":
    case "OpenRouter":
    case "Ollama":
    case "LM Studio":
    case "Custom":
    default:
      return new AiProviderClient({ getBaseUrl, getApiKey, getModel });
  }
}
