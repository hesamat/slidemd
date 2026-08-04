# AI Prompt Template

This document describes the prompt architecture used by the AI enhancement features (fix and generate modes).

## Prompt Architecture

Prompts are split into reusable fragments in [`src/data/prompts/`](../src/data/prompts/):

| File                 | Role     | Purpose                                             |
| -------------------- | -------- | --------------------------------------------------- |
| `system-prompt.md`   | `system` | Global rules, JSON output format, layout list       |
| `generate-prompt.md` | `user`   | Creative reorganization task + `{{markdown}}` input |
| `fix-prompt.md`      | `user`   | Conservative cleanup task + `{{markdown}}` input    |

Fragments are composed by [`AiPromptComposer`](../src/data/ai/ai-prompt-composer.js), which replaces `{{placeholders}}` with the provided substitutions. The `{{layoutList}}` placeholder in the system prompt is replaced with the current layout registry; `{{markdown}}` in the user prompts is replaced with the deck content.

## System Prompt Rules

The system prompt (`system-prompt.md`) defines:

- **Output format**: JSON object with a `slides` array, each slide having `layout` and `content` fields
- **JSON-only output**: no explanations, markdown fences, or surrounding text
- **Area markers**: `@area-name` syntax, blank lines around markers
- **Text blocks**: `::: text-block { ... }` for styled/multi-column text
- **Speaker notes**: `<!-- notes: ... -->` at the end of slide content
- **Diagrams**: `[Diagram: ...]` converted to Mermaid only for true flowcharts/hierarchies
- **Allowed layouts**: injected via `{{layoutList}}`

## Fix Mode (fix-prompt.md)

Conservative cleanup that preserves content and slide count:

- Rejoin split code lines, add language tags
- Restore blank lines between sections
- Remove bold wrapping from headings
- Fix broken links, lists, and tables
- Remove duplicate blank lines and trailing whitespace
- Convert `[Diagram: ...]` to Mermaid where appropriate
- Fix mismatched layouts (downgrade `media-span`/`two-column` when no image/empty column)
- Does **not** change heading levels or add/remove slides

## Generate Mode (generate-prompt.md)

Creative reorganization that may restructure the deck:

- Keep all substantive content but reorganize for clarity
- Split overloaded slides, combine sparse ones
- Use tables for comparisons, two-column for dense content
- `media-span` only for actual images, `full-image` for full-bleed
- `title-slide` only for the first slide (`@title`, `@footer`)
- `three-column` uses `@main`, `@media`, `@secondary`
- Add speaker notes where helpful
- Do not inflate slide count

## SlideMD Syntax Reference

### Basic Structure

- Slides are separated by `---` (three dashes on a line by themselves)
- Optional speaker notes: `<!-- notes: ... -->` at the very top of the slide
- Each slide begins with frontmatter: `layout: preset-name` or `layout: "grid definition" / columns`
- Content areas are marked with `@area-name` (e.g., `@header`, `@main`, `@media`, `@sidebar`)
- Content before the first `@area` flows into `@main`

### Built-in Layouts

| Layout           | Areas                                                 | Use Case                        |
| ---------------- | ----------------------------------------------------- | ------------------------------- |
| `title-slide`    | `@title`, `@footer`                                   | Title/cover slide               |
| `header-content` | `@header`, `@main`, `@footer`                         | Standard content slide          |
| `focus`          | `@header`, `@main`, `@footer`                         | Centered, minimal header/footer |
| `two-column`     | `@header`, `@main`, `@media`, `@footer`               | Two equal columns               |
| `left-heavy`     | `@header`, `@main`, `@media`, `@footer`               | Left column 2x wider            |
| `right-heavy`    | `@header`, `@main`, `@media`, `@footer`               | Right column 2x wider           |
| `three-column`   | `@header`, `@main`, `@media`, `@secondary`, `@footer` | Three equal columns             |
| `media-span`     | `@header`, `@main`, `@media`, `@footer`               | Media spans full right height   |
| `full-image`     | `@main`                                               | Full-bleed image, no text       |

### Custom Grid Layouts

When a preset doesn't fit, define a custom CSS grid directly:

```markdown
layout: "header header" "main media" / 1fr 1fr

@header

## Title

@main
Left content

@media
Right content
```

The `layout:` value follows CSS `grid-template` shorthand syntax. Quoted rows list area names; column sizes follow `/`. Always use `@main` for the primary content area.

### Slide Options

- `theme: dark` or `theme: light`
- `background: linear-gradient(...)` or `background: #color`
- `hidden: true` — slide hidden by default
- Speaker notes: `<!-- notes: ... -->` (first line of slide, before `layout:`)

### Built-in Features

- **Code highlighting**: Fenced code blocks with language identifier
- **Math**: Inline `$x^2$` or block `$$\int$$` using KaTeX
- **Diagrams**: Mermaid syntax in `mermaid` fenced blocks
- **Markdown**: Bold, italic, lists, blockquotes, tables, links
- **HTML**: Inline styles for custom formatting
- **Text blocks**: `::: text-block { ... }` for styled, positioned, or multi-column text; use `column-count=N` to flow long lists across N columns

## Content Capacity

Slides render at **1920x1080px**. Approximate maximums per content area:

| Content Type             | Max Items/Lines | Notes                                  |
| ------------------------ | --------------- | -------------------------------------- |
| Bullet list items        | ~13             | Single column, `header-content` layout |
| Bullet list (two-column) | ~6 per column   | `two-column` layout                    |
| Body text paragraphs     | ~15 lines       | At 30px font size                      |
| Code lines               | ~18 lines       | At 24px mono font                      |
| Table rows               | ~8              | Including header row                   |

If content exceeds these limits, split across multiple slides or use two-column layout.

## Image Handling

- Preserve every `<img src="images/...">` and `background: url(images/...)` exactly
- Do NOT replace `images/...` paths with `blob:` URLs, data URIs, or other forms
- Keep image filenames, dimensions, and alt text unchanged
- Use `src="images/filename.png"` and place in `@media` or `@main` area

## Modification Checklist

When modifying prompts:

1. Check all three prompt files for consistency
2. Run `npm test` — AI enhancer tests verify prompt processing
3. Keep combined system + user prompt length under ~150 lines
4. Count strong negative directives (NEVER, Do NOT) — aim for <=5 per prompt
5. Keep both layout lists in sync (system prompt `{{layoutList}}` and this doc)
6. Update this document and `docs/example/slides.md` to reflect changes
