import { describe, it, expect } from "vitest";
import { extractMarkdown } from "../data/ai-enhancer.js";

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

  it("trims whitespace from response", () => {
    expect(extractMarkdown("  hello  ")).toBe("hello");
  });

  it("handles empty string", () => {
    expect(extractMarkdown("")).toBe("");
  });

  it("preserves internal code fences", () => {
    const input = "```markdown\n# Slide\n\n```python\ncode\n```\n```";
    expect(extractMarkdown(input)).toContain("```python");
  });
});
