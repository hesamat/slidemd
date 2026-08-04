import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GeminiProviderClient } from "../data/ai/gemini-provider-client.js";
import { AiAbortError, AiHttpError, AiParseError } from "../data/ai/ai-provider-client.js";

describe("GeminiProviderClient", () => {
  const makeClient = (overrides = {}) =>
    new GeminiProviderClient({
      getBaseUrl: () => "https://generativelanguage.googleapis.com/v1beta",
      getApiKey: () => "AIzaGeminiKey",
      getModel: () => "gemini-2.0-flash",
      ...overrides,
    });

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the content to /v1beta/models/{model}:generateContent with the API key in header", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: { role: "model", parts: [{ text: "ok" }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
      }),
    });

    const client = makeClient();
    const res = await client.chat({
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "hi" },
      ],
      maxTokens: 1000,
      responseFormat: { type: "json_object" },
      reasoning: null,
    });

    expect(res.content).toBe("ok");
    expect(res.raw.finish_reason).toBe("stop");
    expect(res.usage).toEqual({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });

    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("models/gemini-2.0-flash:generateContent");
    expect(url).not.toContain("?key=");
    expect(opts.headers["x-goog-api-key"]).toBe("AIzaGeminiKey");

    const { body } = opts;
    const parsed = JSON.parse(body);
    expect(parsed.systemInstruction).toEqual({ parts: [{ text: "You are helpful." }] });
    expect(parsed.contents).toEqual([{ role: "user", parts: [{ text: "hi" }] }]);
    expect(parsed.generationConfig.maxOutputTokens).toBe(1000);
    expect(parsed.generationConfig.responseMimeType).toBe("application/json");
  });

  it("maps assistant messages to model role", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "ok" }] } }],
      }),
    });

    const client = makeClient();
    await client.chat({
      messages: [
        { role: "user", content: "go" },
        { role: "assistant", content: "doing" },
        { role: "user", content: "next" },
      ],
      maxTokens: 100,
      responseFormat: null,
      reasoning: null,
    });

    const { body } = globalThis.fetch.mock.calls[0][1];
    const parsed = JSON.parse(body);
    expect(parsed.contents).toEqual([
      { role: "user", parts: [{ text: "go" }] },
      { role: "model", parts: [{ text: "doing" }] },
      { role: "user", parts: [{ text: "next" }] },
    ]);
  });

  it("maps MAX_TOKENS finish reason to length", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "trunc" }] }, finishReason: "MAX_TOKENS" }],
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

  it("concatenates multiple parts", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "a" }, { text: "b" }] } }],
      }),
    });

    const client = makeClient();
    const res = await client.chat({
      messages: [],
      maxTokens: 100,
      responseFormat: null,
      reasoning: null,
    });
    expect(res.content).toBe("ab");
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
      status: 400,
      text: async () => "API key not valid",
    });

    const client = makeClient();
    await expect(
      client.chat({ messages: [], maxTokens: 100, responseFormat: null, reasoning: null }),
    ).rejects.toThrow(AiHttpError);
  });

  it("throws AiParseError when no candidates content is returned", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [] }),
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
