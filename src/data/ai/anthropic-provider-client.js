import {
  AiAbortError,
  AiHttpError,
  AiParseError,
  validateAiBaseUrl,
} from "./ai-provider-client.js";

/**
 * Anthropic Messages API client.
 * Adapts the stateless AiProviderClient chat signature to Anthropic's /v1/messages.
 *
 * @typedef {import("./ai-provider-client.js").ChatRequest} ChatRequest
 * @typedef {import("./ai-provider-client.js").ChatResponse} ChatResponse
 */

export class AnthropicProviderClient {
  /**
   * @param {object} opts
   * @param {() => string} opts.getBaseUrl
   * @param {() => string} opts.getApiKey
   * @param {() => string} opts.getModel
   * @param {() => string} [opts.getProvider]
   */
  constructor({ getBaseUrl, getApiKey, getModel, getProvider }) {
    this._getBaseUrl = getBaseUrl;
    this._getApiKey = getApiKey;
    this._getModel = getModel;
    this._getProvider = getProvider;
  }

  /**
   * @param {ChatRequest} request
   * @param {AbortSignal} [signal]
   * @returns {Promise<ChatResponse>}
   * @throws {AiAbortError|AiHttpError|AiParseError}
   */
  async chat({ messages, maxTokens, responseFormat, reasoning }, signal) {
    if (signal?.aborted) {
      throw new AiAbortError();
    }

    const apiKey = this._getApiKey();
    if (!apiKey) {
      throw new AiHttpError(0, "Anthropic API key is required");
    }

    const baseUrl = (this._getBaseUrl() || "").replace(/\/+$/, "");
    const provider = this._getProvider?.();
    const validation = validateAiBaseUrl(baseUrl, provider);
    if (!validation.ok) {
      throw new AiHttpError(0, validation.error || "Invalid base URL");
    }
    const url = `${baseUrl}/v1/messages`;

    const { system, anthropicMessages } = this._mapMessages(messages, responseFormat);
    const body = {
      model: this._getModel(),
      max_tokens: maxTokens,
      messages: anthropicMessages,
    };
    if (system) {
      body.system = system;
    }
    if (reasoning) {
      const budget = this._thinkingBudget(maxTokens);
      if (budget) {
        body.thinking = { type: "enabled", budget_tokens: budget };
      }
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        throw new AiHttpError(res.status, bodyText);
      }

      const json = await res.json().catch(() => {
        throw new AiParseError("Failed to parse Anthropic response JSON");
      });

      const content = this._extractContent(json);
      if (typeof content !== "string") {
        throw new AiParseError("Anthropic response missing text content");
      }

      const finishReason = this._mapFinishReason(json.stop_reason);
      const raw = { ...json, finish_reason: finishReason };

      return {
        content,
        usage: json.usage
          ? {
              prompt_tokens: json.usage.input_tokens,
              completion_tokens: json.usage.output_tokens,
              total_tokens: (json.usage.input_tokens || 0) + (json.usage.output_tokens || 0),
            }
          : null,
        raw,
      };
    } catch (err) {
      if (err instanceof AiHttpError || err instanceof AiParseError) {
        throw err;
      }
      if (signal?.aborted || err.name === "AbortError") {
        throw new AiAbortError();
      }
      throw new AiHttpError(0, String(err.message || err));
    }
  }

  _mapMessages(messages, _responseFormat) {
    let system = "";
    const anthropicMessages = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        system = this._concatText(system ? `${system}\n\n` : "", msg.content);
      } else if (msg.role === "user" || msg.role === "assistant") {
        anthropicMessages.push({
          role: msg.role,
          content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
        });
      }
    }

    if (_responseFormat?.type === "json_object") {
      system = system
        ? `${system}\n\nReturn only valid JSON and nothing else.`
        : "Return only valid JSON and nothing else.";
    }

    return { system, anthropicMessages };
  }

  _concatText(prefix, content) {
    const text = typeof content === "string" ? content : JSON.stringify(content);
    return prefix ? `${prefix}${text}` : text;
  }

  _thinkingBudget(maxTokens) {
    const requested = Math.floor(maxTokens * 0.3);
    const budget = Math.min(requested, 64000);
    return Math.max(1024, Math.min(budget, maxTokens - 1));
  }

  _extractContent(json) {
    const blocks = Array.isArray(json.content) ? json.content : [];
    const textBlocks = blocks.filter((b) => b && b.type === "text" && typeof b.text === "string");
    if (textBlocks.length === 0) return null;
    return textBlocks.map((b) => b.text).join("");
  }

  _mapFinishReason(stopReason) {
    if (stopReason === "max_tokens") return "length";
    if (stopReason === "end_turn" || stopReason === "stop_sequence") return "stop";
    return stopReason || null;
  }
}
