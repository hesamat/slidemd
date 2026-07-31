import { describe, it, expect } from "vitest";
import {
  buildTextBlockDirective,
  buildTextBlockHtml,
  parseTextBlockDirectives,
  updateTextBlockDirective,
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
});
