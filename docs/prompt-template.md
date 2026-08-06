# AI Prompt Template

This document describes the prompt architecture used by the AI enhancement features.

## Prompt Architecture

Prompts are split into reusable fragments in [`src/data/prompts/`](../src/data/prompts/):

| File                          | Role     | Purpose                                                                                                                      |
| ----------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `system-prompt.md`            | `system` | Global rules, JSON output format, layout list                                                                                |
| `generate-prompt.md`          | `user`   | Creative reorganization task + `{{markdown}}` input (whole-deck)                                                             |
| `fix-prompt.md`               | `user`   | Conservative cleanup task + `{{markdown}}` input (enhanceSlide)                                                              |
| `add-speaker-notes-prompt.md` | `user`   | Add speaker notes to slide (single-slide)                                                                                    |
| `remix-plan-prompt.md`        | `user`   | Plan phase for Remix: analyze deck → output restructuring plan JSON (may include image blocks for vision-augmented planning) |

Fragments are composed by [`AiPromptComposer`](../src/data/ai/ai-prompt-composer.js), which replaces `{{placeholders}}` with the provided substitutions. The `{{layoutList}}` placeholder in the system prompt is replaced with the current layout registry; `{{markdown}}` in the user prompts is replaced with the deck or slide content.

Intents are mapped to prompt builders by [`AiIntentRegistry`](../src/data/ai/ai-intent-registry.js), and the [`AiOrchestrator`](../src/data/ai/ai-orchestrator.js) coordinates the LLM call, validation, and repair loop.

## System Prompt Rules

The system prompt (`system-prompt.md`) defines:

- **Output format**: JSON object with a `slides` array, each slide having `layout` and `content` fields
- **JSON-only output**: no explanations, markdown fences, or surrounding text
- **Area markers**: `@area-name` syntax, blank lines around markers
- **Text blocks**: `::: text-block { ... }` for styled/multi-column text
- **Speaker notes**: `<!-- notes: ... -->` at the end of slide content
- **Diagrams**: `[Diagram: ...]` converted to Mermaid only for true flowcharts/hierarchies
- **Header headings**: the first heading in `@header` must be `#` (h1), not `##` or lower
- **Image handling**: preserve `<img>` tags unless FIDELITY says to drop; use `position: relative` with `left`/`top`/`width` for custom placement
- **Allowed layouts**: injected via `{{layoutList}}` as a per-layout list of allowed `@area` names (e.g. `two-column: @header, @main, @media, @footer`)

## enhanceSlide Intent (fix-prompt.md)

Conservative cleanup of a single slide that preserves content and slide count:

- Rejoin split code lines, add language tags
- Restore blank lines between sections
- Remove bold wrapping from headings
- Fix broken links, lists, and tables
- Remove duplicate blank lines and trailing whitespace
- Convert `[Diagram: ...]` to Mermaid where appropriate
- Fix mismatched layouts (downgrade `media-span`/`two-column` when no image/empty column)
- Does **not** change heading levels or add/remove slides

## Generate Mode (generate-prompt.md)

Refines the whole deck's wording, layouts, and structure:

- Improve wording: concise headers, tightened bullet points, specific statements
- Pick the best layout per slide (two-column, focus, table) over defaulting to header-content
- Use tables for 2-3 item comparisons; two-column for diagrams, code, or dense content
- Add speaker notes where helpful: `<!-- notes: ... -->`
- Preserve `theme:` directives; keep `background:` unless it doesn't fit the restructured content (decorative overlays may be dropped)
- Preserve `<img>` tags; reposition with `position: relative` + `left`/`top`/`width` for custom placement
- Drop images that are low quality, redundant, or don't add value
- PPTX imports: fix mismatched layouts, reposition misplaced images, tighten verbose text
- Follow the FIDELITY instruction appended after the prompt for how much to change

### Fidelity Levels

| Fidelity            | User fragment                                                  | What it does                                                                                                                                                                     |
| ------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `polish` (Tidy up)  | `fix-prompt.md`                                                | Same specific cleanup rules as single-slide "Clean up slide": rejoin split code, fix bold wrapping, broken links, mismatched layouts. No wording changes. Slide count unchanged. |
| `enhance` (Restyle) | `generate-prompt.md` + RESTYLE suffix                          | Rework text, pick better layouts, add notes. Slide count unchanged.                                                                                                              |
| `rewrite` (Remix)   | `remix-plan-prompt.md` (plan) → `generate-prompt.md` (execute) | Two-phase plan→execute. Can merge, reorder, restructure. Slide count may change.                                                                                                 |

### Vision-Augmented Remix

When the user enables "Send slide images to AI" in the generate modal (visible only for Remix fidelity), the plan phase sends raw content images alongside the deck summary:

- Content images (inline `<img>` and `![alt](src)`) are extracted per slide, excluding background images
- Each image is compressed to <40KB JPEG (max 768px width) via canvas
- The plan message uses multi-modal content blocks (text + image_url)
- Provider-specific mapping: OpenAI (image_url), Anthropic (image source), Gemini (inline_data)
- The plan AI can use `keepImages` field to specify which images to keep per output slide
- `keepImages: [0]` keeps the first image, `[]` drops all, omit keeps all
- Falls back to text-only if the provider rejects images (e.g. model doesn't support vision)
- The execute phase is text-only — only the plan phase receives images

## addSpeakerNotes Intent (add-speaker-notes-prompt.md)

Adds speaker notes to a single slide:

- Add `<!-- notes: ... -->` at the end of the slide content
- Notes expand on key points for a presenter (2-4 sentences)
- Include context, transitions, and talking points
- Does not change the slide's layout or visible content

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
- For custom placement, use `style="position: relative; left: Npx; top: Npx; width: Npx;"` on the `<img>` tag
- The AI may drop images that are low quality, redundant, or don't add value (per the generate-prompt rules)
- The AI may change or drop `background:` directives that are decorative overlays and don't fit the restructured content

## Modification Checklist

When modifying prompts:

1. Check all prompt files for consistency
2. Run `npm test` — AI module tests verify prompt processing
3. Keep combined system + user prompt length under ~150 lines
4. Count strong negative directives (NEVER, Do NOT) — aim for <=5 per prompt
5. Keep both layout lists in sync (system prompt `{{layoutList}}` and this doc)
6. Update this document and `docs/example/slides.md` to reflect changes
