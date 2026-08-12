import { describe, it, expect } from "vitest";
import {
  parseAllImages,
  extractAltText,
  getAreaContentRange,
  buildInlineStyleString,
  buildMediaSpanStyleString,
  buildRepositionedImgTag,
  isMediaSpanFillImage,
} from "../editor/image/image-markdown-utils.js";

describe("parseAllImages", () => {
  it("finds HTML <img> tags", () => {
    const md = '<img src="images/test.png" alt="test" />';
    const result = parseAllImages(md);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("html");
    expect(result[0].src).toBe("images/test.png");
  });

  it("finds markdown ![alt](src) images", () => {
    const md = "![alt](images/test.png)";
    const result = parseAllImages(md);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("md");
    expect(result[0].src).toBe("images/test.png");
  });

  it("finds both types and sorts by position", () => {
    const md = '![first](img/a.png)\n\n<img src="img/b.png" alt="b" />\n\n![third](img/c.png)';
    const result = parseAllImages(md);
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe("md");
    expect(result[1].type).toBe("html");
    expect(result[2].type).toBe("md");
  });

  it("returns empty array for no images", () => {
    expect(parseAllImages("just text")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseAllImages("")).toEqual([]);
  });

  it("skips <img> tags without src attribute", () => {
    const md = '<img alt="no src" />';
    expect(parseAllImages(md)).toHaveLength(0);
  });
});

describe("getAreaContentRange", () => {
  const markdown = `@main
first line
second line
@media
media content
@footer
footer text`;

  it("returns range for @main content", () => {
    const range = getAreaContentRange(markdown, "main");
    expect(range.from).toBeGreaterThan(0);
    expect(range.to).toBeGreaterThan(range.from);
    expect(markdown.slice(range.from, range.to)).toContain("first line");
    expect(markdown.slice(range.from, range.to)).toContain("second line");
    expect(markdown.slice(range.from, range.to)).not.toContain("media");
  });

  it("returns range for @media content", () => {
    const range = getAreaContentRange(markdown, "media");
    expect(markdown.slice(range.from, range.to)).toContain("media content");
    expect(markdown.slice(range.from, range.to)).not.toContain("footer");
  });

  it("returns range for @footer content", () => {
    const range = getAreaContentRange(markdown, "footer");
    expect(markdown.slice(range.from, range.to)).toContain("footer text");
  });

  it("returns {from, to} at end for unknown area name", () => {
    const range = getAreaContentRange(markdown, "nonexistent");
    expect(range.from).toBe(markdown.length);
    expect(range.to).toBe(markdown.length);
  });

  it("handles content before first @area marker as @main", () => {
    const md = "content before any marker\n@main\nmain content";
    const range = getAreaContentRange(md, "main");
    expect(range.from).toBeGreaterThan(0);
    expect(md.slice(range.from, range.to)).toContain("main content");
  });
});

describe("extractAltText", () => {
  it("extracts alt from HTML img tags", () => {
    expect(
      extractAltText({ type: "html", fullTag: '<img src="x.png" alt="hello" />', fullMatch: "" }),
    ).toBe("hello");
  });

  it("extracts alt from markdown images", () => {
    expect(
      extractAltText({ type: "md", fullMatch: "![world](x.png)", fullTag: "![world](x.png)" }),
    ).toBe("world");
  });

  it("returns empty string when alt is missing", () => {
    expect(extractAltText({ type: "html", fullTag: '<img src="x.png" />', fullMatch: "" })).toBe(
      "",
    );
  });
});

describe("buildInlineStyleString", () => {
  function createMockImg(style) {
    return {
      style: {
        left: "",
        top: "",
        width: "",
        height: "",
        opacity: "",
        borderRadius: "",
        boxShadow: "",
        transform: "",
        zIndex: "",
        ...style,
      },
      getAttribute: () => null,
    };
  }

  it("includes position relative", () => {
    const result = buildInlineStyleString(
      createMockImg({ width: "100px", height: "50px", left: "10px", top: "20px" }),
    );
    expect(result).toContain("position: relative");
    expect(result).toContain("left: 10px");
    expect(result).toContain("top: 20px");
    expect(result).toContain("width: 100px");
    expect(result).toContain("height: 50px");
  });

  it("includes opacity when not 1", () => {
    const result = buildInlineStyleString(
      createMockImg({ width: "100px", height: "50px", opacity: "0.5" }),
    );
    expect(result).toContain("opacity: 0.5");
  });

  it("includes borderRadius when set", () => {
    const result = buildInlineStyleString(
      createMockImg({ width: "100px", height: "50px", borderRadius: "8px" }),
    );
    expect(result).toContain("border-radius: 8px");
  });

  it("includes boxShadow when set", () => {
    const result = buildInlineStyleString(
      createMockImg({ width: "100px", height: "50px", boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }),
    );
    expect(result).toContain("box-shadow");
  });

  it("includes transform when rotation is set", () => {
    const result = buildInlineStyleString(
      createMockImg({ width: "100px", height: "50px", transform: "rotate(45deg)" }),
    );
    expect(result).toContain("rotate(45deg)");
  });
});

describe("media-span fill images", () => {
  it("identifies an unpositioned single image managed by the media column", () => {
    const label = { classList: { contains: (name) => name === "editor-area-label" } };
    const area = {
      children: [label, null],
      querySelectorAll: () => [img],
      closest: (selector) => (selector === ".slide" ? slide : null),
    };
    const slide = { dataset: { mediaFullBleed: "right" } };
    const img = {
      style: { position: "" },
      classList: { contains: () => false },
      closest: (selector) =>
        selector === ".slide__area--media" ? area : selector === ".slide" ? slide : null,
    };
    area.children[1] = img;

    expect(isMediaSpanFillImage(img)).toBe(true);
    img.style.position = "relative";
    expect(isMediaSpanFillImage(img)).toBe(false);
  });

  it("serializes visual styles without adding positioning", () => {
    const img = {
      style: {
        left: "",
        top: "",
        width: "",
        height: "",
        opacity: "0.8",
        borderRadius: "12px",
        boxShadow: "",
        transform: "",
        zIndex: "",
      },
      getAttribute: () => null,
      offsetWidth: 100,
      offsetHeight: 80,
    };
    const style = buildMediaSpanStyleString(img);

    expect(style).toContain("border-radius: 12px");
    expect(style).not.toContain("position:");
    expect(style).not.toContain("width:");
  });
});

describe("buildRepositionedImgTag", () => {
  function createMockImg(style) {
    return {
      style: {
        left: "",
        top: "",
        width: "",
        height: "",
        opacity: "",
        borderRadius: "",
        boxShadow: "",
        transform: "",
        zIndex: "",
        ...style,
      },
      getAttribute: () => null,
      offsetWidth: 100,
      offsetHeight: 50,
    };
  }

  it("builds an img tag with left/top reset to 0", () => {
    const result = buildRepositionedImgTag(
      createMockImg({ width: "100px", height: "50px", left: "200px", top: "300px" }),
      "src.png",
      "alt",
      100,
      50,
    );
    expect(result).toContain('src="src.png"');
    expect(result).toContain('alt="alt"');
    expect(result).toContain("left: 0px");
    expect(result).toContain("top: 0px");
    expect(result).toContain("width: 100px");
  });

  it("preserves rotation, opacity, borderRadius in output", () => {
    const result = buildRepositionedImgTag(
      createMockImg({
        width: "100px",
        height: "50px",
        opacity: "0.5",
        borderRadius: "8px",
        transform: "rotate(45deg)",
      }),
      "src.png",
      "alt",
      100,
      50,
    );
    expect(result).toContain("opacity: 0.5");
    expect(result).toContain("border-radius: 8px");
    expect(result).toContain("rotate(45deg)");
  });
});
