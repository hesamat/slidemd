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

    it("errors when the input has no images and the output adds one", () => {
      const input = `layout: header-content

@main
- Text only`;
      const output = `layout: header-content

@main
<img src="images/new.png">`;
      const result = validateSources(input, output);
      expect(result.ok).toBe(false);
      expect(result.errors.map((e) => e.code)).toContain("FABRICATED_IMAGE_SRC");
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
  });
});
