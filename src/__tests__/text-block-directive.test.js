import { describe, it, expect } from "vitest";
import {
  buildTextBlockDirective,
  buildTextBlockHtml,
  parseTextBlockDirectives,
  updateTextBlockDirective,
  KNOWN_TEXT_BLOCK_ATTRIBUTES,
  CANONICAL_TEXT_BLOCK_ATTRIBUTES,
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
    expect(KNOWN_TEXT_BLOCK_ATTRIBUTES.has("margin")).toBe(false);
    expect(KNOWN_TEXT_BLOCK_ATTRIBUTES.has("padding")).toBe(false);
    expect(KNOWN_TEXT_BLOCK_ATTRIBUTES.has("preset")).toBe(true);
    expect(KNOWN_TEXT_BLOCK_ATTRIBUTES.has("tail")).toBe(true);
    expect(KNOWN_TEXT_BLOCK_ATTRIBUTES.has("borderColor")).toBe(true);
  });

  it("exports a curated canonical list without alias near-duplicates", () => {
    // CANONICAL_TEXT_BLOCK_ATTRIBUTES is what's shown to humans/the AI
    // (e.g. the validator's "unsupported attribute" message); it must omit
    // alias spellings like background/textAlign/columnCount so that list
    // doesn't read as ~20 near-duplicate names, while every name in it is
    // still recognised by the parser.
    expect(CANONICAL_TEXT_BLOCK_ATTRIBUTES).toContain("backgroundColor");
    expect(CANONICAL_TEXT_BLOCK_ATTRIBUTES).toContain("align");
    expect(CANONICAL_TEXT_BLOCK_ATTRIBUTES).toContain("column-count");
    expect(CANONICAL_TEXT_BLOCK_ATTRIBUTES).not.toContain("background");
    expect(CANONICAL_TEXT_BLOCK_ATTRIBUTES).not.toContain("textAlign");
    expect(CANONICAL_TEXT_BLOCK_ATTRIBUTES).not.toContain("columnCount");
    for (const attr of CANONICAL_TEXT_BLOCK_ATTRIBUTES) {
      expect(KNOWN_TEXT_BLOCK_ATTRIBUTES.has(attr)).toBe(true);
    }
    // No drift: every non-alias name in KNOWN_TEXT_BLOCK_ATTRIBUTES must
    // appear in the canonical list too.
    const aliases = new Set(["background", "textAlign", "columnCount"]);
    for (const attr of KNOWN_TEXT_BLOCK_ATTRIBUTES) {
      if (aliases.has(attr)) continue;
      expect(CANONICAL_TEXT_BLOCK_ATTRIBUTES).toContain(attr);
    }
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

  it("parses attributes separated by commas (space before comma)", () => {
    const directive = "::: text-block { bold , italic , underline }\nText\n:::";
    const [parsed] = parseTextBlockDirectives(directive);
    expect(parsed.settings.fontWeight).toBe("bold");
    expect(parsed.settings.fontStyle).toBe("italic");
    expect(parsed.settings.textDecoration).toBe("underline");
  });

  it("parses key=value attributes separated by commas", () => {
    const directive = "::: text-block { x=10 , y=20 , fontSize=48 }\nText\n:::";
    const [parsed] = parseTextBlockDirectives(directive);
    expect(parsed.settings.left).toBe(10);
    expect(parsed.settings.top).toBe(20);
    expect(parsed.settings.fontSize).toBe(48);
  });
});

describe("text block bubble preset", () => {
  it("round-trips preset and tail side", () => {
    const directive = buildTextBlockDirective({ id: "tb-b", preset: "bubble", tail: "left" }, "Hi");
    expect(directive).toContain('preset="bubble"');
    expect(directive).toContain("tail=left");
    const [parsed] = parseTextBlockDirectives(directive);
    expect(parsed.settings.preset).toBe("bubble");
    expect(parsed.settings.tail).toBe("left");
  });

  it("defaults the bubble tail to bottom and omits it from the directive", () => {
    const directive = buildTextBlockDirective({ id: "tb-b", preset: "bubble" }, "Hi");
    expect(directive).toContain('preset="bubble"');
    expect(directive).not.toContain("tail=");
    const [parsed] = parseTextBlockDirectives(directive);
    expect(parsed.settings.tail).toBe("bottom");
  });

  it("emits the bubble class with data-tail and data-align geometry hooks", () => {
    const html = buildTextBlockHtml({ preset: "bubble", tail: "right", textAlign: "center" }, "Hi");
    expect(html).toContain("text-block--bubble");
    expect(html).toContain('data-preset="bubble"');
    expect(html).toContain('data-tail="right"');
    expect(html).toContain('data-align="center"');
    expect(html).not.toContain("align-self");
  });

  it("maps borderColor to the --bubble-border-color custom property", () => {
    const html = buildTextBlockHtml({ preset: "bubble", borderColor: "#f59e0b" }, "Hi");
    expect(html).toContain("--bubble-border-color:#f59e0b");
  });

  it("round-trips bubble borderColor", () => {
    const directive = buildTextBlockDirective({ preset: "bubble", borderColor: "#f59e0b" }, "Hi");
    expect(directive).toContain('borderColor="#f59e0b"');
    const [parsed] = parseTextBlockDirectives(directive);
    expect(parsed.settings.borderColor).toBe("#f59e0b");
  });

  it("ignores borderColor without a bubble preset", () => {
    const html = buildTextBlockHtml({ borderColor: "#f59e0b" }, "Hi");
    expect(html).not.toContain("bubble-border-color");
    const directive = buildTextBlockDirective({ borderColor: "#f59e0b" }, "Hi");
    expect(directive).not.toContain("borderColor");
  });

  it("drops invalid tail sides and lowercases the preset name", () => {
    const md = '::: text-block { preset="Bubble" tail="diagonal" }\nHi\n:::';
    const [parsed] = parseTextBlockDirectives(md);
    expect(parsed.settings.preset).toBe("bubble");
    expect(parsed.settings.tail).toBe("bottom");
  });

  it("does not emit data hooks without a preset", () => {
    const html = buildTextBlockHtml({ textAlign: "center" }, "Hi");
    expect(html).not.toContain("data-align");
    expect(html).not.toContain("data-tail");
    expect(html).not.toContain("data-preset");
  });
});
