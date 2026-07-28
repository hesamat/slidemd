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
- Converts `[Diagram: ...]` markers to Mermaid code blocks

**What it does NOT do:** Does not restructure slides, invent content, or change layouts that already work.

### AI Inspiration

A full redesign mode that reorganizes and improves the presentation:

- Reorganizes slides for better flow and pacing
- Converts all diagram markers to Mermaid code blocks
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

### Code Blocks

- Must have a blank line before and after the triple backticks
- Include language tags when possible

## Prompts

The full prompts used by the AI are defined in `src/data/ai-enhancer.js`:

- **System prompt**: SlideMD syntax reference, formatting rules, area markers
- **Fix prompt**: Conservative formatting fixes
- **Generate prompt**: Full redesign with layout rules, image handling, notes syntax
