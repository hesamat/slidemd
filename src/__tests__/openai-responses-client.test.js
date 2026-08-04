import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenAIResponsesClient } from "../data/ai/openai-responses-client.js";
import { AiAbortError, AiHttpError, AiParseError } from "../data/ai/ai-provider-client.js";

describe("OpenAIResponsesClient", () => {
  const makeClient = (overrides = {}) =>
    new OpenAIResponsesClient({
      getBaseUrl: () => "https://api.openai.com",
      getApiKey: () => "sk-test",
      getModel: () => "gpt-5.6-luna",
      ...overrides,
    });

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the responses body to /v1/responses", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "completed",
        output: [
          {
            type: "message",
            status: "completed",
            content: [{ type: "output_text", text: "hello" }],
          },
        ],
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

    expect(res.content).toBe("hello");
    expect(res.raw.finish_reason).toBe("stop");
    expect(res.usage).toEqual({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init.headers.Authorization).toBe("Bearer sk-test");

    const body = JSON.parse(init.body);
    expect(body.model).toBe("gpt-5.6-luna");
    expect(body.max_output_tokens).toBe(1000);
    expect(body.instructions).toBe("You are helpful.");
    expect(body.input).toEqual([{ role: "user", content: "hi" }]);
  });

  it("sets text.format when responseFormat is json_object", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }],
      }),
    });

    const client = makeClient();
    await client.chat({
      messages: [{ role: "user", content: "go" }],
      maxTokens: 100,
      responseFormat: { type: "json_object" },
      reasoning: null,
    });

    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.text).toEqual({ format: { type: "json_object" } });
  });

  it("passes reasoning through when provided", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }],
      }),
    });

    const client = makeClient();
    await client.chat({
      messages: [{ role: "user", content: "go" }],
      maxTokens: 100,
      responseFormat: null,
      reasoning: { effort: "high" },
    });

    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.reasoning).toEqual({ effort: "high" });
  });

  it("maps incomplete status to finish_reason length", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "incomplete",
        output: [{ type: "message", content: [{ type: "output_text", text: "trunc" }] }],
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

  it("concatenates multiple output_text parts", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              { type: "output_text", text: "first" },
              { type: "output_text", text: "second" },
            ],
          },
        ],
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
      text: async () => "invalid api key",
    });

    const client = makeClient();
    await expect(
      client.chat({ messages: [], maxTokens: 100, responseFormat: null, reasoning: null }),
    ).rejects.toThrow(AiHttpError);
  });

  it("throws AiParseError when no output text is returned", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: "completed", output: [] }),
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
