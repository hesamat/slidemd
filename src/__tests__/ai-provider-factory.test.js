import { describe, it, expect } from "vitest";
import { createAiProviderClient } from "../data/ai/ai-provider-factory.js";
import { AiProviderClient } from "../data/ai/ai-provider-client.js";
import { AnthropicProviderClient } from "../data/ai/anthropic-provider-client.js";
import { GeminiProviderClient } from "../data/ai/gemini-provider-client.js";

const noop = () => "";

describe("createAiProviderClient", () => {
  it("returns AiProviderClient for OpenRouter", () => {
    expect(createAiProviderClient("OpenRouter", noop, noop, noop)).toBeInstanceOf(AiProviderClient);
  });

  it("returns AiProviderClient for OpenAI", () => {
    expect(createAiProviderClient("OpenAI", noop, noop, noop)).toBeInstanceOf(AiProviderClient);
  });

  it("returns AiProviderClient for Ollama", () => {
    expect(createAiProviderClient("Ollama", noop, noop, noop)).toBeInstanceOf(AiProviderClient);
  });

  it("returns AiProviderClient for LM Studio", () => {
    expect(createAiProviderClient("LM Studio", noop, noop, noop)).toBeInstanceOf(AiProviderClient);
  });

  it("returns AiProviderClient for Custom", () => {
    expect(createAiProviderClient("Custom", noop, noop, noop)).toBeInstanceOf(AiProviderClient);
  });

  it("returns AnthropicProviderClient for Anthropic", () => {
    expect(createAiProviderClient("Anthropic", noop, noop, noop)).toBeInstanceOf(
      AnthropicProviderClient,
    );
  });

  it("returns GeminiProviderClient for Gemini", () => {
    expect(createAiProviderClient("Gemini", noop, noop, noop)).toBeInstanceOf(GeminiProviderClient);
  });
});
