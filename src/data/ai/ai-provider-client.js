/**
 * OpenAI-compatible chat completions client.
 * Works with OpenRouter, Ollama, LM Studio, and any OpenAI-compatible endpoint.
 *
 * @typedef {Object} ChatRequest
 * @property {Array<{role: string, content: string|Array}>} messages
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
      stream: false,
    };

    if (responseFormat) {
      bodyBase.response_format = responseFormat;
    }
    if (effectiveReasoning) {
      bodyBase.reasoning = effectiveReasoning;
    }

    const tryFetch = async (includeResponseFormat, includeReasoning, currentMaxTokens) => {
      if (signal?.aborted) {
        throw new AiAbortError();
      }

      const body = { ...bodyBase, max_tokens: currentMaxTokens };
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
        const lower = bodyText.toLowerCase();
        if (includeResponseFormat && res.status === 400 && lower.includes("response_format")) {
          throw new AiParseError("response_format not supported");
        }
        if (
          includeReasoning &&
          effectiveReasoning &&
          res.status === 400 &&
          (lower.includes("reasoning is mandatory") ||
            (lower.includes("invalid_parameter") &&
              (lower.includes("reasoning") || lower.includes("effort"))))
        ) {
          throw new AiReasoningError("Reasoning parameter rejected by model");
        }
        // Some reasoning-mandatory models (e.g. qwen3.8-max) reserve an
        // internal "thinking budget" out of max_completion_tokens for their
        // hidden reasoning pass, and reject requests where max_tokens doesn't
        // leave room for it. The error names the exact minimum — retry once
        // with a max_tokens value above that minimum plus a safety margin for
        // the actual visible completion.
        const budgetMatch = bodyText.match(
          /max_completion_tokens\s*\[\s*(\d+)\s*\]\s*must be greater than\s*thinking_budget\s*\[\s*(\d+)\s*\]/i,
        );
        if (res.status === 400 && budgetMatch) {
          throw new AiMaxTokensError(parseInt(budgetMatch[2], 10));
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

    // Retry loop: drop unsupported params or widen max_tokens one at a time.
    // Each retry narrows/adjusts the request shape so a subsequent rejection
    // from an earlier retry is also handled (e.g. reasoning mandatory *and*
    // thinking-budget-too-small).
    let includeResponseFormat = Boolean(responseFormat);
    let includeReasoning = true;
    let currentMaxTokens = maxTokens;
    let maxTokensAdjusted = false;
    let lastErr = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await tryFetch(includeResponseFormat, includeReasoning, currentMaxTokens);
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
        // Widen max_tokens once when the model's mandatory reasoning needs
        // more room than we requested.
        if (err instanceof AiMaxTokensError && !maxTokensAdjusted) {
          currentMaxTokens = err.requiredMinimum + 2048;
          maxTokensAdjusted = true;
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

/**
 * Thrown when a reasoning-mandatory model rejects the request because
 * max_completion_tokens doesn't leave room for its internal "thinking
 * budget" (e.g. qwen3.8-max's default xhigh reasoning effort reserves
 * 32768 tokens). Caught internally by AiProviderClient.chat() to retry
 * once with a widened max_tokens; only surfaces to callers if that retry
 * also fails.
 */
export class AiMaxTokensError extends Error {
  constructor(requiredMinimum) {
    super(
      `Model requires max_tokens greater than its reasoning thinking budget (${requiredMinimum})`,
    );
    this.name = "AiMaxTokensError";
    this.requiredMinimum = requiredMinimum;
  }

  /**
   * A user-friendly error message suitable for display in the UI.
   * @returns {string}
   */
  get userMessage() {
    return `This model reserves ${this.requiredMinimum.toLocaleString()} tokens for internal reasoning, which left no room for the actual output. Try a model with a smaller reasoning budget, or increase the output length setting.`;
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
    // The full, untruncated raw body remains on `.body` for DevTools inspection.
  }

  /**
   * A user-friendly error message suitable for display in the UI.
   * Translates common HTTP status codes and provider error patterns into
   * actionable guidance.
   * @returns {string}
   */
  get userMessage() {
    const summary = sanitizeErrorBody(this.body);
    const lower = (summary || "").toLowerCase();

    // Auth errors
    if (this.status === 401) {
      return "Invalid API key — check your settings and try again.";
    }
    if (this.status === 403) {
      if (lower.includes("quota") || lower.includes("billing") || lower.includes("credit")) {
        return "API quota or billing issue — check your provider account.";
      }
      return "API key doesn't have access to this model — check your settings.";
    }

    // Rate limits
    if (this.status === 429) {
      return "Rate limit reached — wait a moment and try again.";
    }

    // Bad request — try to extract a useful detail. Image/vision keywords
    // are checked first because vision APIs often phrase image size/resolution
    // limits in terms of "tokens" (e.g. "image exceeds token budget"), which
    // would otherwise be misclassified as a context-window error below.
    if (this.status === 400) {
      if (lower.includes("image") || lower.includes("vision") || lower.includes("multimodal")) {
        return "This model doesn't support image input (or rejected an image) — disable the vision toggle or try a different model.";
      }
      if (lower.includes("thinking_budget") || lower.includes("thinking budget")) {
        return "This model's reasoning budget left no room for the actual output — try a model with a smaller reasoning budget, or increase the output length setting.";
      }
      if (
        lower.includes("context_length") ||
        lower.includes("maximum context") ||
        lower.includes("too long") ||
        (lower.includes("token") && (lower.includes("exceed") || lower.includes("limit")))
      ) {
        return "The deck is too large for this model's context window — try a smaller deck or a model with a larger context.";
      }
      if (lower.includes("invalid_parameter") || lower.includes("param")) {
        return `The AI provider rejected a parameter (${summary}). Try a different model or disable reasoning.`;
      }
      return `The AI provider rejected the request: ${summary}`;
    }

    // Not found
    if (this.status === 404) {
      return "Model not found — check the model name in your settings.";
    }

    // Server errors
    if (this.status >= 500) {
      return "The AI provider is having issues — try again in a moment.";
    }

    // Generic fallback
    return summary
      ? `The AI request failed (HTTP ${this.status}): ${summary}`
      : `The AI request failed (HTTP ${this.status}).`;
  }
}

/**
 * Extract a short, sanitized excerpt from a provider error body for display.
 * Strips lines that look like echoed request headers / credentials, collapses
 * whitespace, and caps the length. Attempts to parse JSON error bodies to
 * extract the most useful message (OpenRouter wraps upstream errors in
 * metadata.raw; OpenAI/Anthropic use error.message).
 * @param {string} body
 * @returns {string}
 */
/**
 * Combine an error object's `code` and `message` fields into one string so
 * downstream keyword classification (see AiHttpError.userMessage) has access
 * to both the machine-readable code (e.g. "invalid_parameter_error") and the
 * human-readable message. Many providers put the most diagnostic detail in
 * `code` while `message` is generic (or vice versa), so neither field alone
 * is reliable.
 * @param {object} err — parsed error object with optional `code`/`message`
 * @returns {string}
 */
function formatErrorFields(err) {
  const parts = [];
  if (typeof err.code === "string" && err.code) parts.push(err.code);
  if (typeof err.message === "string" && err.message) parts.push(err.message);
  return parts.join(": ");
}

/**
 * Redact credential-shaped substrings (API keys, bearer/basic auth tokens,
 * JSON credential fields) from a string. Applied to every error message we
 * surface to the user, regardless of whether it came from JSON parsing or
 * raw text cleanup, since providers commonly echo the offending credential
 * back inside a JSON `message`/`code` field.
 * @param {string} text
 * @returns {string}
 */
function redactCredentials(text) {
  return text
    .replace(/sk-[A-Za-z0-9_.+/=-]{20,}/g, "sk-[redacted]")
    .replace(/AIza[0-9A-Za-z_-]{35,}/g, "[google-api-key]")
    .replace(/Bearer\s+[A-Za-z0-9_.+/=-]{15,}/gi, "Bearer [redacted]")
    .replace(/Basic\s+[A-Za-z0-9+/=]{20,}/gi, "Basic [redacted]")
    .replace(/"(api[_-]?key|key|token)"\s*:\s*"[^"]{10,}"/gi, '"$1": "[redacted]"');
}

function sanitizeErrorBody(body) {
  if (!body) return "";
  const text = String(body);

  // Try to parse as JSON and extract a meaningful error message.
  // Provider error formats:
  //   OpenAI:      {"error": {"message": "...", "code": "..."}}
  //   Anthropic:   {"error": {"message": "...", "type": "..."}}
  //   Gemini:      {"error": {"message": "...", "status": "..."}}
  //   OpenRouter:  {"error": {"message": "Provider returned error",
  //                            "metadata": {"raw": "data: {\"error\":...}"}}}
  //                — the useful message is inside metadata.raw, which may
  //                  itself be JSON or a streaming "data:" line.
  try {
    const parsed = JSON.parse(text);
    const err = parsed.error || parsed;

    // OpenRouter wraps the upstream error in metadata.raw — prefer the
    // upstream provider's own error (message + code) when present, since
    // OpenRouter's outer message is often just the generic
    // "Provider returned error" and its code carries no diagnostic value.
    if (err.metadata?.raw) {
      const rawText = String(err.metadata.raw);
      // metadata.raw may be a streaming line: "data: {\"error\":{...}}"
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const rawParsed = JSON.parse(jsonMatch[0]);
          const rawErr = rawParsed.error || rawParsed;
          const combined = formatErrorFields(rawErr);
          if (combined) return redactCredentials(combined).slice(0, 200);
        } catch {
          // fall through to the outer message
        }
      }
    }

    const combined = formatErrorFields(err);
    if (combined) return redactCredentials(combined).slice(0, 200);
  } catch {
    // Not JSON — fall through to text cleanup
  }

  // Drop lines that look like headers or credential echoes.
  const cleaned = redactCredentials(
    text
      .split("\n")
      // Only drop header-style lines that echo the request's auth header —
      // most provider errors are a single-line JSON body (e.g.
      // {"error":"Invalid api_key provided"}) and a broader keyword filter
      // would blank out the actual error message the user needs to see. The
      // inline redaction patterns below still catch credentials embedded in
      // JSON error bodies.
      .filter((line) => !/^\s*(authorization|x-api-key|api-key)\s*:/i.test(line))
      .join(" "),
  )
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned.slice(0, 200);
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
