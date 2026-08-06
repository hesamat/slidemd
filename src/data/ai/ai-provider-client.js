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

    // Retry loop: drop unsupported params one at a time. Each retry narrows
    // the request shape so a subsequent "reasoning is mandatory" 400 from the
    // response_format-less retry is also handled (and vice versa).
    let includeResponseFormat = Boolean(responseFormat);
    let includeReasoning = true;
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await tryFetch(includeResponseFormat, includeReasoning);
      } catch (err) {
        lastErr = err;
        // Drop response_format only when it was actually sent and the provider
        // rejected it. Without the `responseFormat` guard we'd re-send a
        // byte-identical request on every parse/content error (wasted call).
        if (err instanceof AiParseError && responseFormat && includeResponseFormat) {
          includeResponseFormat = false;
          continue;
        }
        // Drop the reasoning param when the model requires reasoning but we
        // tried to disable it. Only retry if we actually sent `reasoning`.
        if (err instanceof AiReasoningError && includeReasoning && effectiveReasoning) {
          includeReasoning = false;
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
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
    // Append a short, sanitized excerpt of the response body so the user gets
    // actionable detail (bad model id, quota, rejected param) without leaking
    // credentials. Header-like lines and bearer tokens are stripped; the full
    // body remains on `.body` for DevTools inspection.
    const summary = sanitizeErrorBody(body);
    super(`HTTP ${status}${summary ? `: ${summary}` : ""}`);
    this.name = "AiHttpError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Extract a short, sanitized excerpt from a provider error body for display.
 * Strips lines that look like echoed request headers / credentials, collapses
 * whitespace, and caps the length.
 * @param {string} body
 * @returns {string}
 */
function sanitizeErrorBody(body) {
  if (!body) return "";
  const text = String(body);
  // Drop lines that look like headers or credential echoes.
  const cleaned = text
    .split("\n")
    .filter((line) => !/authorization|bearer|api[-_]?key|x-api-key/i.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned.slice(0, 150);
}

export class AiParseError extends Error {
  constructor(msg, body = "") {
    super(msg);
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
