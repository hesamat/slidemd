// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import markdownit from "markdown-it";
import { AiOutputValidator } from "../data/ai/ai-output-validator.js";

beforeAll(() => {
  window.markdownit = markdownit;
});

const validate = (inputMarkdown, outputMarkdown, intent = "fix") => {
  const validator = new AiOutputValidator({ inputMarkdown });
  return validator.validate(outputMarkdown, intent);
};

describe("AiOutputValidator", () => {
  it("passes a well-formed single slide", () => {
    const output = `layout: header-content

@header
# Title

@main
- Item 1
- Item 2`;
    const result = validate("", output, "fix");
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.slides).toHaveLength(1);
  });

  it("reports an unknown layout", () => {
    const output = `layout: nonexistent

@main
- Item`;
    const result = validate("", output, "fix");
    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe("UNKNOWN_LAYOUT");
  });

  it("reports an invalid area", () => {
    const output = `layout: header-content

@sidebar
- Item`;
    const result = validate("", output, "fix");
    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe("INVALID_AREA");
  });

  it("reports a missing layout in generate mode", () => {
    const output = `# Title

- Item`;
    const result = validate("", output, "generate");
    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe("MISSING_LAYOUT");
  });

  it("reports too many slides for a single-slide intent", () => {
    const output = `layout: header-content

@main
- One

---

layout: header-content

@main
- Two`;
    const result = validate("", output, "enhanceSlide");
    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe("TOO_MANY_SLIDES");
  });

  it("warns when a header area does not start with h1", () => {
    const output = `layout: header-content

@header
## Subtitle

@main
- Item`;
    const result = validate("", output, "fix");
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe("HEADER_DEFAULT_H1");
  });

  it("errors when a header-content slide has more than one image", () => {
    const output = `layout: header-content

@main
<img src="a.png" alt="A">
<img src="b.png" alt="B">`;
    const result = validate("", output, "fix");
    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe("NO_HEADER_ON_MULTI_IMAGE");
  });

  it("errors when multi-column-list content from input is missing in output", () => {
    const input = `layout: header-content

@main
<div class="multi-column-list">A B C</div>`;
    const output = `layout: header-content

@main
- A
- B
- C`;
    const result = validate(input, output, "fix");
    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe("PRESERVE_MULTI_COLUMN_LIST");
  });

  it("errors when a text-block uses unknown attributes", () => {
    const output = `layout: header-content

@main

::: text-block { style: "background: red; padding: 20px;" }

### Heading

:::`;
    const result = validate("", output, "fix");
    expect(result.ok).toBe(false);
    const err = result.errors.find((e) => e.code === "UNKNOWN_TEXT_BLOCK_ATTR");
    expect(err).toBeDefined();
    expect(err.message).toContain("style");
    expect(err.message).not.toContain("red");
    expect(err.message).not.toContain("20px");
  });

  it("passes when a text-block uses only known attributes", () => {
    const output = `layout: header-content

@main

::: text-block { backgroundColor="#1e293b" markdown=true column-count=1 }

### Heading

:::`;
    const result = validate("", output, "fix");
    expect(result.errors.filter((e) => e.code === "UNKNOWN_TEXT_BLOCK_ATTR")).toHaveLength(0);
  });

  it("errors when a text-block directive is missing braces", () => {
    const output = `layout: header-content

@main

::: text-block backgroundColor="#00c2a8" markdown=true
**key → value**
:::`;
    const result = validate("", output, "fix");
    expect(result.ok).toBe(false);
    const err = result.errors.find((e) => e.code === "MALFORMED_TEXT_BLOCK");
    expect(err).toBeDefined();
    expect(err.message).toContain("braces");
  });

  it("errors when a focus slide has too much content", () => {
    const output = `layout: focus

@header
# Title

@main
A headline claim
- Supporting point one
- Supporting point two
- Supporting point three
- Supporting point four
- Supporting point five

@footer
Footer`;
    const result = validate("", output, "generate");
    expect(result.ok).toBe(false);
    const err = result.errors.find((e) => e.code === "SLIDE_CONTENT_OVERFLOW");
    expect(err).toBeDefined();
    expect(err.message).toContain("@main");
  });

  it("errors when a header-content slide exceeds its line budget", () => {
    const bullets = Array.from({ length: 16 }, (_, i) => `- Item ${i + 1}`).join("\n");
    const output = `layout: header-content

@header
# Title

@main
${bullets}

@footer
Footer`;
    const result = validate("", output, "generate");
    expect(result.ok).toBe(false);
    const err = result.errors.find((e) => e.code === "SLIDE_CONTENT_OVERFLOW");
    expect(err).toBeDefined();
    expect(err.message).toContain("@main");
    expect(err.message).toContain("16 lines");
  });

  it("errors when a code block pushes a header-content slide over its line budget", () => {
    const code = Array.from({ length: 15 }, (_, i) => `    line${i + 1} = ${i + 1}`).join("\n");
    const output = `layout: header-content

@header
# Title

@main
\`\`\`python
${code}
\`\`\`

@footer
Footer`;
    const result = validate("", output, "generate");
    expect(result.ok).toBe(false);
    const err = result.errors.find((e) => e.code === "SLIDE_CONTENT_OVERFLOW");
    expect(err).toBeDefined();
    expect(err.message).toContain("@main");
  });

  it("errors when a title-slide has @main content", () => {
    const output = `layout: title-slide

@title
# Title

@main
This should not be here

@footer
Footer`;
    const result = validate("", output, "generate");
    expect(result.ok).toBe(false);
    const err = result.errors.find((e) => e.code === "SLIDE_CONTENT_OVERFLOW");
    expect(err).toBeDefined();
    expect(err.message).toContain("@main");
  });

  it("returns a parse error when the parser cannot initialize", () => {
    const original = window.markdownit;
    window.markdownit = () => {
      throw new Error("markdown-it unavailable");
    };

    const output = `layout: header-content

@main
- Item`;
    const result = validate("", output, "fix");

    window.markdownit = original;

    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe("PARSE_ERROR");
  });

  it("does not flag overflow for fix intent on dense slides", () => {
    const dense = `layout: header-content

@main
${Array.from({ length: 16 }, (_, i) => `- Item ${i + 1}`).join("\n")}

@header
# Title

@footer
Footer`;
    const result = validate("", dense, "fix");
    const err = result.errors.find((e) => e.code === "SLIDE_CONTENT_OVERFLOW");
    expect(err).toBeUndefined();
  });

  it("does not flag overflow for enhanceSlide intent on dense slides", () => {
    const dense = `layout: header-content

@main
${Array.from({ length: 16 }, (_, i) => `- Item ${i + 1}`).join("\n")}

@header
# Title

@footer
Footer`;
    const result = validate("", dense, "enhanceSlide");
    const err = result.errors.find((e) => e.code === "SLIDE_CONTENT_OVERFLOW");
    expect(err).toBeUndefined();
  });

  it("measures content before the first @area marker as @main", () => {
    // title-slide has main.maxLines = 0; any content before @area should
    // be detected as @main overflow.
    const output = `layout: title-slide

# Title

This is content before any area marker.
More content on a second line.

@footer
Footer`;
    const result = validate("", output, "generate");
    const err = result.errors.find((e) => e.code === "SLIDE_CONTENT_OVERFLOW");
    expect(err).toBeDefined();
    expect(err.message).toContain("@main");
  });

  describe("addSpeakerNotes intent", () => {
    const slideWithNotes = (notes) => `layout: header-content

@header
# Title

@main
- Item${notes ? `\n\n<!-- notes: ${notes} -->` : ""}`;

    it("passes when only notes are added", () => {
      const result = validate(
        slideWithNotes(""),
        slideWithNotes("Talk about items"),
        "addSpeakerNotes",
      );
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("fails when notes are missing", () => {
      const result = validate(slideWithNotes(""), slideWithNotes(""), "addSpeakerNotes");
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.code === "NOTES_MISSING")).toBe(true);
    });

    it("fails when visible content changes", () => {
      const output = `layout: header-content

@header
# Title

@main
- Changed item

<!-- notes: ... -->`;
      const result = validate(slideWithNotes(""), output, "addSpeakerNotes");
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.code === "NOTES_PRESERVE_CONTENT")).toBe(true);
    });

    it("fails when the layout changes", () => {
      const output = `layout: focus

@header
# Title

@main
- Item

<!-- notes: ... -->`;
      const result = validate(slideWithNotes(""), output, "addSpeakerNotes");
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.code === "NOTES_PRESERVE_LAYOUT")).toBe(true);
    });

    it("does not flag content change when only data-source-line offsets differ", () => {
      // The rendered HTML carries data-source-line attributes that shift when
      // blank-line placement changes. The validator should strip them before
      // comparing so a harmless blank-line normalisation doesn't trigger a
      // false positive (which would waste 2 extra AI repair calls).
      // We simulate this by parsing the same content with slightly different
      // blank-line placement — both parse to the same visible content.
      const input = `layout: header-content

@header
# Title

@main
- Item`;
      const output = `layout: header-content

@header
# Title


@main
- Item

<!-- notes: talk about the item -->`;
      const result = validate(input, output, "addSpeakerNotes");
      // Should pass — only notes were added, visible content is the same
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
