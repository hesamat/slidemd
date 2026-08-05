import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  AiProviderClient,
  AiAbortError,
  AiHttpError,
  AiParseError,
  AiReasoningError,
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
      json: async () => ({
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
      json: async () => ({ choices: [] }),
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
      json: async () => ({
        choices: [{ message: { content: "ok" } }],
      }),
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
        json: async () => ({
          choices: [{ message: { content: "fallback ok" } }],
        }),
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
        json: async () => ({
          choices: [{ message: { content: "reasoning ok" } }],
        }),
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
});
