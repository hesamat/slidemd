import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  AiProviderClient,
  AiAbortError,
  AiHttpError,
  AiParseError,
  AiMaxTokensError,
} from "../data/ai/ai-provider-client.js";

describe("AiProviderClient", () => {
  const makeClient = (overrides = {}) =>
    new AiProviderClient({
      getBaseUrl: () => "https://api.example.com/v1",
      getApiKey: () => "sk-test",
      getModel: () => "test-model",
      ...overrides,
    });

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed content on success", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: "hello" }, finish_reason: "stop" }],
          usage: { total_tokens: 1 },
        }),
    });

    const client = makeClient();
    const res = await client.chat({
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 100,
      responseFormat: null,
      reasoning: null,
    });

    expect(res.content).toBe("hello");
    expect(res.usage).toEqual({ total_tokens: 1 });
    expect(res.raw.choices[0].finish_reason).toBe("stop");
  });

  it("throws AiAbortError when the signal is already aborted", async () => {
    const client = makeClient();
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.chat(
        { messages: [], maxTokens: 100, responseFormat: null, reasoning: null },
        controller.signal,
      ),
    ).rejects.toThrow(AiAbortError);
  });

  it("throws AiHttpError on non-2xx response", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad request",
    });

    const client = makeClient();
    await expect(
      client.chat({ messages: [], maxTokens: 100, responseFormat: null, reasoning: null }),
    ).rejects.toThrow(AiHttpError);
  });

  it("throws AiParseError when content is missing", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ choices: [] }),
    });

    const client = makeClient();
    await expect(
      client.chat({ messages: [], maxTokens: 100, responseFormat: null, reasoning: null }),
    ).rejects.toThrow(AiParseError);
  });

  it("omits Authorization header when the API key is empty", async () => {
    const client = makeClient({
      getBaseUrl: () => "http://localhost:11434/v1",
      getApiKey: () => "",
    });

    globalThis.fetch.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
    });

    await client.chat({
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 100,
      responseFormat: null,
      reasoning: null,
    });

    const [, init] = globalThis.fetch.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("throws early when OpenRouter has no API key", async () => {
    const client = makeClient({
      getBaseUrl: () => "https://openrouter.ai/api/v1",
      getApiKey: () => "",
      getProvider: () => "OpenRouter",
    });

    await expect(
      client.chat({
        messages: [{ role: "user", content: "hi" }],
        maxTokens: 100,
        responseFormat: null,
        reasoning: null,
      }),
    ).rejects.toThrow("OpenRouter API key is required");

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("throws early when OpenAI has no API key", async () => {
    const client = makeClient({
      getBaseUrl: () => "https://api.openai.com/v1",
      getApiKey: () => "",
      getProvider: () => "OpenAI",
    });

    await expect(
      client.chat({
        messages: [{ role: "user", content: "hi" }],
        maxTokens: 100,
        responseFormat: null,
        reasoning: null,
      }),
    ).rejects.toThrow("OpenAI API key is required");

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("retries once without response_format when the provider rejects it", async () => {
    const client = makeClient();
    globalThis.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"error": {"message": "response_format is not supported"}}',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ choices: [{ message: { content: "fallback ok" } }] }),
      });

    const res = await client.chat({
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 100,
      responseFormat: { type: "json_object" },
      reasoning: null,
    });

    expect(res.content).toBe("fallback ok");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    const firstBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    const secondBody = JSON.parse(globalThis.fetch.mock.calls[1][1].body);
    expect(firstBody.response_format).toEqual({ type: "json_object" });
    expect(secondBody.response_format).toBeUndefined();
  });

  it("retries without reasoning when the model requires it (effort:none rejected)", async () => {
    const client = makeClient({
      getBaseUrl: () => "https://openrouter.ai/api/v1",
      getProvider: () => "OpenRouter",
    });
    globalThis.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () =>
          '{"error":{"message":"Reasoning is mandatory for this endpoint and cannot be disabled.","code":400}}',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ choices: [{ message: { content: "reasoning ok" } }] }),
      });

    const res = await client.chat({
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 100,
      responseFormat: null,
      reasoning: null, // → effectiveReasoning { effort: "none" } for OpenRouter
    });

    expect(res.content).toBe("reasoning ok");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    const firstBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    const secondBody = JSON.parse(globalThis.fetch.mock.calls[1][1].body);
    expect(firstBody.reasoning).toEqual({ effort: "none" });
    expect(secondBody.reasoning).toBeUndefined();
  });

  it("does not retry on parse error when responseFormat is null", async () => {
    // When responseFormat is null (the common orchestrator case), a parse
    // error (malformed JSON or missing content) must NOT trigger a retry —
    // the retry would be a byte-identical request and waste an API call.
    const client = makeClient();
    globalThis.fetch.mockResolvedValue({
      ok: true,
      text: async () => "not json at all",
    });

    await expect(
      client.chat({ messages: [], maxTokens: 100, responseFormat: null, reasoning: null }),
    ).rejects.toThrow(AiParseError);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("AiHttpError message includes a sanitized body summary", async () => {
    const client = makeClient();
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":{"message":"model not found"}}',
    });

    try {
      await client.chat({
        messages: [],
        maxTokens: 100,
        responseFormat: null,
        reasoning: null,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AiHttpError);
      expect(err.message).toContain("HTTP 400");
      expect(err.message).toContain("model not found");
      // Full body preserved for DevTools
      expect(err.body).toContain("model not found");
    }
  });

  it("AiHttpError message strips credential-like lines from the body", async () => {
    const client = makeClient();
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () =>
        'Authorization: Bearer sk-secret-key\nx-api-key: sk-leaked\n{"error":"unauthorized"}',
    });

    try {
      await client.chat({
        messages: [],
        maxTokens: 100,
        responseFormat: null,
        reasoning: null,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AiHttpError);
      expect(err.message).not.toContain("sk-secret-key");
      expect(err.message).not.toContain("sk-leaked");
      expect(err.message).not.toContain("Bearer");
      expect(err.message).not.toContain("x-api-key");
      expect(err.message).toContain("unauthorized");
    }
  });

  it("AiHttpError redacts inline sk- keys in JSON body lines", async () => {
    const client = makeClient();
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"error":"invalid key sk-abcdefghijklmnopqrstuvwxyz1234567890"}',
    });

    try {
      await client.chat({
        messages: [],
        maxTokens: 100,
        responseFormat: null,
        reasoning: null,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AiHttpError);
      expect(err.message).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
      expect(err.message).toContain("sk-[redacted]");
    }
  });

  it("AiHttpError redacts sk- keys echoed inside a JSON error.message field", async () => {
    const client = makeClient();
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () =>
        JSON.stringify({
          error: {
            code: "invalid_api_key",
            message: "Incorrect API key provided: sk-abcdefghijklmnopqrstuvwxyz1234567890",
          },
        }),
    });

    try {
      await client.chat({
        messages: [],
        maxTokens: 100,
        responseFormat: null,
        reasoning: null,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AiHttpError);
      expect(err.message).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
      expect(err.message).toContain("sk-[redacted]");
    }
  });

  it("AiHttpError redacts a Bearer token echoed inside a JSON error.message field", async () => {
    const client = makeClient();
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () =>
        JSON.stringify({
          error: {
            message: "Rejected credential Bearer abcdefghijklmnopqrstuvwxyz123456",
          },
        }),
    });

    try {
      await client.chat({
        messages: [],
        maxTokens: 100,
        responseFormat: null,
        reasoning: null,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AiHttpError);
      expect(err.message).not.toContain("Bearer abcdefghijklmnopqrstuvwxyz");
      expect(err.message).toContain("Bearer [redacted]");
    }
  });

  it("throws AiHttpError (not AiReasoningError) when reasoning was not sent", async () => {
    // Non-OpenRouter provider with reasoning: null — effectiveReasoning is null,
    // so a 400 mentioning "reasoning is mandatory" should NOT be converted to
    // AiReasoningError (which would lose the HTTP status/body detail).
    const client = makeClient({
      getBaseUrl: () => "https://api.openai.com/v1",
      getProvider: () => "OpenAI",
    });
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":{"message":"reasoning is mandatory for this model"}}',
    });

    try {
      await client.chat({
        messages: [],
        maxTokens: 100,
        responseFormat: null,
        reasoning: null,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AiHttpError);
      expect(err.status).toBe(400);
      expect(err.message).toContain("HTTP 400");
    }
  });

  it("retries without reasoning when OpenRouter model rejects effort:none (qwen3.8-max)", async () => {
    // qwen3.8-max has mandatory reasoning with supported_efforts
    // ["xhigh","high","medium","low","minimal"] — no "none".
    // When reasoning is disabled, we send {effort:"none"} which the model
    // rejects with invalid_parameter_error. The retry should drop the reasoning
    // param entirely and succeed.
    const client = makeClient({
      getBaseUrl: () => "https://openrouter.ai/api/v1",
      getProvider: () => "OpenRouter",
    });
    globalThis.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            error: {
              message: "Provider returned error",
              code: 400,
              metadata: {
                raw: 'data: {"error":{"code":"invalid_parameter_error","param":null,"message":"Unsupported reasoning effort: none"}}',
              },
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: "success" } }],
          }),
      });

    const result = await client.chat({
      messages: [{ role: "user", content: "test" }],
      maxTokens: 100,
      responseFormat: null,
      reasoning: null, // user disabled reasoning → we send {effort:"none"}
    });

    expect(result.content).toBe("success");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    // First call sent reasoning with effort:none
    const firstBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(firstBody.reasoning).toEqual({ effort: "none" });
    // Second call should NOT have reasoning at all
    const secondBody = JSON.parse(globalThis.fetch.mock.calls[1][1].body);
    expect(secondBody.reasoning).toBeUndefined();
  });

  it("retries with widened max_tokens when reasoning thinking_budget exceeds it (qwen3.8-max)", async () => {
    // Real-world qwen3.8-max error: max_completion_tokens [24000] must be
    // greater than thinking_budget [32768] (mandatory reasoning reserves a
    // large token budget for its hidden reasoning pass).
    const client = makeClient({
      getBaseUrl: () => "https://openrouter.ai/api/v1",
      getProvider: () => "OpenRouter",
    });
    globalThis.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            error: {
              message: "Provider returned error",
              code: 400,
              metadata: {
                raw: 'data: {"error":{"code":"invalid_parameter_error","param":null,"message":"max_completion_tokens [24000] must be greater than thinking_budget [32768]","type":"invalid_request_error"},"id":"chatcmpl-abc"}',
              },
              provider_name: "Alibaba",
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: "success" } }],
          }),
      });

    const result = await client.chat({
      messages: [{ role: "user", content: "test" }],
      maxTokens: 24000,
      responseFormat: null,
      reasoning: { effort: "xhigh" },
    });

    expect(result.content).toBe("success");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    // First call sent the original (too-small) max_tokens
    const firstBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(firstBody.max_tokens).toBe(24000);
    // Second call widened max_tokens above the required thinking budget
    const secondBody = JSON.parse(globalThis.fetch.mock.calls[1][1].body);
    expect(secondBody.max_tokens).toBeGreaterThan(32768);
  });

  it("throws AiMaxTokensError with a friendly userMessage if the widened retry still fails", async () => {
    const client = makeClient();
    const budgetError = {
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          error: {
            code: "invalid_parameter_error",
            message: "max_completion_tokens [24000] must be greater than thinking_budget [32768]",
          },
        }),
    };
    globalThis.fetch.mockResolvedValue(budgetError);

    try {
      await client.chat({
        messages: [{ role: "user", content: "test" }],
        maxTokens: 24000,
        responseFormat: null,
        reasoning: { effort: "xhigh" },
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AiMaxTokensError);
      expect(err.requiredMinimum).toBe(32768);
      expect(err.userMessage).toContain("reasoning budget");
    }
    // Only retried once (bounded), not indefinitely
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  describe("AiHttpError.userMessage", () => {
    it("returns a friendly message for 401 auth errors", () => {
      const err = new AiHttpError(401, '{"error":{"message":"invalid api key"}}');
      expect(err.userMessage).toContain("Invalid API key");
      expect(err.userMessage).not.toContain("HTTP 401");
    });

    it("returns a friendly message for 403 billing errors", () => {
      const err = new AiHttpError(403, '{"error":{"message":"insufficient credits"}}');
      expect(err.userMessage).toContain("quota or billing");
    });

    it("returns a friendly message for 429 rate limits", () => {
      const err = new AiHttpError(429, '{"error":{"message":"too many requests"}}');
      expect(err.userMessage).toContain("Rate limit");
    });

    it("returns a friendly message for 404 model not found", () => {
      const err = new AiHttpError(404, '{"error":{"message":"model not found"}}');
      expect(err.userMessage).toContain("Model not found");
    });

    it("returns a friendly message for 404 image/vision not supported", () => {
      const err = new AiHttpError(
        404,
        '{"error":{"message":"No endpoints found that support image input"}}',
      );
      expect(err.userMessage).toContain("doesn't support image input");
    });

    it("returns a friendly message for 500 server errors", () => {
      const err = new AiHttpError(500, '{"error":{"message":"internal server error"}}');
      expect(err.userMessage).toContain("having issues");
    });

    it("returns a friendly message for 400 invalid_parameter", () => {
      const err = new AiHttpError(
        400,
        '{"error":{"message":"invalid_parameter_error","param":"reasoning"}}',
      );
      expect(err.userMessage).toContain("rejected a parameter");
      expect(err.userMessage).toContain("reasoning");
    });

    it("returns a friendly message for 400 context length", () => {
      const err = new AiHttpError(
        400,
        '{"error":{"message":"context_length_exceeded: too many tokens"}}',
      );
      expect(err.userMessage).toContain("too large");
    });

    it("returns a friendly message for 400 vision not supported", () => {
      const err = new AiHttpError(
        400,
        '{"error":{"message":"model does not support image input"}}',
      );
      expect(err.userMessage).toContain("image input");
    });

    it("classifies image errors that also mention 'token' as vision errors, not context-length", () => {
      // Regression test: vision APIs commonly phrase image size/resolution
      // limits in terms of "tokens" (e.g. "image exceeds token budget"). This
      // must NOT be misclassified as a context-window error — image/vision
      // keywords must be checked first.
      const err = new AiHttpError(
        400,
        '{"error":{"message":"The image content exceeds the maximum allowed token budget for this model"}}',
      );
      expect(err.userMessage).toContain("image input");
      expect(err.userMessage).not.toContain("context window");
    });

    it("includes the error code alongside the message for classification", () => {
      // Alibaba/Qwen via OpenRouter puts the diagnostic code in `code`, not
      // `message` — both must be considered when classifying the error.
      const err = new AiHttpError(
        400,
        '{"error":{"code":"invalid_parameter_error","message":"Invalid image format"}}',
      );
      expect(err.message).toContain("invalid_parameter_error");
      expect(err.message).toContain("Invalid image format");
      expect(err.userMessage).toContain("image input");
    });

    it("extracts the real message from OpenRouter metadata.raw", () => {
      // OpenRouter wraps upstream errors: the useful message is inside metadata.raw
      const body = JSON.stringify({
        error: {
          message: "Provider returned error",
          code: 400,
          metadata: {
            raw: 'data: {"error":{"code":"invalid_parameter_error","param":null,"message":"Unsupported parameter: reasoning"}}',
          },
        },
      });
      const err = new AiHttpError(400, body);
      // The .message (for logs/DevTools) should contain the real upstream
      // message AND code — both are needed for accurate classification.
      expect(err.message).toContain("invalid_parameter_error");
      expect(err.message).toContain("Unsupported parameter: reasoning");
      expect(err.message).not.toContain("Provider returned error");
      // The userMessage should be friendly
      expect(err.userMessage).toContain("rejected a parameter");
    });

    it("falls back to outer message when metadata.raw is not JSON", () => {
      const body = JSON.stringify({
        error: {
          message: "Provider returned error",
          metadata: { raw: "some plain text error" },
        },
      });
      const err = new AiHttpError(400, body);
      expect(err.message).toContain("Provider returned error");
    });
  });
});
