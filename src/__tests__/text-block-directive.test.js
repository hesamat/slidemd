import { describe, it, expect } from "vitest";
import {
  buildTextBlockDirective,
  buildTextBlockHtml,
  parseTextBlockDirectives,
  updateTextBlockDirective,
  KNOWN_TEXT_BLOCK_ATTRIBUTES,
} from "../core/text-block-directive.js";

describe("text block directive round trip", () => {
  it("preserves float, position and font styling", () => {
    const settings = {
      id: "tb-1",
      float: true,
      left: 120,
      top: 450,
      fontSize: 48,
      color: "#333333",
      backgroundColor: "transparent",
      textAlign: "center",
      opacity: 1,
      zIndex: 0,
      rotation: 15,
      fontWeight: "bold",
      fontStyle: "italic",
      textDecoration: "underline line-through",
    };

    const directive = buildTextBlockDirective(settings, "Floating Text");
    const [parsed] = parseTextBlockDirectives(directive);

    expect(parsed.content).toBe("Floating Text");
    expect(parsed.settings).toMatchObject({
      id: "tb-1",
      float: true,
      left: 120,
      top: 450,
      fontSize: 48,
      color: "#333333",
      textAlign: "center",
      rotation: 15,
      fontWeight: "bold",
      fontStyle: "italic",
      textDecoration: "underline line-through",
    });
  });

  it("reads bare flag tokens as booleans", () => {
    const [parsed] = parseTextBlockDirectives("::: text-block { float bold }\nHi\n:::");
    expect(parsed.settings.float).toBe(true);
    expect(parsed.settings.fontWeight).toBe("bold");
  });

  it("updates only the directive matching the given id", () => {
    const md = [
      '::: text-block { id="tb-a" }',
      "First",
      ":::",
      "",
      '::: text-block { id="tb-b" }',
      "Second",
      ":::",
    ].join("\n");

    const updated = updateTextBlockDirective(md, "tb-b", { id: "tb-b" }, "Changed");
    expect(updated).toContain("First");
    expect(updated).toContain("Changed");
    expect(updated).not.toContain("Second");
  });

  it("ignores lookups with an empty id", () => {
    const md = "::: text-block\nOnly\n:::";
    expect(updateTextBlockDirective(md, "", { id: "" }, "Hacked")).toBeNull();
  });
});

describe("text block html escaping", () => {
  it("strips markup smuggled through the id attribute", () => {
    const html = buildTextBlockHtml({ id: 'a"><img src=x onerror=alert(1)>' }, "Text");
    expect(html).not.toContain("<img");
    expect(html).toContain('data-id="aimgsrcxonerroralert1"');
  });

  it("drops css values that could break out of the style declaration", () => {
    const html = buildTextBlockHtml(
      { color: "red;background:url(https://evil.test/x)", backgroundColor: "url(javascript:1)" },
      "Text",
    );
    expect(html).not.toContain("url(");
    expect(html).not.toContain("background:");
  });

  it("pre-renders multi-column content so markdown lists become HTML", () => {
    const html = buildTextBlockHtml({ columnCount: 2 }, "1. First\n2. Second\n");
    expect(html).toMatch(/<ol[^>]*>/);
    expect(html).toMatch(/<li[^>]*>First<\/li>/);
    expect(html).toMatch(/<li[^>]*>Second<\/li>/);
    expect(html).toContain("</ol>");
    expect(html).toContain("data-source-line");
  });

  it("neutralizes HTML in multi-column content", () => {
    const html = buildTextBlockHtml({ columnCount: 2 }, "- <img src=x onerror=alert(1)>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("text block unknown attributes", () => {
  it("surfaces unknown attributes on parsed blocks", () => {
    const md = '::: text-block { style: "background: red;" padding=20 color="#333" }\nHi\n:::';
    const [parsed] = parseTextBlockDirectives(md);
    expect(parsed.unknownAttrs).toContain("style");
    expect(parsed.unknownAttrs).toContain("padding");
    // `color` is known and should NOT appear in unknownAttrs
    expect(parsed.unknownAttrs).not.toContain("color");
  });

  it("does not leak value fragments from unquoted colon-style attributes", () => {
    const md = "::: text-block { style: background: red; padding: 20px }\nHi\n:::";
    const [parsed] = parseTextBlockDirectives(md);
    expect(parsed.unknownAttrs).toContain("style");
    // Value fragments should NOT appear as unknown attributes
    expect(parsed.unknownAttrs).not.toContain("background");
    expect(parsed.unknownAttrs).not.toContain("padding");
    expect(parsed.unknownAttrs).not.toContain("red");
    expect(parsed.unknownAttrs).not.toContain("20px");
  });

  it("still parses known attributes after a quoted colon-style value", () => {
    const md = '::: text-block { style: "background: red;" markdown=true }\nHi\n:::';
    const [parsed] = parseTextBlockDirectives(md);
    expect(parsed.unknownAttrs).toContain("style");
    expect(parsed.unknownAttrs).not.toContain("markdown");
    expect(parsed.settings.markdown).toBe(true);
  });

  it("returns an empty unknownAttrs array when all attributes are known", () => {
    const md = '::: text-block { color="#333" column-count=2 }\nHi\n:::';
    const [parsed] = parseTextBlockDirectives(md);
    expect(parsed.unknownAttrs).toEqual([]);
  });

  it("exports the known attributes set", () => {
    expect(KNOWN_TEXT_BLOCK_ATTRIBUTES).toBeInstanceOf(Set);
    expect(KNOWN_TEXT_BLOCK_ATTRIBUTES.has("color")).toBe(true);
    expect(KNOWN_TEXT_BLOCK_ATTRIBUTES.has("column-count")).toBe(true);
    expect(KNOWN_TEXT_BLOCK_ATTRIBUTES.has("markdown")).toBe(true);
    expect(KNOWN_TEXT_BLOCK_ATTRIBUTES.has("style")).toBe(false);
    expect(KNOWN_TEXT_BLOCK_ATTRIBUTES.has("padding")).toBe(false);
  });
});

describe("text block markdown flag", () => {
  it("renders markdown content when markdown=true is set", () => {
    const html = buildTextBlockHtml({ markdown: true }, "### Heading\n\n1. First\n2. Second\n");
    expect(html).toMatch(/<h3[^>]*>Heading<\/h3>/);
    expect(html).toMatch(/<ol[^>]*>/);
    expect(html).toMatch(/<li[^>]*>First<\/li>/);
    expect(html).toContain("text-block--markdown");
    expect(html).not.toContain("text-block--multi-column");
  });

  it("escapes content as plain text when markdown is not set", () => {
    const html = buildTextBlockHtml({}, "### Heading");
    expect(html).not.toMatch(/<h3/);
    expect(html).toContain("### Heading");
    expect(html).toContain("white-space:pre-wrap");
  });

  it("does not add white-space:pre-wrap when markdown=true", () => {
    const html = buildTextBlockHtml({ markdown: true }, "Plain text");
    expect(html).not.toContain("white-space:pre-wrap");
  });

  it("round-trips the markdown flag through directive build and parse", () => {
    const directive = buildTextBlockDirective(
      { id: "tb-md", markdown: true, backgroundColor: "#1e293b" },
      "### Heading\n\n- item",
    );
    const [parsed] = parseTextBlockDirectives(directive);
    expect(parsed.settings.markdown).toBe(true);
    expect(parsed.settings.backgroundColor).toBe("#1e293b");
  });

  it("does not emit markdown=true when not set", () => {
    const directive = buildTextBlockDirective({ id: "tb-plain" }, "Text");
    expect(directive).not.toContain("markdown");
  });
});
