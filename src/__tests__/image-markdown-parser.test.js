import { describe, it, expect } from "vitest";
import {
  parseAllImages,
  findFencedRanges,
  parseAllImagesOutsideFences,
} from "../data/image-markdown-parser.js";

describe("parseAllImages", () => {
  it("finds single-line HTML <img> tags", () => {
    const md = '<img src="images/test.png" alt="test">';
    const result = parseAllImages(md);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("html");
    expect(result[0].src).toBe("images/test.png");
  });

  it("finds multiline HTML <img> tags", () => {
    const md = '<img\n  src="images/multi.png"\n  alt="multi"\n>';
    const result = parseAllImages(md);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("html");
    expect(result[0].src).toBe("images/multi.png");
    expect(result[0].fullTag).toBe(md);
  });

  it("finds markdown ![alt](src) images", () => {
    const md = "![alt](images/test.png)";
    const result = parseAllImages(md);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("md");
    expect(result[0].src).toBe("images/test.png");
  });
});

describe("findFencedRanges", () => {
  it("returns no ranges when there are no fences", () => {
    expect(findFencedRanges("plain text\nno fences")).toEqual([]);
  });

  it("finds a single fenced block range", () => {
    const md = "before\n```js\nconst x = 1;\n```\nafter";
    const ranges = findFencedRanges(md);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start).toBe(md.indexOf("```js"));
    // The range ends at the end of the closing fence line (including its newline).
    expect(ranges[0].end).toBeGreaterThan(ranges[0].start);
    expect(md.slice(ranges[0].start, ranges[0].end)).toContain("const x = 1;");
    expect(md.slice(ranges[0].start, ranges[0].end)).toContain("```");
  });

  it("finds multiple fenced block ranges", () => {
    const md = "```\nfoo\n```\nmid\n```\nbar\n```";
    const ranges = findFencedRanges(md);
    expect(ranges).toHaveLength(2);
  });

  it("treats an unclosed fence as running to the end", () => {
    const md = "```\nfoo\nbar";
    const ranges = findFencedRanges(md);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].end).toBe(md.length);
  });

  it("recognizes ~~~ fences", () => {
    const md = "~~~\nfoo\n~~~";
    const ranges = findFencedRanges(md);
    expect(ranges).toHaveLength(1);
  });
});

describe("parseAllImagesOutsideFences", () => {
  it("returns all images when there are no fences", () => {
    const md = '<img src="images/a.png">\n\n![b](images/b.png)';
    const result = parseAllImagesOutsideFences(md);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.src)).toEqual(["images/a.png", "images/b.png"]);
  });

  it("excludes images inside fenced code blocks", () => {
    const md = '<img src="images/real.png">\n\n```html\n<img src="images/code-sample.png">\n```';
    const result = parseAllImagesOutsideFences(md);
    expect(result).toHaveLength(1);
    expect(result[0].src).toBe("images/real.png");
  });

  it("excludes multiline <img> tags inside fenced code blocks", () => {
    const md =
      '<img src="images/real.png">\n\n```html\n<img\n  src="images/multiline-code.png"\n  alt="x"\n>\n```';
    const result = parseAllImagesOutsideFences(md);
    expect(result).toHaveLength(1);
    expect(result[0].src).toBe("images/real.png");
  });

  it("finds multiline <img> tags outside fences", () => {
    const md = '<img\n  src="images/multi.png"\n  alt="multi"\n>';
    const result = parseAllImagesOutsideFences(md);
    expect(result).toHaveLength(1);
    expect(result[0].src).toBe("images/multi.png");
  });

  it("handles multiple fences with images between them", () => {
    const md =
      '```\n<img src="images/first-code.png">\n```\n\n<img src="images/middle.png">\n\n```\n<img src="images/second-code.png">\n```';
    const result = parseAllImagesOutsideFences(md);
    expect(result).toHaveLength(1);
    expect(result[0].src).toBe("images/middle.png");
  });
});
