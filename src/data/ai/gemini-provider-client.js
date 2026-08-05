import {
  AiAbortError,
  AiHttpError,
  AiParseError,
  validateAiBaseUrl,
} from "./ai-provider-client.js";

/**
 * Google Gemini generateContent client.
 * Adapts the stateless AiProviderClient chat signature to Gemini's /v1beta/models/{model}:generateContent.
 *
 * @typedef {import("./ai-provider-client.js").ChatRequest} ChatRequest
 * @typedef {import("./ai-provider-client.js").ChatResponse} ChatResponse
 */

export class GeminiProviderClient {
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
  async chat({ messages, maxTokens, responseFormat, _reasoning }, signal) {
    if (signal?.aborted) {
      throw new AiAbortError();
    }

    const apiKey = this._getApiKey();
    if (!apiKey) {
      throw new AiHttpError(0, "Gemini API key is required");
    }

    const baseUrl = (this._getBaseUrl() || "").replace(/\/+$/, "");
    const provider = this._getProvider?.();
    const validation = validateAiBaseUrl(baseUrl, provider);
    if (!validation.ok) {
      throw new AiHttpError(0, validation.error || "Invalid base URL");
    }
    const model = this._getModel();
    const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`;

    const { systemInstruction, contents } = this._mapMessages(messages);
    const generationConfig = { maxOutputTokens: maxTokens };
    if (responseFormat?.type === "json_object") {
      generationConfig.responseMimeType = "application/json";
    }

    const body = { contents, generationConfig };
    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        throw new AiHttpError(res.status, bodyText);
      }

      const json = await res.json().catch(() => {
        throw new AiParseError("Failed to parse Gemini response JSON");
      });

      const content = this._extractContent(json);
      if (typeof content !== "string") {
        throw new AiParseError("Gemini response missing text content");
      }

      const finishReason = this._mapFinishReason(json);
      const usage = json.usageMetadata
        ? {
            prompt_tokens: json.usageMetadata.promptTokenCount,
            completion_tokens: json.usageMetadata.candidatesTokenCount,
            total_tokens: json.usageMetadata.totalTokenCount,
          }
        : null;

      return { content, usage, raw: { ...json, finish_reason: finishReason } };
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

  _mapMessages(messages) {
    const parts = [];
    const contents = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        const text = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        parts.push({ text });
      } else if (msg.role === "user" || msg.role === "assistant") {
        const role = msg.role === "user" ? "user" : "model";
        const text = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        contents.push({ role, parts: [{ text }] });
      }
    }

    return {
      systemInstruction: parts.length ? { parts } : null,
      contents,
    };
  }

  _extractContent(json) {
    const candidate = json.candidates?.[0];
    if (!candidate?.content?.parts) return null;
    return candidate.content.parts
      .filter((p) => typeof p.text === "string")
      .map((p) => p.text)
      .join("");
  }

  _mapFinishReason(json) {
    const finish = json.candidates?.[0]?.finishReason;
    if (finish === "MAX_TOKENS") return "length";
    if (finish === "STOP" || finish === "FINISH_REASON_STOP") return "stop";
    return finish || null;
  }
}
