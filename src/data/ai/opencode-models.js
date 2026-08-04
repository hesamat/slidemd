/**
 * OpenCode Go model registry.
 *
 * OpenCode routes models to different API styles:
 * - "chat-completions" → /v1/chat/completions (OpenAI-compatible, Bearer auth)
 * - "responses"         → /v1/responses (OpenAI Responses API, Bearer auth)
 * - "messages"          → /v1/messages (Anthropic Messages API, x-api-key auth)
 *
 * @typedef {Object} OpenCodeModel
 * @property {string} id
 * @property {string} name
 * @property {"chat-completions"|"responses"|"messages"} api
 */

export const OPENCODE_BASE_URL = "https://opencode.ai/zen/go";

/** @type {OpenCodeModel[]} */
export const OPENCODE_MODELS = [
  { id: "grok-4.5", name: "Grok 4.5", api: "chat-completions" },
  { id: "gpt-5.6-luna", name: "GPT 5.6 Luna", api: "responses" },
  { id: "glm-5.2", name: "GLM-5.2", api: "chat-completions" },
  { id: "glm-5.1", name: "GLM-5.1", api: "chat-completions" },
  { id: "kimi-k3", name: "Kimi K3", api: "chat-completions" },
  { id: "kimi-k2.7-code", name: "Kimi K2.7 Code", api: "chat-completions" },
  { id: "kimi-k2.6", name: "Kimi K2.6", api: "chat-completions" },
  { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", api: "chat-completions" },
  { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", api: "chat-completions" },
  { id: "mimo-v2.5", name: "MiMo-V2.5", api: "chat-completions" },
  { id: "mimo-v2.5-pro", name: "MiMo-V2.5-Pro", api: "chat-completions" },
  { id: "minimax-m3", name: "MiniMax M3", api: "messages" },
  { id: "minimax-m2.7", name: "MiniMax M2.7", api: "messages" },
  { id: "minimax-m2.5", name: "MiniMax M2.5", api: "messages" },
  { id: "qwen3.8-max", name: "Qwen3.8 Max", api: "messages" },
  { id: "qwen3.7-max", name: "Qwen3.7 Max", api: "messages" },
  { id: "qwen3.7-plus", name: "Qwen3.7 Plus", api: "messages" },
  { id: "qwen3.6-plus", name: "Qwen3.6 Plus", api: "messages" },
  { id: "hy3", name: "Hy3", api: "chat-completions" },
];

/**
 * Look up an OpenCode model by ID.
 * @param {string} modelId
 * @returns {OpenCodeModel|undefined}
 */
export function getOpenCodeModel(modelId) {
  return OPENCODE_MODELS.find((m) => m.id === modelId);
}

/**
 * Get the API style for an OpenCode model.
 * Defaults to "chat-completions" if the model is unknown.
 * @param {string} modelId
 * @returns {"chat-completions"|"responses"|"messages"}
 */
export function getOpenCodeApiStyle(modelId) {
  return getOpenCodeModel(modelId)?.api ?? "chat-completions";
}
