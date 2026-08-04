import { describe, it, expect } from "vitest";
import { createAiProviderClient } from "../data/ai/ai-provider-factory.js";
import { AiProviderClient } from "../data/ai/ai-provider-client.js";
import { AnthropicProviderClient } from "../data/ai/anthropic-provider-client.js";
import { GeminiProviderClient } from "../data/ai/gemini-provider-client.js";
import { OpenAIResponsesClient } from "../data/ai/openai-responses-client.js";

const noop = () => "";
const makeFactory = (getModel) => (provider) =>
  createAiProviderClient(provider, noop, noop, getModel || noop);

describe("createAiProviderClient", () => {
  it("returns AiProviderClient for OpenRouter", () => {
    const client = makeFactory()("OpenRouter");
    expect(client).toBeInstanceOf(AiProviderClient);
  });

  it("returns AiProviderClient for OpenAI", () => {
    const client = makeFactory()("OpenAI");
    expect(client).toBeInstanceOf(AiProviderClient);
  });

  it("returns AiProviderClient for Ollama", () => {
    const client = makeFactory()("Ollama");
    expect(client).toBeInstanceOf(AiProviderClient);
  });

  it("returns AiProviderClient for LM Studio", () => {
    const client = makeFactory()("LM Studio");
    expect(client).toBeInstanceOf(AiProviderClient);
  });

  it("returns AiProviderClient for Custom", () => {
    const client = makeFactory()("Custom");
    expect(client).toBeInstanceOf(AiProviderClient);
  });

  it("returns AnthropicProviderClient for Anthropic", () => {
    const client = makeFactory()("Anthropic");
    expect(client).toBeInstanceOf(AnthropicProviderClient);
  });

  it("returns GeminiProviderClient for Gemini", () => {
    const client = makeFactory()("Gemini");
    expect(client).toBeInstanceOf(GeminiProviderClient);
  });

  it("returns AiProviderClient for OpenCode with chat-completions model", () => {
    const client = makeFactory(() => "grok-4.5")("OpenCode");
    expect(client).toBeInstanceOf(AiProviderClient);
  });

  it("returns OpenAIResponsesClient for OpenCode with responses model", () => {
    const client = makeFactory(() => "gpt-5.6-luna")("OpenCode");
    expect(client).toBeInstanceOf(OpenAIResponsesClient);
  });

  it("returns AnthropicProviderClient for OpenCode with messages model", () => {
    const client = makeFactory(() => "minimax-m3")("OpenCode");
    expect(client).toBeInstanceOf(AnthropicProviderClient);
  });

  it("defaults to chat-completions for unknown OpenCode model", () => {
    const client = makeFactory(() => "unknown-model")("OpenCode");
    expect(client).toBeInstanceOf(AiProviderClient);
  });
});
