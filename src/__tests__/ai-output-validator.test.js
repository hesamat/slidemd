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
