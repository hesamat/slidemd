# AI Post-Processing for PPTX Import

When importing a PPTX file, SlideMD can optionally post-process the result using AI via OpenRouter. This is configured in the Import PowerPoint dialog.

## Setup

1. Open **Settings** from the main menu
2. Enter your OpenRouter API key (get one at [openrouter.ai/keys](https://openrouter.ai/keys))
3. Select a model (default: `deepseek/deepseek-v4-flash`)
4. Optionally enable **Extended Thinking** for better results (only available for models that support it)

## Modes

### Fix Issues

A conservative mode that cleans up common PPTX extraction problems:

- Recovers code block newlines lost during extraction
- Fixes broken links and code formatting
- Normalizes header levels (# for title slides, ## for all others)
- Removes bold wrapping from headers
- Fixes two-column slides with empty right columns
- Converts `[Diagram: ...]` markers to Mermaid (for true flowcharts) or bullet points (for simple lists)

**What it does NOT do:** Does not restructure slides, invent content, or change layouts that already work.

### AI Inspiration

A full redesign mode that reorganizes and improves the presentation:

- Reorganizes slides for better flow and pacing
- Converts diagrams to Mermaid code blocks (where they represent true flowcharts/processes)
- Improves formatting, structure, and layout
- Adds speaker notes to key slides
- Keeps all substantive content from the original
- Deletes images the AI is unsure about

## Formatting Rules (AI Output)

The AI follows these strict formatting rules:

### Area Markers

- `@header`, `@main`, `@media`, `@footer` MUST have a blank line BEFORE and AFTER them
- Example: `@header\n## Title\n\n@main\n\n- Point 1`

### Header Hierarchy

- Title slide: `#` for main title, `##` for subtitle
- All other slides: `##` for slide titles in `@header`
- Inside `@main`: never use `##`, use `###` only if truly needed

### Speaker Notes

- Use HTML comments: `<!-- notes: Your note text here -->`
- Notes go at the very end of the slide content, after all area markers
- Do NOT use `@notes` — it is not a valid area marker

### Mermaid Diagrams

- Single-column layouts (header-content, media-span): use `flowchart LR` (horizontal)
- Multi-column layouts (two-column, three-column): use `flowchart TD` (vertical)
- Use varied shapes and arrow labels

### Layout Options

Available layouts: `title-slide`, `focus`, `header-content`, `two-column`, `three-column`, `media-span`, `left-heavy`, `right-heavy`. Custom CSS grid layouts are supported via the `gridTemplate` directive.

- `focus` layout centers content both horizontally and vertically — ideal for section dividers, key quotes, code blocks, and agenda slides
- `title-slide` uses `@title` (not `@header`) and has no `@main` area
- Multi-column layouts require `@header`, `@main`, and the appropriate area markers (`@media`, `@secondary`)

### Code Blocks

- Must have a blank line before and after the triple backticks
- Include language tags when possible

## Prompts

The full prompts used by the AI are defined in separate files under `src/data/prompts/`:

- **System prompt** (`system-prompt.md`): SlideMD syntax reference, formatting rules, area markers, layout decision rules
- **Fix prompt** (`fix-prompt.md`): Conservative formatting fixes — preserves existing content, does not invent
- **Generate prompt** (`generate-prompt.md`): Full redesign with layout strategy, image handling, notes syntax, custom grid layouts
