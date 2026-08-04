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
 * Validate an AI base URL before sending credentials or requests to it.
 * Only allows http: or https: schemes with a non-empty hostname.
 * @param {string} baseUrl
 * @returns {{ok: boolean, error?: string}}
 */
export function validateAiBaseUrl(baseUrl) {
  if (!baseUrl) return { ok: false, error: "Base URL is not configured" };
  const url = baseUrl.replace(/\/+$/, "").toLowerCase();
  if (url.startsWith("http://localhost") || url.startsWith("http://127.0.0.1")) {
    return { ok: true }; // local http is intentional for Ollama/LM Studio
  }
  if (!/^https?:\/\//i.test(baseUrl)) {
    return { ok: false, error: "Base URL must use http: or https: scheme" };
  }
  try {
    const parsed = new URL(baseUrl);
    if (!parsed.hostname) return { ok: false, error: "Base URL has no valid host" };
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: "Base URL must use http: or https: scheme" };
    }
    if (
      parsed.protocol === "http:" &&
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "127.0.0.1"
    ) {
      return { ok: false, error: "Non-local http: endpoints are not allowed" };
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
   */
  constructor({ getBaseUrl, getApiKey, getModel }) {
    this._getBaseUrl = getBaseUrl;
    this._getApiKey = getApiKey;
    this._getModel = getModel;
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
    const validation = validateAiBaseUrl(baseUrl);
    if (!validation.ok) {
      throw new AiHttpError(0, validation.error || "Invalid base URL");
    }
    const url = `${baseUrl}/chat/completions`;
    const apiKey = this._getApiKey();

    const headers = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const bodyBase = {
      model: this._getModel(),
      messages,
      max_tokens: maxTokens,
      stream: false,
    };

    if (responseFormat) {
      bodyBase.response_format = responseFormat;
    }
    if (reasoning) {
      bodyBase.reasoning = reasoning;
    }

    const tryFetch = async (includeResponseFormat) => {
      if (signal?.aborted) {
        throw new AiAbortError();
      }

      const body = { ...bodyBase };
      if (!includeResponseFormat) {
        delete body.response_format;
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
          return null;
        }
        throw new AiHttpError(res.status, bodyText);
      }

      const json = await res.json().catch(() => {
        throw new AiParseError("Failed to parse response JSON");
      });

      const content = json.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new AiParseError("Response missing choices[0].message.content");
      }

      return { content, usage: json.usage || null, raw: json };
    };

    try {
      const first = await tryFetch(true);
      if (first) return first;

      // Retry once without response_format if the provider rejected it.
      const second = await tryFetch(false);
      if (second) return second;

      throw new AiParseError("Failed to get a valid response");
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
  constructor(msg) {
    super(msg);
    this.name = "AiParseError";
  }
}
