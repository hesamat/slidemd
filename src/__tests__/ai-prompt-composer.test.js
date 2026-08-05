import { describe, it, expect } from "vitest";
import { AiPromptComposer } from "../data/ai/ai-prompt-composer.js";

describe("AiPromptComposer", () => {
  it("replaces a single placeholder", () => {
    const composer = new AiPromptComposer({
      systemFragment: "You are helpful.",
      userFragment: "Input: {{markdown}}",
    });
    const { system, user } = composer.compose({ markdown: "# Title" });
    expect(system).toBe("You are helpful.");
    expect(user).toBe("Input: # Title");
  });

  it("replaces multiple placeholders", () => {
    const composer = new AiPromptComposer({
      systemFragment: "System.",
      userFragment: "Input: {{markdown}}\nLayouts: {{layoutList}}",
    });
    const { user } = composer.compose({ markdown: "# Title", layoutList: "header-content" });
    expect(user).toContain("# Title");
    expect(user).toContain("header-content");
    expect(user).not.toContain("{{markdown}}");
    expect(user).not.toContain("{{layoutList}}");
  });

  it("leaves missing placeholders as-is", () => {
    const composer = new AiPromptComposer({
      systemFragment: "System.",
      userFragment: "Input: {{markdown}}\nExtra: {{extra}}",
    });
    const { user } = composer.compose({ markdown: "# Title" });
    expect(user).toBe("Input: # Title\nExtra: {{extra}}");
  });
});
