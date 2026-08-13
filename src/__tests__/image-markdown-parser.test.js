import { describe, it, expect } from "vitest";
import {
  parseAllImages,
  findFencedRanges,
  parseAllImagesOutsideFences,
  splitBackgroundValue,
  normalizeImageSrc,
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

describe("splitBackgroundValue", () => {
  it("splits a pure color background into colorPart only", () => {
    const result = splitBackgroundValue("#fff");
    expect(result.colorPart).toBe("#fff");
    expect(result.imagePart).toBe("");
    expect(result.hasImage).toBe(false);
  });

  it("splits a pure image background into imagePart only", () => {
    const result = splitBackgroundValue("url(images/hero.png) center/cover");
    expect(result.colorPart).toBe("");
    expect(result.imagePart).toContain("url(images/hero.png)");
    expect(result.hasImage).toBe(true);
  });

  it("splits a mixed color+image background into both parts", () => {
    const result = splitBackgroundValue("#fff url(images/hero.png)");
    expect(result.colorPart).toBe("#fff");
    expect(result.imagePart).toContain("url(images/hero.png)");
    expect(result.hasImage).toBe(true);
  });

  it("treats gradient tokens as color content", () => {
    const result = splitBackgroundValue("linear-gradient(rgba(0,0,0,.5), transparent)");
    expect(result.colorPart).toContain("linear-gradient");
    expect(result.hasImage).toBe(false);
  });

  it("tokenizes nested-paren gradients as a single unit", () => {
    // The regex must handle one level of nesting so
    // linear-gradient(rgba(...), transparent) is one token, not two fragments.
    const result = splitBackgroundValue("linear-gradient(rgba(0,0,0,.5), transparent)");
    expect(result.colorPart).toBe("linear-gradient(rgba(0,0,0,.5), transparent)");
    expect(result.hasImage).toBe(false);
  });

  it("keeps layout keywords with the image part", () => {
    const result = splitBackgroundValue("#1a1a2e url(images/bg.png) no-repeat center");
    expect(result.colorPart).toBe("#1a1a2e");
    expect(result.imagePart).toContain("url(images/bg.png)");
    expect(result.imagePart).toContain("no-repeat");
    expect(result.imagePart).toContain("center");
    expect(result.hasImage).toBe(true);
  });

  it("handles quoted urls and percent-encoded paths", () => {
    const result = splitBackgroundValue('#000 url("images/my%20pic.png")');
    expect(result.colorPart).toBe("#000");
    expect(result.imagePart).toContain('url("images/my%20pic.png")');
    expect(result.hasImage).toBe(true);
  });
});

describe("normalizeImageSrc", () => {
  it("strips a leading ./", () => {
    expect(normalizeImageSrc("./images/a.png")).toBe("images/a.png");
  });

  it("decodes percent-encoding", () => {
    expect(normalizeImageSrc("images/my%20pic.png")).toBe("images/my pic.png");
  });

  it("handles malformed percent-encoding without throwing", () => {
    expect(normalizeImageSrc("images/%zz.png")).toBe("images/%zz.png");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeImageSrc("  images/a.png  ")).toBe("images/a.png");
  });

  it("leaves already-normal paths unchanged", () => {
    expect(normalizeImageSrc("images/a.png")).toBe("images/a.png");
  });
});
