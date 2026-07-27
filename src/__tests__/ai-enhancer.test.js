import { describe, it, expect } from "vitest";
import { extractMarkdown, stripImagesForAI, estimateTokens } from "../data/ai-enhancer.js";

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

  it("preserves internal code fences", () => {
    const input = "```markdown\n# Slide\n\n```python\ncode\n```\n```";
    expect(extractMarkdown(input)).toContain("```python");
  });
});

describe("stripImagesForAI", () => {
  it("removes img tags", () => {
    const input = "Text before <img src=\"images/photo.jpg\" width=\"100\"> text after";
    expect(stripImagesForAI(input)).toBe("Text before  text after");
  });

  it("removes multiple img tags", () => {
    const input = "<img src=\"a.jpg\"><img src=\"b.png\">";
    expect(stripImagesForAI(input)).toBe("");
  });

  it("collapses extra newlines", () => {
    const input = "Line 1\n\n\n\nLine 2";
    expect(stripImagesForAI(input)).toBe("Line 1\n\nLine 2");
  });

  it("preserves non-image content", () => {
    const input = "# Title\n\n- Item 1\n- Item 2";
    expect(stripImagesForAI(input)).toBe("# Title\n\n- Item 1\n- Item 2");
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
