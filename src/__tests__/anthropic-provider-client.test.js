import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AnthropicProviderClient } from "../data/ai/anthropic-provider-client.js";
import { AiAbortError, AiHttpError, AiParseError } from "../data/ai/ai-provider-client.js";

describe("AnthropicProviderClient", () => {
  const makeClient = (overrides = {}) =>
    new AnthropicProviderClient({
      getBaseUrl: () => "https://api.anthropic.com",
      getApiKey: () => "sk-ant-test",
      getModel: () => "claude-sonnet-4-20250514",
      ...overrides,
    });

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the messages body to /v1/messages", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "ok" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    });

    const client = makeClient();
    const res = await client.chat({
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "hi" },
      ],
      maxTokens: 1000,
      responseFormat: null,
      reasoning: null,
    });

    expect(res.content).toBe("ok");
    expect(res.raw.finish_reason).toBe("stop");
    expect(res.usage).toEqual({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("sk-ant-test");
    expect(init.headers["anthropic-version"]).toBe("2023-06-01");

    const body = JSON.parse(init.body);
    expect(body.model).toBe("claude-sonnet-4-20250514");
    expect(body.max_tokens).toBe(1000);
    expect(body.system).toBe("You are helpful.");
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(body.thinking).toBeUndefined();
  });

  it("maps stop_reason max_tokens to finish_reason length", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "trunc" }],
        stop_reason: "max_tokens",
      }),
    });

    const client = makeClient();
    const res = await client.chat({
      messages: [],
      maxTokens: 100,
      responseFormat: null,
      reasoning: null,
    });
    expect(res.raw.finish_reason).toBe("length");
  });

  it("concatenates multiple text content blocks", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          { type: "text", text: "first" },
          { type: "text", text: "second" },
        ],
        stop_reason: "end_turn",
      }),
    });

    const client = makeClient();
    const res = await client.chat({
      messages: [],
      maxTokens: 100,
      responseFormat: null,
      reasoning: null,
    });
    expect(res.content).toBe("firstsecond");
  });

  it("adds JSON-only system instruction when response_format is json_object", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "{}" }],
        stop_reason: "end_turn",
      }),
    });

    const client = makeClient();
    await client.chat({
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "go" },
      ],
      maxTokens: 100,
      responseFormat: { type: "json_object" },
      reasoning: null,
    });

    const { body } = globalThis.fetch.mock.calls[0][1];
    const parsed = JSON.parse(body);
    expect(parsed.system).toContain("Return only valid JSON");
  });

  it("enables thinking when reasoning is requested", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "ok" }],
        stop_reason: "end_turn",
      }),
    });

    const client = makeClient();
    await client.chat({
      messages: [{ role: "user", content: "go" }],
      maxTokens: 10000,
      responseFormat: null,
      reasoning: { effort: "high" },
    });

    const { body } = globalThis.fetch.mock.calls[0][1];
    const parsed = JSON.parse(body);
    expect(parsed.thinking).toEqual({ type: "enabled", budget_tokens: expect.any(Number) });
    expect(parsed.thinking.budget_tokens).toBeGreaterThanOrEqual(1024);
    expect(parsed.thinking.budget_tokens).toBeLessThan(10000);
  });

  it("throws AiHttpError when the API key is missing", async () => {
    const client = makeClient({ getApiKey: () => "" });
    await expect(
      client.chat({ messages: [], maxTokens: 100, responseFormat: null, reasoning: null }),
    ).rejects.toThrow(AiHttpError);
  });

  it("throws AiHttpError on non-2xx response", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "invalid x-api-key",
    });

    const client = makeClient();
    await expect(
      client.chat({ messages: [], maxTokens: 100, responseFormat: null, reasoning: null }),
    ).rejects.toThrow(AiHttpError);
  });

  it("throws AiParseError when no text content is returned", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ content: [] }),
    });

    const client = makeClient();
    await expect(
      client.chat({ messages: [], maxTokens: 100, responseFormat: null, reasoning: null }),
    ).rejects.toThrow(AiParseError);
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
});
