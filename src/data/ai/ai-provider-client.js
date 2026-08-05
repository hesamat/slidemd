/**
 * OpenAI-compatible chat completions client.
 * Works with OpenRouter, Ollama, LM Studio, and any OpenAI-compatible endpoint.
 *
 * @typedef {Object} ChatRequest
 * @property {Array<{role: string, content: string}>} messages
 * @property {number} maxTokens
 * @property {{ type: string }|null} responseFormat
 * @property {{ effort: string }|null} reasoning
 *
 * @typedef {Object} ChatResponse
 * @property {string} content
 * @property {Object|null} usage
 * @property {Object} raw
 */

/**
 * Known provider hosts. When an API key is present we must not send it to an
 * unrelated host (e.g., a mistyped or attacker-suggested base URL).
 * Ollama/LM Studio are restricted to loopback; Custom providers are deliberately
 * unrestricted.
 */
const PROVIDER_HOSTS = {
  OpenAI: new Set(["api.openai.com"]),
  OpenRouter: new Set(["openrouter.ai", "www.openrouter.ai", "api.openrouter.ai"]),
  Anthropic: new Set(["api.anthropic.com"]),
  Gemini: new Set(["generativelanguage.googleapis.com"]),
  Ollama: new Set(["localhost", "127.0.0.1"]),
  "LM Studio": new Set(["localhost", "127.0.0.1"]),
};

/**
 * Validate an AI base URL before sending credentials or requests to it.
 * Only allows http: or https: schemes with a non-empty hostname.
 * If `provider` is given and the provider has known hosts, the base URL host
 * must match to prevent leaking an API key to an unrelated third party.
 * @param {string} baseUrl
 * @param {string} [provider]
 * @returns {{ok: boolean, error?: string}}
 */
export function validateAiBaseUrl(baseUrl, provider) {
  if (!baseUrl) return { ok: false, error: "Base URL is not configured" };
  if (!/^https?:\/\//i.test(baseUrl)) {
    return { ok: false, error: "Base URL must use http: or https: scheme" };
  }
  try {
    const parsed = new URL(baseUrl);
    if (!parsed.hostname) return { ok: false, error: "Base URL has no valid host" };
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: "Base URL must use http: or https: scheme" };
    }
    // Only exact `localhost` or `127.0.0.1` are trusted for cleartext HTTP.
    if (
      parsed.protocol === "http:" &&
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "127.0.0.1"
    ) {
      return { ok: false, error: "Non-local http: endpoints are not allowed" };
    }
    const allowed = provider ? PROVIDER_HOSTS[provider] : null;
    if (allowed && !allowed.has(parsed.hostname)) {
      return {
        ok: false,
        error: `Base URL host must be one of: ${[...allowed].join(", ")} for ${provider}`,
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Base URL is not a valid URL" };
  }
}

export class AiProviderClient {
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

    const baseUrl = (this._getBaseUrl() || "").replace(/\/+$/, "");
    const provider = this._getProvider?.();
    const validation = validateAiBaseUrl(baseUrl, provider);
    if (!validation.ok) {
      throw new AiHttpError(0, validation.error || "Invalid base URL");
    }
    const url = `${baseUrl}/chat/completions`;
    const apiKey = this._getApiKey();
    const rawModel = this._getModel();
    // OpenRouter model IDs can have at most one routing suffix. Only append
    // the default :nitro suffix when the user hasn't already picked one.
    const model =
      provider === "OpenRouter" && rawModel && !rawModel.includes(":")
        ? `${rawModel}:nitro`
        : rawModel;
    // OpenRouter's reasoning models default to "on" when the parameter is
    // omitted; send "none" when the user hasn't asked for reasoning.
    const effectiveReasoning = reasoning ?? (provider === "OpenRouter" ? { effort: "none" } : null);

    const headers = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const bodyBase = {
      model,
      messages,
      max_tokens: maxTokens,
      stream: false,
    };

    if (responseFormat) {
      bodyBase.response_format = responseFormat;
    }
    if (effectiveReasoning) {
      bodyBase.reasoning = effectiveReasoning;
    }

    const tryFetch = async (includeResponseFormat, includeReasoning = true) => {
      if (signal?.aborted) {
        throw new AiAbortError();
      }

      const body = { ...bodyBase };
      if (!includeResponseFormat) {
        delete body.response_format;
      }
      if (!includeReasoning) {
        delete body.reasoning;
      }

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      });

      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        if (
          includeResponseFormat &&
          res.status === 400 &&
          bodyText.toLowerCase().includes("response_format")
        ) {
          throw new AiParseError("response_format not supported");
        }
        if (
          includeReasoning &&
          res.status === 400 &&
          bodyText.toLowerCase().includes("reasoning is mandatory")
        ) {
          throw new AiReasoningError("Reasoning is mandatory for this model");
        }
        throw new AiHttpError(res.status, bodyText);
      }

      const bodyText = await res.text().catch(() => "");
      let json;
      try {
        json = JSON.parse(bodyText);
      } catch {
        throw new AiParseError("Failed to parse response JSON", bodyText);
      }

      const content = json.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new AiParseError("Response missing choices[0].message.content");
      }

      return { content, usage: json.usage || null, raw: json };
    };

    try {
      return await tryFetch(true);
    } catch (firstErr) {
      // Retry without response_format if the provider doesn't support it.
      if (responseFormat && firstErr instanceof AiParseError) {
        return await tryFetch(false);
      }
      // Retry without the reasoning param when the model requires reasoning
      // but we tried to disable it (effort: "none"). Let the model use its
      // default reasoning instead of failing. Only worth retrying if we
      // actually sent a `reasoning` field — otherwise this would just repeat
      // the exact same request and waste an API call.
      if (firstErr instanceof AiReasoningError && effectiveReasoning) {
        return await tryFetch(true, false);
      }
      throw firstErr;
    }
  }
}

export class AiAbortError extends Error {
  constructor() {
    super("Aborted");
    this.name = "AiAbortError";
  }
}

export class AiHttpError extends Error {
  constructor(status, body) {
    const summary = body ? ` ${String(body).slice(0, 200)}` : "";
    super(`HTTP ${status}${summary}`);
    this.name = "AiHttpError";
    this.status = status;
    this.body = body;
  }
}

export class AiParseError extends Error {
  constructor(msg, body = "") {
    const summary = body ? ` ${String(body).slice(0, 500)}` : "";
    super(`${msg}${summary}`);
    this.name = "AiParseError";
    this.body = body;
  }
}

export class AiReasoningError extends Error {
  constructor(msg) {
    super(msg);
    this.name = "AiReasoningError";
  }
}
