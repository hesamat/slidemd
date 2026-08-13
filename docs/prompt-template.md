# AI Prompt Template

This document describes the prompt architecture used by the AI enhancement features.

## Prompt Architecture

Prompts are split into reusable fragments in [`src/data/prompts/`](../src/data/prompts/), cataloged by the `FRAGMENTS` map in [`ai-prompt-fragments.js`](../src/data/ai/ai-prompt-fragments.js):

| File                                | Role     | Purpose                                                                                                     |
| ----------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `system-prompt.md`                  | `system` | Global rules, JSON output format, layout list                                                               |
| `polish-prompt.md`                  | `user`   | Whole-deck cleanup and wording/layout improvement; preserves slide count and order                          |
| `generate-prompt.md`                | `user`   | Creative reorganization task + `{{markdown}}` input (whole-deck execute phase)                              |
| `fix-prompt.md`                     | `user`   | Conservative cleanup task + `{{markdown}}` input (enhanceSlide)                                             |
| `add-speaker-notes-prompt.md`       | `user`   | Add speaker notes to slide (single-slide)                                                                   |
| `remix-plan-prompt.md`              | `user`   | Plan phase for Remix: analyze deck → output restructuring plan JSON (may include image blocks for vision)   |
| `reimagine-outline-prompt.md`       | `user`   | Outline phase for Reimagine: analyze deck → output `{ plan, chapters: [...] }` JSON for user review         |
| `flow-guidance.md`                  | snippet  | Narrative-flow guidance variants (instructional/story/technical/persuasive) for the generate suffix         |
| `speaker-notes-guidance.md`         | snippet  | Speaker-notes guidance variants (add/preserve) for the generate suffix                                      |
| `visual-identity-guidance.md`       | snippet  | Visual-identity guidance variants (preserve/discard) used by the generate suffix                            |
| `remix-visual-identity-guidance.md` | snippet  | Visual-identity guidance variants (preserve/discard) used by the remix plan prompt                          |
| `images-guidance.md`                | snippet  | Vision images guidance variants (sent/not-sent) for the remix plan prompt                                   |
| `batch-pagination.md`               | snippet  | Batch pagination instructions variants (fix/generate) for `buildBatchMessages`                              |
| `creative-guidance.md`              | snippet  | Remix creative guidance text for the `{{creativeGuidance}}` placeholder                                     |
| `remix-flow-guidance.md`            | snippet  | Flow-specific restructuring guidance variants (instructional/story/technical/persuasive) for the remix plan |
| `visual-styling-note.md`            | snippet  | Visual-styling note variants consumed by the generate prompt                                                |
| `repair-message.md`                 | snippet  | Repair message template for validation failures                                                             |
| `density-budgets.md`                | snippet  | Per-area line-budget guidance variants (full/compact) for the generate and polish prompts                   |

Snippet files hold `<!-- variant: name -->` sections selected via `extractVariant` in [`ai-prompt-fragments.js`](../src/data/ai/ai-prompt-fragments.js). The JSON output format example lives directly in `system-prompt.md`.

Fragments are composed by [`AiPromptComposer`](../src/data/ai/ai-prompt-composer.js), which replaces `{{placeholders}}` with the provided substitutions. Composition is strict: a missing or unused placeholder throws instead of silently reaching the model. The `{{layoutList}}` placeholder in the system prompt is replaced with the current layout registry; `{{markdown}}` in the user prompts is replaced with the deck or slide content.

Intents are mapped to prompt fragments by [`AiIntentRegistry`](../src/data/ai/ai-intent-registry.js), and the [`AiOrchestrator`](../src/data/ai/ai-orchestrator.js) coordinates the LLM call, validation, and repair loop.

## System Prompt Rules

The system prompt (`system-prompt.md`) defines:

- **Output format**: JSON object with a `slides` array, each slide having `layout` and `content` fields
- **JSON-only output**: no explanations, markdown fences, or surrounding text
- **Area markers**: `@area-name` syntax, blank lines around markers
- **Text blocks**: `::: text-block { ... }` for styled/multi-column text. Attributes use `key=value` or `key="value"` syntax (not `key: value`). Supported: `id`, `float`, `x`, `y`, `fontSize`, `color`, `backgroundColor`, `align`, `opacity`, `z`, `rotate`, `column-count`, `markdown`, `bold`, `italic`, `underline`, `strikethrough`. Freeform CSS (`style`, `padding`, `margin`) is not supported. Set `column-count=N` or `markdown=true` to render markdown content inside a text-block; without either, content is plain escaped text.
- **Code blocks**: review and fix fenced code blocks (syntax errors, broken logic, placeholder code); restore indentation and line breaks in code collapsed to a single line; remove stray inline code markers; add language tags; split lumped code blocks from PPTX import into separate fenced blocks
- **Speaker notes**: `<!-- notes: ... -->` at the end of slide content
- **Diagrams**: `[Diagram: ...]` converted to Mermaid only for true flowcharts/hierarchies
- **Header headings**: the first heading in `@header` must be `#` (h1), not `##` or lower
- **Image handling**: preserve `<img>` tags unless the prompt says to drop; use `position: relative` with `left`/`top`/`width` for custom placement
- **Allowed layouts**: injected via `{{layoutList}}` as a per-layout list of allowed `@area` names (e.g. `two-column: @header, @main, @media, @footer`)

## enhanceSlide Intent (fix-prompt.md)

Conservative cleanup of a single slide that preserves content and slide count:

- Rejoin split code lines, add language tags
- Fix code blocks collapsed to a single line — restore proper newlines and indentation
- Remove stray backtick markers inside code blocks (e.g. `` `43` `` wrapping numbers/identifiers)
- Split lumped code blocks from PPTX import into separate fenced blocks (global system-prompt rule)
- Restore blank lines between sections
- Remove bold wrapping from headings
- Fix broken links, lists, and tables
- Remove duplicate blank lines and trailing whitespace
- Convert `[Diagram: ...]` to Mermaid where appropriate
- Fix mismatched layouts (downgrade `media-span-left`/`media-span-right`/`two-column` when no image/empty column)
- Does **not** change heading levels or add/remove slides

## Whole-Deck Modes

The whole-deck AI flow is selected in the pre-flight modal and passed to the orchestrator as `mode`:

### Polish (`polish-prompt.md`)

Refines the whole deck while preserving structure and visual identity:

- Fix formatting, links, lists, tables, code blocks, and layout mismatches
- Improve wording: concise human-facing headlines, tightened bullet points, specific statements, remove textbook-style repetition
- Pick the best layout per slide (two-column, focus, table) over defaulting to header-content
- Use tables for 2-3 item comparisons; two-column for diagrams, code, or dense content
- Handle crowded slides: move supporting detail to speaker notes and choose a clearer layout (rough budgets: `header-content` ~10-14 lines, `focus` ~4-5 lines, `two-column` ~6-10 per column, `media-span` ~8-12 lines)
- Preserve `theme:` directives and keep `background:` unless it no longer fits
- Preserve `<img>` tags; reposition with `position: relative` + `left`/`top`/`width` for custom placement
- Drop low-quality, redundant, or misplaced images
- PPTX imports: fix mismatched layouts, reposition misplaced images, tighten verbose text
- Keep the same slide count and order
- Speaker notes are preserved unless explicitly instructed to add new ones

### Remix (plan → execute)

Uses `remix-plan-prompt.md` for the planning call and `generate-prompt.md` for the execute call. The plan produces a structured `plan` array (`polish`, `rewrite`, `merge`) with per-entry `brief`, `reason`, and `title` fields. The plan is converted to a virtual deck and sent through the generate path. The `reason` field is surfaced in the AI sidebar so users can understand why each slide was polished, rewritten, or merged.

| Mode    | Creative freedom | Visual identity | Slide count | Plan guidance                                                       |
| ------- | ---------------- | --------------- | ----------- | ------------------------------------------------------------------- |
| `remix` | Moderate         | Preserved       | May change  | Reorganize for clarity; keep good slides; use `merge` thoughtfully. |

### Reimagine (outline → review → generate)

Uses a dedicated three-phase flow separate from Remix:

1. **Outline phase** — `reimagine-outline-prompt.md` asks the AI to read the deck summary (and optionally images) and propose a `{ plan, chapters: [{title, flowTag, summary, slides: [{title, intent}]}] }` JSON. The `plan` is a 1-3 sentence statement combining the core message, fresh editorial angle, and chosen narrative structure; chapters group slides into a narrative arc (3-7 chapters, each with a flow tag from a fixed vocabulary: hook, context, problem, tension, solution, evidence, comparison, example, transition, climax, cta). The prompt includes a slide-count guard targeting 70-120% of the source deck.
2. **User review** — `AiReimagineOutlineModal` shows the `plan` + chapter-grouped outline. In read-only mode, chapters are collapsible rows with colored flow badges. An "Edit" toggle reveals inputs for editing chapters and slides. The user can continue or cancel.
3. **Generate phase** — the edited outline is flattened into a virtual deck of brief-only slides (`<!-- brief: {title} — {intent} -->`) and run through `generate-prompt.md`. Phase 2 sees only the outline, not the original deck, so content is generated fresh. The generate prompt instructs the AI to pick one coherent visual theme, set `background:` and `theme:` (using `theme: dark` for dark backgrounds), place content images, and use only Mermaid for diagrams.

| Mode        | Creative freedom | Visual identity | Slide count                   | Outline guidance                                                                                                 |
| ----------- | ---------------- | --------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `reimagine` | Bold             | Not preserved   | 70-120% of source (soft warn) | Take a bold editorial approach; rethink topic, examples, notes, and visuals while keeping core intent and facts. |

### Modal Options

The pre-flight modal returns:

- `mode` — `polish`, `remix`, or `reimagine`
- `flow` — `instructional`, `story`, `technical`, `persuasive` (sets the narrative genre for Remix/Reimagine; the AI picks storytelling techniques within that genre; hidden for Polish)
- `addSpeakerNotes` — add notes to slides that don't have them
- `includeImages` — send content images to the plan AI (Remix and Reimagine only, only when images exist)
- `preserveVisualIdentity` — keep theme, colors, backgrounds (Remix only; hidden for Reimagine, which always discards visual identity)

### Vision-Augmented Planning

When the user enables "Send slide images to AI" in the generate modal (visible for Remix and Reimagine), the plan/outline phase sends raw content images alongside the deck summary:

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
- Internal setting `media-full-bleed: true` — records full-bleed intent on resized media-span grids; treated as a layout-related directive, not slide content
- Content areas are marked with `@area-name` (e.g., `@header`, `@main`, `@media`, `@sidebar`)
- Content before the first `@area` flows into `@main`

### Built-in Layouts

| Layout             | Areas                                                 | Use Case                        |
| ------------------ | ----------------------------------------------------- | ------------------------------- |
| `title-slide`      | `@title`, `@footer`                                   | Title/cover slide               |
| `header-content`   | `@header`, `@main`, `@footer`                         | Standard content slide          |
| `focus`            | `@header`, `@main`, `@footer`                         | Centered, minimal header/footer |
| `two-column`       | `@header`, `@main`, `@media`, `@footer`               | Two equal columns               |
| `left-heavy`       | `@header`, `@main`, `@media`, `@footer`               | Left column 2x wider            |
| `right-heavy`      | `@header`, `@main`, `@media`, `@footer`               | Right column 2x wider           |
| `three-column`     | `@header`, `@main`, `@media`, `@secondary`, `@footer` | Three equal columns             |
| `media-span-left`  | `@header`, `@main`, `@media`, `@footer`               | Media spans full left height    |
| `media-span-right` | `@header`, `@main`, `@media`, `@footer`               | Media spans full right height   |
| `full-image`       | `@main`                                               | Full-bleed image, no text       |

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
- **Text blocks**: `::: text-block { ... }` for styled, positioned, or multi-column text. Attributes use `key=value` or `key="value"` syntax (not `key: value`). Supported: `id`, `float`, `x`, `y`, `fontSize`, `color`, `backgroundColor`, `align`, `opacity`, `z`, `rotate`, `column-count`, `markdown`, `bold`, `italic`, `underline`, `strikethrough`. Freeform CSS (`style`, `padding`, `margin`) is not supported. Use `column-count=N` to flow long lists across N columns, or `markdown=true` to render markdown in a single styled block. Without either, content is treated as plain escaped text.

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

1. Check all prompt files for consistency.
2. Run `npm test` — the AI hygiene tests (`ai-prompt-hygiene.test.js`) check that composed prompts contain no dangling `{{placeholders}}` and that the layout list stays in sync with `src/data/layout-data.js`.
3. Snapshot tests (`ai-prompt-snapshots.test.js`) pin the composed system + user messages; update the snapshot deliberately and review the diff.
4. Count strong negative directives (NEVER, Do NOT) — aim for <=5 per prompt.
5. Keep both layout lists in sync (system prompt `{{layoutList}}` and this doc).
6. Update this document and `docs/example/slides.md` to reflect changes.
