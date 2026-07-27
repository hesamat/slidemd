import { describe, it, expect } from "vitest";
import { extractMarkdown, estimateTokens } from "../data/ai-enhancer.js";

describe("extractMarkdown", () => {
  it("returns plain text unchanged", () => {
    expect(extractMarkdown("hello world")).toBe("hello world");
  });

  it("strips ```markdown wrapper", () => {
    const input = "```markdown\n# Slide\n\nContent\n```";
    expect(extractMarkdown(input)).toBe("# Slide\n\nContent");
  });

  it("strips ``` wrapper without language", () => {
    const input = "```\n# Slide\nContent\n```";
    expect(extractMarkdown(input)).toBe("# Slide\nContent");
  });

  it("strips ```slide wrapper", () => {
    const input = "```slide\n# Slide\nContent\n```";
    expect(extractMarkdown(input)).toBe("# Slide\nContent");
  });

  it("preserves internal code fences", () => {
    const input = "```markdown\n# Slide\n\n```python\ncode\n```\n```";
    expect(extractMarkdown(input)).toContain("```python");
  });
});

describe("estimateTokens", () => {
  it("estimates roughly 1 token per 4 chars", () => {
    expect(estimateTokens("1234")).toBe(1);
    expect(estimateTokens("12345678")).toBe(2);
  });

  it("rounds up", () => {
    expect(estimateTokens("123")).toBe(1);
    expect(estimateTokens("12345")).toBe(2);
  });
});
