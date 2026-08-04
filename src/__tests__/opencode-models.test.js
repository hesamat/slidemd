import { describe, it, expect } from "vitest";
import {
  OPENCODE_MODELS,
  OPENCODE_BASE_URL,
  getOpenCodeModel,
  getOpenCodeApiStyle,
} from "../data/ai/opencode-models.js";

describe("opencode-models", () => {
  it("exports a non-empty model list", () => {
    expect(OPENCODE_MODELS.length).toBeGreaterThan(0);
  });

  it("includes all three API styles", () => {
    const apis = new Set(OPENCODE_MODELS.map((m) => m.api));
    expect(apis.has("chat-completions")).toBe(true);
    expect(apis.has("responses")).toBe(true);
    expect(apis.has("messages")).toBe(true);
  });

  it("exports the correct base URL", () => {
    expect(OPENCODE_BASE_URL).toBe("https://opencode.ai/zen/go");
  });

  it("finds a model by ID", () => {
    const model = getOpenCodeModel("gpt-5.6-luna");
    expect(model).toBeDefined();
    expect(model.name).toBe("GPT 5.6 Luna");
    expect(model.api).toBe("responses");
  });

  it("returns undefined for unknown model ID", () => {
    expect(getOpenCodeModel("nonexistent")).toBeUndefined();
  });

  it("returns the API style for a known model", () => {
    expect(getOpenCodeApiStyle("grok-4.5")).toBe("chat-completions");
    expect(getOpenCodeApiStyle("gpt-5.6-luna")).toBe("responses");
    expect(getOpenCodeApiStyle("minimax-m3")).toBe("messages");
  });

  it("defaults to chat-completions for unknown model", () => {
    expect(getOpenCodeApiStyle("unknown")).toBe("chat-completions");
  });
});
