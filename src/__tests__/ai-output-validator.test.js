// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import markdownit from "markdown-it";
import {
  AiOutputValidator,
  collectOwnImageSources,
  stripFabricatedImages,
} from "../data/ai/ai-output-validator.js";

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

  it("reports an unknown layout as a warning", () => {
    const output = `layout: nonexistent

@main
- Item`;
    const result = validate("", output, "fix");
    expect(result.ok).toBe(true);
    expect(result.warnings[0].code).toBe("UNKNOWN_LAYOUT");
  });

  it("reports an invalid area as a warning", () => {
    const output = `layout: header-content

@sidebar
- Item`;
    const result = validate("", output, "fix");
    expect(result.ok).toBe(true);
    expect(result.warnings[0].code).toBe("INVALID_AREA");
  });

  it("reports a missing layout in generate mode as a warning", () => {
    const output = `# Title

- Item`;
    const result = validate("", output, "generate");
    expect(result.ok).toBe(true);
    expect(result.warnings[0].code).toBe("MISSING_LAYOUT");
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
    const bullets = Array.from({ length: 13 }, (_, i) => `- Supporting point ${i + 1}`).join("\n");
    const output = `layout: focus

@header
# Title

@main
A headline claim
${bullets}

@footer
Footer`;
    const result = validate("", output, "generate");
    expect(result.ok).toBe(false);
    const err = result.errors.find((e) => e.code === "SLIDE_CONTENT_OVERFLOW");
    expect(err).toBeDefined();
    expect(err.message).toContain("@main");
  });

  it("errors when a header-content slide exceeds its line budget", () => {
    const bullets = Array.from({ length: 18 }, (_, i) => `- Item ${i + 1}`).join("\n");
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
    expect(err.message).toContain("18 lines");
  });

  it("errors when a code block pushes a header-content slide over its line budget", () => {
    const code = Array.from({ length: 18 }, (_, i) => `    line${i + 1} = ${i + 1}`).join("\n");
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

  describe("per-layout @main line limits", () => {
    // Real-world rendering limits tuned from actual slide overflow testing.
    // The formula-derived values didn't match what actually fits on screen.
    const cases = [
      ["header-content", 13],
      ["two-column", 10],
      ["focus", 11],
      ["media-span-left", 12],
      ["media-span-right", 12],
    ];

    for (const [layout, max] of cases) {
      it(`${layout}: ${max} lines in @main pass, ${max + 1} fails`, () => {
        const atMax = Array.from({ length: max }, (_, i) => `- Line ${i + 1}`).join("\n");
        const overMax = Array.from({ length: max + 1 }, (_, i) => `- Line ${i + 1}`).join("\n");
        const r1 = validate("", `layout: ${layout}\n@main\n${atMax}`, "generate");
        const r2 = validate("", `layout: ${layout}\n@main\n${overMax}`, "generate");
        const overflowAtMax = r1.errors.find((e) => e.code === "SLIDE_CONTENT_OVERFLOW");
        const overflowOver = r2.errors.find((e) => e.code === "SLIDE_CONTENT_OVERFLOW");
        expect(overflowAtMax).toBeUndefined();
        expect(overflowOver).toBeDefined();
      });
    }
  });

  describe("multi-column text block overflow relaxation", () => {
    it("passes a long list inside a two-column text block", () => {
      const bullets = Array.from({ length: 20 }, (_, i) => `- Item ${i + 1}`).join("\n");
      const output = `layout: header-content

@header
# Title

@main

::: text-block { column-count=2 markdown=true }
${bullets}
:::`;
      const result = validate("", output, "generate");
      expect(result.errors.filter((e) => e.code === "SLIDE_CONTENT_OVERFLOW")).toHaveLength(0);
    });

    it("does not scale a long table inside a multi-column text block", () => {
      // Tables do not fragment across CSS columns, so the multi-column discount
      // must not be applied even when the text block has column-count > 1.
      const rows = Array.from({ length: 16 }, (_, i) => `| Cell ${i + 1}A | Cell ${i + 1}B |`).join(
        "\n",
      );
      const output = `layout: header-content

@header
# Title

@main

::: text-block { column-count=2 markdown=true }
| Header A | Header B |
| --- | --- |
${rows}
:::`;
      const result = validate("", output, "generate");
      expect(result.errors.some((e) => e.code === "SLIDE_CONTENT_OVERFLOW")).toBe(true);
    });

    it("still flags an overflowing list not in a multi-column text block", () => {
      const bullets = Array.from({ length: 20 }, (_, i) => `- Item ${i + 1}`).join("\n");
      const output = `layout: header-content

@header
# Title

@main
${bullets}`;
      const result = validate("", output, "generate");
      expect(result.errors.some((e) => e.code === "SLIDE_CONTENT_OVERFLOW")).toBe(true);
    });

    it("does not apply scaling to a text block with column-count=1", () => {
      const bullets = Array.from({ length: 20 }, (_, i) => `- Item ${i + 1}`).join("\n");
      const output = `layout: header-content

@header
# Title

@main

::: text-block { column-count=1 markdown=true }
${bullets}
:::`;
      const result = validate("", output, "generate");
      expect(result.errors.some((e) => e.code === "SLIDE_CONTENT_OVERFLOW")).toBe(true);
    });

    it("scales with column-count=3 for very long lists", () => {
      const bullets = Array.from({ length: 30 }, (_, i) => `- Item ${i + 1}`).join("\n");
      const output = `layout: header-content

@header
# Title

@main

::: text-block { column-count=3 markdown=true }
${bullets}
:::`;
      const result = validate("", output, "generate");
      expect(result.errors.filter((e) => e.code === "SLIDE_CONTENT_OVERFLOW")).toHaveLength(0);
    });

    it("clamps an excessive column-count to 3 for overflow checking", () => {
      const bullets = Array.from({ length: 60 }, (_, i) => `- Item ${i + 1}`).join("\n");
      const output = `layout: header-content

@header
# Title

@main

::: text-block { column-count=8 markdown=true }
${bullets}
:::`;
      const result = validate("", output, "generate");
      expect(result.errors.some((e) => e.code === "SLIDE_CONTENT_OVERFLOW")).toBe(true);
    });

    it("floors and clamps non-integer column-count values", () => {
      const bullets = Array.from({ length: 30 }, (_, i) => `- Item ${i + 1}`).join("\n");
      const output = `layout: header-content

@header
# Title

@main

::: text-block { column-count=2.5 markdown=true }
${bullets}
:::`;
      const result = validate("", output, "generate");
      // 2.5 is floored to 2, so 30 bullets in 2 columns is 15 lines (> 13).
      expect(result.errors.some((e) => e.code === "SLIDE_CONTENT_OVERFLOW")).toBe(true);
    });

    it("passes when a floored non-integer column-count genuinely fits", () => {
      const bullets = Array.from({ length: 20 }, (_, i) => `- Item ${i + 1}`).join("\n");
      const output = `layout: header-content

@header
# Title

@main

::: text-block { column-count=2.5 markdown=true }
${bullets}
:::`;
      const result = validate("", output, "generate");
      expect(result.errors.filter((e) => e.code === "SLIDE_CONTENT_OVERFLOW")).toHaveLength(0);
    });

    it("does not scale a text block that contains a fenced code block", () => {
      const code = Array.from({ length: 15 }, (_, i) => `line ${i + 1}`).join("\n");
      const output = `layout: header-content

@header
# Title

@main

::: text-block { column-count=2 markdown=true }
\`\`\`
${code}
\`\`\`
:::`;
      const result = validate("", output, "generate");
      expect(result.errors.some((e) => e.code === "SLIDE_CONTENT_OVERFLOW")).toBe(true);
    });

    it("does not scale an empty multi-column text block", () => {
      const bullets = Array.from({ length: 13 }, (_, i) => `- Item ${i + 1}`).join("\n");
      const output = `layout: header-content

@header
# Title

@main
${bullets}

::: text-block { column-count=2 markdown=true }

:::`;
      const result = validate("", output, "generate");
      // Empty block should not add a phantom line and push the area over.
      expect(result.errors.filter((e) => e.code === "SLIDE_CONTENT_OVERFLOW")).toHaveLength(0);
    });

    it("ignores floating text blocks when measuring area content", () => {
      const bullets = Array.from({ length: 20 }, (_, i) => `- Item ${i + 1}`).join("\n");
      const output = `layout: header-content

@header
# Title

@main
- Only visible item

::: text-block { float=true x=10 y=20 fontSize=12 }
${bullets}
:::`;
      const result = validate("", output, "generate");
      expect(result.errors.filter((e) => e.code === "SLIDE_CONTENT_OVERFLOW")).toHaveLength(0);
    });

    it("ignores text-block syntax inside fenced code blocks", () => {
      const fakeBullets = Array.from({ length: 15 }, (_, i) => `- Item ${i + 1}`).join("\n");
      const output = `layout: header-content

@header
# Title

@main
- Real visible item

\`\`\`
::: text-block { column-count=2 markdown=true }
${fakeBullets}
:::
\`\`\``;
      const result = validate("", output, "generate");
      // 15 code lines + 1 bullet = 16, which exceeds the @main budget.
      expect(result.errors.some((e) => e.code === "SLIDE_CONTENT_OVERFLOW")).toBe(true);
    });
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

  describe("Polish-quality fixtures", () => {
    it("passes a dense header-content slide within the line budget", () => {
      // header-content's @main budget is well above 12 lines, so a dense
      // but reasonable bullet list should not be flagged.
      const bullets = Array.from({ length: 12 }, (_, i) => `- Point ${i + 1}`).join("\n");
      const output = `layout: header-content

@header
# Dense Slide

@main
${bullets}`;
      const result = validate("", output, "generate");
      expect(result.ok).toBe(true);
      expect(result.errors.filter((e) => e.code === "SLIDE_CONTENT_OVERFLOW")).toHaveLength(0);
    });

    it("flags a header-content slide with 20 lines in @main as overflow", () => {
      const bullets = Array.from({ length: 20 }, (_, i) => `- Point ${i + 1}`).join("\n");
      const output = `layout: header-content

@header
# Too Dense

@main
${bullets}`;
      const result = validate("", output, "generate");
      expect(result.ok).toBe(false);
      const err = result.errors.find((e) => e.code === "SLIDE_CONTENT_OVERFLOW");
      expect(err).toBeDefined();
      expect(err.message).toContain("@main");
    });

    it("passes a code-heavy two-column slide within budget", () => {
      // A code block in @main with an explanation in @media, both sized to
      // fit their respective area budgets.
      const code = Array.from({ length: 7 }, (_, i) => `line${i + 1} = ${i + 1}`).join("\n");
      const output = `layout: two-column

@header
# Code Walkthrough

@main
\`\`\`python
${code}
\`\`\`

@media
Explanation of the code shown on the left.

@footer
Footer`;
      const result = validate("", output, "generate");
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("passes a header-content slide with a comparison table", () => {
      const output = `layout: header-content

@header
# Feature Comparison

@main
| Feature | Plan A | Plan B |
| --- | --- | --- |
| Speed | Fast | Slow |
| Cost | Low | High |
| Support | Yes | No |
| Storage | 10GB | 100GB |
| Uptime | 99% | 99.9% |`;
      const result = validate("", output, "generate");
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("passes a media-span-left slide with a Mermaid diagram in @media", () => {
      const output = `layout: media-span-left

@header
# Process Flow

@main
A short summary of the process.

@media
\`\`\`mermaid
graph TD
A[Start] --> B[Process]
B --> C[End]
\`\`\`

@footer
Footer`;
      const result = validate("", output, "generate");
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("passes a PPTX-imported slide with two distinct snippets lumped into one code block", () => {
      // The validator does not split fenced code blocks into separate
      // snippets — that responsibility belongs to the AI, not the
      // validator. This documents the expected (lenient) behavior: a
      // single fenced block containing two logically distinct snippets
      // still passes as long as it fits the area's line budget.
      const output = `layout: header-content

@header
# Two Snippets

@main
\`\`\`python
def foo():
    return 1


def bar():
    return 2
\`\`\``;
      const result = validate("", output, "generate");
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("does not count speaker notes lines toward the @main area budget", () => {
      const bullets = Array.from({ length: 12 }, (_, i) => `- Point ${i + 1}`).join("\n");
      const output = `layout: header-content

@header
# Title

@main
${bullets}

<!-- notes: This speaker note is long enough that it would push the slide over budget if it were incorrectly counted toward the @main area. It should be entirely excluded. -->`;
      const result = validate("", output, "generate");
      expect(result.ok).toBe(true);
      expect(result.errors.filter((e) => e.code === "SLIDE_CONTENT_OVERFLOW")).toHaveLength(0);
    });

    it("passes an already-polished, well-structured slide with no false positives", () => {
      const output = `layout: header-content

@header
# Clean Slide

@main
- Point one
- Point two
- Point three

@footer
Footer`;
      const result = validate("", output, "generate");
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("passes a media-span-right slide with an image in @media and text in @main", () => {
      const output = `layout: media-span-right

@header
# Title

@main
- Point one
- Point two

@media
<img src="chart.png" alt="Chart">

@footer
Footer`;
      const result = validate("", output, "generate");
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("does not flag theme/background directives as errors or count them toward content budgets", () => {
      const output = `layout: header-content
theme: dark
background: #1a1a2e

@header
# Title

@main
- Item one
- Item two`;
      const result = validate("", output, "generate");
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("enforcePreserveIdentity checks (remix preserve execute)", () => {
    const validatePreserve = (inputMarkdown, outputMarkdown) => {
      const validator = new AiOutputValidator({ inputMarkdown });
      return validator.validate(outputMarkdown, "generate", {
        expectedSlideCount: 1,
        enforcePreserveIdentity: true,
      });
    };

    const INPUT = `layout: header-content
theme: dark
background: #1a1a2e

@header
# Title

@main
- Item one
- Item two`;

    it("passes when the output keeps the input's theme and background", () => {
      const output = `layout: header-content
theme: dark
background: #1a1a2e

@header
# Title

@main
- Tightened point`;
      const result = validatePreserve(INPUT, output);
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("errors when the output drops the input's theme", () => {
      const output = `layout: header-content
background: #1a1a2e

@header
# Title

@main
- Tightened point`;
      const result = validatePreserve(INPUT, output);
      expect(result.ok).toBe(false);
      expect(result.errors.map((e) => e.code)).toContain("IDENTITY_DIRECTIVE_DROPPED");
      expect(result.errors.find((e) => e.code === "IDENTITY_DIRECTIVE_DROPPED").message).toContain(
        "theme: dark",
      );
    });

    it("errors when the output introduces a new background", () => {
      const output = `layout: header-content
theme: dark
background: linear-gradient(#000, #fff)

@header
# Title

@main
- Tightened point`;
      const result = validatePreserve(INPUT, output);
      expect(result.ok).toBe(false);
      expect(result.errors.map((e) => e.code)).toContain("IDENTITY_DIRECTIVE_ADDED");
    });

    it("errors when a slide with no input identity gains a theme", () => {
      const input = `layout: header-content

@header
# Title

@main
- Item`;
      const output = `layout: header-content
theme: dark

@header
# Title

@main
- Item`;
      const result = validatePreserve(input, output);
      expect(result.ok).toBe(false);
      expect(result.errors.map((e) => e.code)).toContain("IDENTITY_DIRECTIVE_ADDED");
    });

    it("passes when identity values differ only in case", () => {
      const output = `layout: header-content
theme: DARK
background: #1A1A2E

@header
# Title

@main
- Tightened point`;
      const result = validatePreserve(INPUT, output);
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("passes when the model capitalizes the directive name (parser matches case-insensitively)", () => {
      const output = `layout: header-content
Theme: dark
Background: #1a1a2e

@header
# Title

@main
- Tightened point`;
      const result = validatePreserve(INPUT, output);
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("reports raw (un-normalized) values in error messages", () => {
      const input = `layout: header-content
background: #1A1A2E

@header
# Title

@main
- Item`;
      const output = `layout: header-content

@header
# Title

@main
- Tightened point`;
      const result = validatePreserve(input, output);
      const dropped = result.errors.find((e) => e.code === "IDENTITY_DIRECTIVE_DROPPED");
      expect(dropped).toBeDefined();
      // The repair message must ask for the exact source-deck spelling.
      expect(dropped.message).toContain("background: #1A1A2E");
    });

    it("passes when an existing source image becomes a full-bleed background", () => {
      // Preserve mode + a rewrite that turns the input's <img> into a
      // background: url(...) — the image-source check governs that conversion;
      // the identity check must not flag it as an added directive.
      const input = `layout: header-content
theme: dark

@header
# Title

@main
<img src="images/hero.png">`;
      const output = `layout: full-image
theme: dark
background: url(images/hero.png) center/cover

@main
<img src="images/hero.png">`;
      const result = validatePreserve(input, output);
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("still flags added color backgrounds when an image background is present", () => {
      const input = `layout: header-content
theme: dark

@main
<img src="images/hero.png">`;
      const output = `layout: full-image
theme: dark
background: #fff url(images/hero.png)

@main
<img src="images/hero.png">`;
      // `background: #fff url(...)` mixes a new color with the image —
      // splitBackgroundValue separates the layers, so the smuggled `#fff`
      // is detected as an added identity directive (the image-source check
      // governs the url part separately).
      const result = validatePreserve(input, output);
      expect(result.ok).toBe(false);
      expect(result.errors.map((e) => e.code)).toContain("IDENTITY_DIRECTIVE_ADDED");
    });

    it("passes when a mixed background's color part matches the input", () => {
      const input = `layout: header-content
background: #1a1a2e

@main
<img src="images/hero.png">`;
      const output = `layout: full-image
background: #1a1a2e url(images/hero.png) center/cover

@main
<img src="images/hero.png">`;
      // Same color as the input, image layer added (governed by the
      // image-source check) — no identity violation.
      const result = validatePreserve(input, output);
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("passes when directives are indented", () => {
      const output = `layout: header-content
  theme: dark
  background: #1a1a2e

@header
# Title

@main
- Tightened point`;
      const result = validatePreserve(INPUT, output);
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("passes when a merged slide keeps one of several input backgrounds", () => {
      // A merged virtual slide carries one directive set per source slide.
      const input = `layout: header-content
background: #111
theme: dark

@main
- A

<!-- merge source -->

layout: header-content
background: #222

@main
- B`;
      // The merge's output slide keeps one of the two backgrounds — allowed.
      const output = `layout: header-content
background: #111
theme: dark

@main
- A and B`;
      const result = validatePreserve(input, output);
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("skips positional checks when the slide count does not match the input", () => {
      const output = `layout: header-content

@main
- Only slide

---

layout: header-content

@main
- Second slide`;
      const result = validatePreserve(INPUT, output);
      // Count mismatch is the only error — no identity errors on misaligned slides.
      expect(result.errors.map((e) => e.code)).toEqual(["SLIDE_COUNT_MISMATCH"]);
      // The skip is surfaced as a warning so callers know enforcement didn't run.
      expect(result.warnings.map((w) => w.code)).toContain("IDENTITY_CHECK_SKIPPED");
    });

    it("does not enforce identity when enforcePreserveIdentity is not set", () => {
      const output = `layout: header-content

@header
# Title

@main
- No theme kept`;
      const validator = new AiOutputValidator({ inputMarkdown: INPUT });
      const result = validator.validate(output, "generate", { expectedSlideCount: 1 });
      expect(result.ok).toBe(true);
    });

    it("does not enforce identity for polish/generate with preserveVisualIdentity but no enforce flag", () => {
      // Polish and plain generate set preserveVisualIdentity for the prompt
      // suffix and gap-fill dropped directives after validation — identity
      // must not be enforced there.
      const output = `layout: header-content

@header
# Title

@main
- No theme kept`;
      const validator = new AiOutputValidator({ inputMarkdown: INPUT });
      const result = validator.validate(output, "generate", {
        expectedSlideCount: 1,
        preserveVisualIdentity: true,
      });
      expect(result.ok).toBe(true);
    });
  });

  describe("restrictImageSources checks (remix/reimagine execute)", () => {
    const validateSources = (inputMarkdown, outputMarkdown) => {
      const validator = new AiOutputValidator({ inputMarkdown });
      return validator.validate(outputMarkdown, "generate", {
        expectedSlideCount: 1,
        restrictImageSources: true,
      });
    };

    const INPUT = `layout: header-content
background: url(images/bg.png)

@header
# Title

@main
<img src="images/team.png" alt="Team">`;

    it("passes when the output reuses images from the input deck", () => {
      const output = `layout: header-content

@main
<img src="images/team.png" alt="Team">`;
      const result = validateSources(INPUT, output);
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("errors on fabricated or external image URLs", () => {
      const output = `layout: header-content

@main
<img src="https://example.com/fake.png" alt="Fake">`;
      const result = validateSources(INPUT, output);
      expect(result.ok).toBe(false);
      const err = result.errors.find((e) => e.code === "FABRICATED_IMAGE_SRC");
      expect(err).toBeDefined();
      expect(err.message).toContain("https://example.com/fake.png");
    });

    it("errors on invented local image paths", () => {
      const output = `layout: header-content

@main
<img src="images/generated-chart.png">`;
      const result = validateSources(INPUT, output);
      expect(result.ok).toBe(false);
      expect(result.errors.map((e) => e.code)).toContain("FABRICATED_IMAGE_SRC");
    });

    it("allows images referenced via reuse:<path> in the input", () => {
      const input = `<!-- brief: Intro | image: reuse:images/team.png -->`;
      const output = `layout: header-content

@main
<img src="images/team.png" alt="Team">`;
      const result = validateSources(input, output);
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("allows an input background url to be reused as a background", () => {
      const output = `layout: header-content
background: url(images/bg.png)

@main
- Text`;
      const result = validateSources(INPUT, output);
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("errors on a fabricated background url", () => {
      const output = `layout: header-content
background: url(https://example.com/bg.png)

@main
- Text`;
      const result = validateSources(INPUT, output);
      expect(result.ok).toBe(false);
      expect(result.errors.map((e) => e.code)).toContain("FABRICATED_IMAGE_SRC");
    });

    it("allows quoted background urls that contain spaces", () => {
      const input = `layout: header-content
background: url("images/my bg.png")

@main
- Text`;
      const output = `layout: header-content
background: url("images/my bg.png")

@main
- Text`;
      const result = validateSources(input, output);
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("allows a background url that is not the start of the value", () => {
      // Multi-layer/gradient backgrounds put url(...) after other layers —
      // every occurrence on the background line must be scanned.
      const input = `layout: header-content
background: linear-gradient(rgba(0, 0, 0, 0.5)), url(images/bg.png)

@main
- Text`;
      const output = `layout: header-content
background: #000 url(images/bg.png) center/cover no-repeat

@main
- Text`;
      const result = validateSources(input, output);
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("errors on a fabricated background url embedded in a gradient/shorthand value", () => {
      const output = `layout: header-content
background: linear-gradient(rgba(0, 0, 0, 0.5)), url(https://example.com/bg.png)

@main
- Text`;
      const result = validateSources(INPUT, output);
      expect(result.ok).toBe(false);
      expect(result.errors.map((e) => e.code)).toContain("FABRICATED_IMAGE_SRC");
    });

    it("scans indented background directives (the parser accepts them)", () => {
      const input = `layout: header-content
  background: url(images/bg.png) center/cover

@main
- Text`;
      const output = `layout: header-content
  background: url(images/bg.png) center/cover

@main
- Text`;
      const result = validateSources(input, output);
      expect(result.ok).toBe(true);
    });

    it("flags a fabricated url inside an indented background directive", () => {
      const output = `layout: header-content
  background: url(https://example.com/bg.png)

@main
- Text`;
      const result = validateSources(INPUT, output);
      expect(result.ok).toBe(false);
      expect(result.errors.map((e) => e.code)).toContain("FABRICATED_IMAGE_SRC");
    });

    it("does not flag output images when no image sources exist at all", () => {
      // No explicit allowlist and no images in the input: nothing may be
      // referenced, but the check is skipped — flagging every image would
      // burn a repair round-trip per batch, and the orchestrator's mechanical
      // strip (stripFabricatedImages) removes whatever the model emits.
      const input = `layout: header-content

@main
- Text only`;
      const output = `layout: header-content

@main
<img src="images/new.png">`;
      const result = validateSources(input, output);
      expect(result.ok).toBe(true);
    });

    it("does not flag image srcs inside code fences (code samples, not references)", () => {
      const input = `layout: header-content

@main
\`\`\`html
<img src="images/code-sample.png">
\`\`\``;
      // The output's code sample references an image that is not in the deck —
      // it is illustrative HTML, so it must not be flagged as fabricated.
      const output = `layout: header-content

@main
\`\`\`html
<img src="https://developer.mozilla.org/logo.png">
\`\`\``;
      const result = validateSources(input, output);
      expect(result.ok).toBe(true);
    });

    it("allows kept images passed via allowedImageSrcs even when the input has no reference", () => {
      // Reimagine execute: the virtual deck is briefs with no reuse: ref, but
      // the kept image is listed in the options suffix — the explicit
      // allowlist must cover it.
      const input = `<!-- brief: Slide A | beat: continuation, energy: medium, contrast: moderate, relationship: continue -->`;
      const output = `layout: header-content

@main
<img src="images/team.png" alt="Team">`;
      const validator = new AiOutputValidator({ inputMarkdown: input });
      const result = validator.validate(output, "generate", {
        expectedSlideCount: 1,
        restrictImageSources: true,
        allowedImageSrcs: ["images/team.png"],
      });
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects images outside the explicit allowedImageSrcs list", () => {
      const input = `<!-- brief: Slide A -->`;
      const output = `layout: header-content

@main
<img src="images/team.png" alt="Team">`;
      const validator = new AiOutputValidator({ inputMarkdown: input });
      const result = validator.validate(output, "generate", {
        expectedSlideCount: 1,
        restrictImageSources: true,
        allowedImageSrcs: ["images/other.png"],
      });
      expect(result.ok).toBe(false);
      expect(result.errors.map((e) => e.code)).toContain("FABRICATED_IMAGE_SRC");
    });

    it("accepts an allowed image written with a ./ prefix (normalized comparison)", () => {
      const input = `<!-- brief: Slide A -->`;
      const output = `layout: header-content

@main
<img src="./images/team.png" alt="Team">`;
      const validator = new AiOutputValidator({ inputMarkdown: input });
      const result = validator.validate(output, "generate", {
        expectedSlideCount: 1,
        restrictImageSources: true,
        allowedImageSrcs: ["images/team.png"],
      });
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("accepts an allowed image written with percent-encoding (normalized comparison)", () => {
      const input = `<!-- brief: Slide A -->`;
      const output = `layout: header-content

@main
<img src="images/my%20pic.png" alt="Team">`;
      const validator = new AiOutputValidator({ inputMarkdown: input });
      const result = validator.validate(output, "generate", {
        expectedSlideCount: 1,
        restrictImageSources: true,
        allowedImageSrcs: ["images/my pic.png"],
      });
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("ignores image references inside ~~~ fenced code blocks", () => {
      // The validator's fence scans were ```-only before the consolidation
      // onto findFencedRanges — a ~~~ fenced code sample illustrating an
      // <img> tag was treated as a real reference and flagged.
      const input = `<!-- brief: Slide A -->`;
      const output = `layout: header-content

@main
~~~
<img src="https://developer.mozilla.org/logo.png">
~~~`;
      const validator = new AiOutputValidator({ inputMarkdown: input });
      const result = validator.validate(output, "generate", {
        expectedSlideCount: 1,
        restrictImageSources: true,
        allowedImageSrcs: ["images/real.png"],
      });
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("ignores background: lines inside ~~~ fenced code blocks", () => {
      const input = `<!-- brief: Slide A -->`;
      const output = `layout: header-content

@main
~~~
background: url(https://evil.example/x.png)
~~~`;
      const validator = new AiOutputValidator({ inputMarkdown: input });
      const result = validator.validate(output, "generate", {
        expectedSlideCount: 1,
        restrictImageSources: true,
        allowedImageSrcs: ["images/real.png"],
      });
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("onlyExplicitImageSources skips the input-derived union", () => {
      // The input brief carries a reuse:<path> reference, but
      // onlyExplicitImageSources must not trust it — only the explicit
      // allowedImageSrcs are accepted (and the positional exemption does not
      // cover reuse: paths, which are instructions, not images).
      const input = `<!-- brief: Slide A | image: reuse:images/hallucinated.png -->`;
      const output = `layout: header-content

@main
<img src="images/hallucinated.png" alt="Hallucinated">`;
      const validator = new AiOutputValidator({ inputMarkdown: input });
      const result = validator.validate(output, "generate", {
        expectedSlideCount: 1,
        restrictImageSources: true,
        allowedImageSrcs: ["images/real.png"],
        onlyExplicitImageSources: true,
      });
      expect(result.ok).toBe(false);
      expect(result.errors.map((e) => e.code)).toContain("FABRICATED_IMAGE_SRC");
    });

    it("allows an output slide to keep its own input slide's image (positional exemption)", () => {
      // Text-only remix: no analyzed images, but a rewritten slide may keep
      // its own source slide's image — preservation, not reuse.
      const input = `layout: header-content

@main
<img src="images/a.png">`;
      const output = `layout: header-content

@main
- Tightened

<img src="images/a.png">`;
      const validator = new AiOutputValidator({ inputMarkdown: input });
      const result = validator.validate(output, "generate", {
        expectedSlideCount: 1,
        restrictImageSources: true,
        allowedImageSrcs: [],
        onlyExplicitImageSources: true,
      });
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("flags an image adopted from another input slide (positional exemption is per-slide)", () => {
      const input = `layout: header-content

@main
<img src="images/a.png">

---

layout: header-content

@main
- Item 2`;
      const output = `layout: header-content

@main
- Tightened

---

layout: header-content

@main
- Tightened

<img src="images/a.png">`;
      const validator = new AiOutputValidator({ inputMarkdown: input });
      const result = validator.validate(output, "generate", {
        expectedSlideCount: 2,
        restrictImageSources: true,
        allowedImageSrcs: [],
        onlyExplicitImageSources: true,
      });
      expect(result.ok).toBe(false);
      expect(result.errors.map((e) => e.code)).toContain("FABRICATED_IMAGE_SRC");
      // The violation is on slide 2 (index 1), not the slide the image
      // belongs to.
      expect(result.errors.find((e) => e.code === "FABRICATED_IMAGE_SRC").slide).toBe(1);
    });
  });

  describe("enforcePreserveIdentity image-source preservation", () => {
    const validatePreserve = (inputMarkdown, outputMarkdown) => {
      const validator = new AiOutputValidator({ inputMarkdown });
      return validator.validate(outputMarkdown, "generate", {
        expectedSlideCount: 1,
        enforcePreserveIdentity: true,
      });
    };

    it("passes when the output keeps the input's image (as <img>)", () => {
      const input = `layout: header-content
theme: dark

@main
<img src="images/hero.png">`;
      const output = `layout: header-content
theme: dark

@main
<img src="images/hero.png">`;
      const result = validatePreserve(input, output);
      expect(result.ok).toBe(true);
    });

    it("passes when the output converts the input <img> to a background: url(...)", () => {
      const input = `layout: header-content
theme: dark

@main
<img src="images/hero.png">`;
      const output = `layout: full-image
theme: dark
background: url(images/hero.png) center/cover

@main
## Hero`;
      const result = validatePreserve(input, output);
      expect(result.ok).toBe(true);
    });

    it("errors when the output drops the input image entirely", () => {
      const input = `layout: header-content
theme: dark

@main
<img src="images/hero.png">`;
      const output = `layout: header-content
theme: dark

@main
- Tightened point`;
      const result = validatePreserve(input, output);
      expect(result.ok).toBe(false);
      expect(result.errors.map((e) => e.code)).toContain("PRESERVED_IMAGE_SRC_DROPPED");
    });

    it("errors when the output drops a source image background", () => {
      const input = `layout: full-image
theme: dark
background: url(images/hero.png) center/cover

@main
## Hero`;
      const output = `layout: header-content
theme: dark

@main
- Tightened point`;
      const result = validatePreserve(input, output);
      expect(result.ok).toBe(false);
      expect(result.errors.map((e) => e.code)).toContain("PRESERVED_IMAGE_SRC_DROPPED");
    });

    it("does not error when the output reuses the image with a ./ prefix (normalized)", () => {
      const input = `layout: header-content
theme: dark

@main
<img src="images/hero.png">`;
      const output = `layout: header-content
theme: dark

@main
<img src="./images/hero.png">`;
      const result = validatePreserve(input, output);
      expect(result.errors.map((e) => e.code)).not.toContain("PRESERVED_IMAGE_SRC_DROPPED");
    });

    it("does not error when the model relocates an image to another slide (deck-wide)", () => {
      const input = `layout: header-content
theme: dark

@main
<img src="images/hero.png">

---

layout: header-content
theme: dark

@main
- Slide 2`;
      const output = `layout: header-content
theme: dark

@main
- Slide 1 (no image)

---

layout: full-image
theme: dark
background: url(images/hero.png) center/cover

@main
## Hero`;
      const validator = new AiOutputValidator({ inputMarkdown: input });
      const result = validator.validate(output, "generate", {
        expectedSlideCount: 2,
        enforcePreserveIdentity: true,
      });
      expect(result.errors.map((e) => e.code)).not.toContain("PRESERVED_IMAGE_SRC_DROPPED");
    });

    it("still errors when an image is dropped from the entire deck", () => {
      const input = `layout: header-content
theme: dark

@main
<img src="images/hero.png">

---

layout: header-content
theme: dark

@main
- Slide 2`;
      const output = `layout: header-content
theme: dark

@main
- Slide 1 (no image)

---

layout: header-content
theme: dark

@main
- Slide 2`;
      const validator = new AiOutputValidator({ inputMarkdown: input });
      const result = validator.validate(output, "generate", {
        expectedSlideCount: 2,
        enforcePreserveIdentity: true,
      });
      expect(result.errors.map((e) => e.code)).toContain("PRESERVED_IMAGE_SRC_DROPPED");
    });
  });

  describe("directive whitespace tolerance", () => {
    const validatePreserve = (inputMarkdown, outputMarkdown) => {
      const validator = new AiOutputValidator({ inputMarkdown });
      return validator.validate(outputMarkdown, "generate", {
        expectedSlideCount: 1,
        enforcePreserveIdentity: true,
      });
    };

    it("recognizes 'theme : dark' (whitespace before colon) as a valid directive", () => {
      const output = `layout: header-content
theme : dark
background : #1a1a2e

@header
# Title

@main
- Tightened point`;
      const result = validatePreserve(
        "layout: header-content\ntheme: dark\nbackground: #1a1a2e\n@header\n# Title\n\n@main\n- Item",
        output,
      );
      // Both directives are present (with whitespace before colon) — no drop error.
      expect(result.errors.map((e) => e.code)).not.toContain("IDENTITY_DIRECTIVE_DROPPED");
    });

    it("recognizes 'Theme : dark' (case + whitespace before colon)", () => {
      const output = `layout: header-content
Theme : dark
Background : #1a1a2e

@header
# Title

@main
- Tightened point`;
      const result = validatePreserve(
        "layout: header-content\ntheme: dark\nbackground: #1a1a2e\n@header\n# Title\n\n@main\n- Item",
        output,
      );
      expect(result.errors.map((e) => e.code)).not.toContain("IDENTITY_DIRECTIVE_DROPPED");
    });

    it("flags a dropped theme when the output uses 'theme : ' with a different value", () => {
      const output = `layout: header-content
theme : light

@header
# Title

@main
- Tightened point`;
      const result = validatePreserve(
        "layout: header-content\ntheme: dark\n@header\n# Title\n\n@main\n- Item",
        output,
      );
      expect(result.errors.map((e) => e.code)).toContain("IDENTITY_DIRECTIVE_ADDED");
    });
  });

  describe("collectOwnImageSources", () => {
    it("collects <img> srcs and background urls, excluding reuse: paths", () => {
      const markdown = `layout: header-content
background: url(images/bg.png)

@header
# Title

@main
<img src="images/team.png" alt="Team">

<!-- brief: Intro | image: reuse:images/other.png -->`;
      const srcs = collectOwnImageSources(markdown);
      expect(srcs).toContain("images/team.png");
      expect(srcs).toContain("images/bg.png");
      expect(srcs).not.toContain("reuse:images/other.png");
    });
  });

  describe("stripFabricatedImages", () => {
    const log = [];
    const onLog = (msg, level) => log.push({ msg, level });

    beforeEach(() => {
      log.length = 0;
    });

    it("removes fabricated <img> tags with hallucinated filenames", () => {
      const markdown = `layout: header-content

@main
<img src="images/image16-2349.jpeg" alt="Photo">`;
      const allowed = ["images/image16-3245.jpeg"];
      const result = stripFabricatedImages(markdown, allowed, onLog);
      expect(result).not.toContain('src="images/image16-2349.jpeg"');
      expect(log.some((l) => l.msg.includes("images/image16-2349.jpeg"))).toBe(true);
    });

    it("keeps image paths that are written slightly differently", () => {
      const markdown = `layout: header-content

@main
<img src="./images/team.png" alt="Team">`;
      const allowed = ["images/team.png"];
      const result = stripFabricatedImages(markdown, allowed, onLog);
      expect(result).toContain('src="./images/team.png"');
      expect(log).toHaveLength(0);
    });

    it("removes fabricated background urls", () => {
      const markdown = `layout: header-content
background: url(images/fake-bg.png)

@main
- Text`;
      const allowed = ["images/real-bg.png"];
      const result = stripFabricatedImages(markdown, allowed, onLog);
      expect(result).not.toContain("background:");
      expect(result).not.toContain("images/fake-bg.png");
    });

    it("leaves fenced code blocks untouched", () => {
      const markdown = `layout: header-content

@main
\`\`\`html
<img src="images/fake.png">
\`\`\``;
      const allowed = [];
      const result = stripFabricatedImages(markdown, allowed, onLog);
      expect(result).toContain('src="images/fake.png"');
    });
  });

  describe("visual-system compliance warnings", () => {
    const vs = { visualDirection: "Dark, technical, with bright accents." };

    const validateWithVs = (outputMarkdown) => {
      const validator = new AiOutputValidator({ inputMarkdown: "" });
      return validator.validate(outputMarkdown, "generate", { visualSystem: vs });
    };

    const goodSlide = `layout: header-content
theme: dark
background: #1a1a2e

@header
# Title

@main
- Point`;

    it("passes without warnings when theme and background are valid", () => {
      const result = validateWithVs(goodSlide);
      expect(result.ok).toBe(true);
      expect(result.warnings.filter((w) => w.code.startsWith("VISUAL_SYSTEM_"))).toHaveLength(0);
    });

    it("warns on invalid theme value", () => {
      const output = `layout: header-content
theme: purple
background: #1a1a2e

@header
# Title`;
      const result = validateWithVs(output);
      expect(result.ok).toBe(true);
      const vsWarnings = result.warnings.filter((w) => w.code === "VISUAL_SYSTEM_INVALID_THEME");
      expect(vsWarnings).toHaveLength(1);
      expect(vsWarnings[0].message).toContain("purple");
    });

    it("warns on named CSS color background", () => {
      const output = `layout: header-content
theme: dark
background: red

@header
# Title`;
      const result = validateWithVs(output);
      const vsWarnings = result.warnings.filter(
        (w) => w.code === "VISUAL_SYSTEM_INVALID_BACKGROUND",
      );
      expect(vsWarnings).toHaveLength(1);
      expect(vsWarnings[0].message).toContain("red");
    });

    it("warns on transparent background", () => {
      const output = `layout: header-content
theme: dark
background: transparent

@header
# Title`;
      const result = validateWithVs(output);
      const vsWarnings = result.warnings.filter(
        (w) => w.code === "VISUAL_SYSTEM_INVALID_BACKGROUND",
      );
      expect(vsWarnings).toHaveLength(1);
    });

    it("warns on none background", () => {
      const output = `layout: header-content
theme: dark
background: none

@header
# Title`;
      const result = validateWithVs(output);
      const vsWarnings = result.warnings.filter(
        (w) => w.code === "VISUAL_SYSTEM_INVALID_BACKGROUND",
      );
      expect(vsWarnings).toHaveLength(1);
    });

    it("does not warn on valid gradient background", () => {
      const output = `layout: header-content
theme: dark
background: linear-gradient(135deg, #1a1a2e, #0d1117)

@header
# Title`;
      const result = validateWithVs(output);
      const vsWarnings = result.warnings.filter(
        (w) => w.code === "VISUAL_SYSTEM_INVALID_BACKGROUND",
      );
      expect(vsWarnings).toHaveLength(0);
    });

    it("does not warn on valid url() background", () => {
      const output = `layout: full-image
theme: dark
background: url(images/hero.png)

@main
<img src="images/hero.png">`;
      const result = validateWithVs(output);
      const vsWarnings = result.warnings.filter(
        (w) => w.code === "VISUAL_SYSTEM_INVALID_BACKGROUND",
      );
      expect(vsWarnings).toHaveLength(0);
    });

    it("warns when no slide has theme or background (visual direction ignored)", () => {
      const output = `layout: header-content

@header
# Title

@main
- Point`;
      const result = validateWithVs(output);
      const vsWarnings = result.warnings.filter((w) => w.code === "VISUAL_SYSTEM_IGNORED");
      expect(vsWarnings).toHaveLength(1);
      expect(vsWarnings[0].slide).toBe(-1);
    });

    it("does not warn about ignored direction when at least one slide has theme", () => {
      const output = `layout: header-content
theme: dark

@header
# Title

---

layout: header-content

@header
# Slide 2`;
      const result = validateWithVs(output);
      const ignored = result.warnings.filter((w) => w.code === "VISUAL_SYSTEM_IGNORED");
      expect(ignored).toHaveLength(0);
    });

    it("does not run visual-system checks when no visualSystem is provided", () => {
      const validator = new AiOutputValidator({ inputMarkdown: "" });
      const result = validator.validate(goodSlide, "generate", {});
      const vsWarnings = result.warnings.filter((w) => w.code.startsWith("VISUAL_SYSTEM_"));
      expect(vsWarnings).toHaveLength(0);
    });

    it("does not flag individual slides merely for missing theme or background", () => {
      const output = `layout: header-content
theme: dark
background: #1a1a2e

@header
# Slide 1

---

layout: header-content

@header
# Slide 2`;
      const result = validateWithVs(output);
      // Slide 2 has no theme/background, but that's not a warning —
      // applyVisualSystemIdentity fills them in.
      const missingWarnings = result.warnings.filter(
        (w) =>
          w.code === "VISUAL_SYSTEM_INVALID_THEME" || w.code === "VISUAL_SYSTEM_INVALID_BACKGROUND",
      );
      expect(missingWarnings).toHaveLength(0);
      // The deck as a whole is not "ignored" because slide 1 has directives.
      const ignored = result.warnings.filter((w) => w.code === "VISUAL_SYSTEM_IGNORED");
      expect(ignored).toHaveLength(0);
    });

    it("warns on multi-word theme value (e.g. 'dark extra')", () => {
      const output = `layout: header-content
theme: dark extra
background: #1a1a2e

@header
# Title`;
      const result = validateWithVs(output);
      const vsWarnings = result.warnings.filter((w) => w.code === "VISUAL_SYSTEM_INVALID_THEME");
      expect(vsWarnings).toHaveLength(1);
      expect(vsWarnings[0].message).toContain("dark extra");
    });

    it("warns on empty background directive", () => {
      const output = `layout: header-content
theme: dark
background:

@header
# Title`;
      const result = validateWithVs(output);
      const vsWarnings = result.warnings.filter(
        (w) => w.code === "VISUAL_SYSTEM_INVALID_BACKGROUND",
      );
      expect(vsWarnings).toHaveLength(1);
      expect(vsWarnings[0].message).toContain("empty");
    });

    it("warns on multi-word named-color background (e.g. 'red blue')", () => {
      const output = `layout: header-content
theme: dark
background: red blue

@header
# Title`;
      const result = validateWithVs(output);
      const vsWarnings = result.warnings.filter(
        (w) => w.code === "VISUAL_SYSTEM_INVALID_BACKGROUND",
      );
      expect(vsWarnings).toHaveLength(1);
      expect(vsWarnings[0].message).toContain("red blue");
    });

    it("counts malformed background as present for IGNORED check", () => {
      // Even though the background is malformed, the directive is present,
      // so VISUAL_SYSTEM_IGNORED should NOT fire.
      const output = `layout: header-content
theme: dark
background: red

@header
# Title`;
      const result = validateWithVs(output);
      const ignored = result.warnings.filter((w) => w.code === "VISUAL_SYSTEM_IGNORED");
      expect(ignored).toHaveLength(0);
    });
  });
});
