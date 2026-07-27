# AI Prompt Templates for PPTX Import

These prompts are used by `src/data/ai-enhancer.js` to post-process PPTX-imported markdown.

The full SlideMD syntax reference is in [prompt-template.md](prompt-template.md).

## System Prompt (shared)

The system prompt includes the SlideMD syntax reference from `prompt-template.md` (sections: Basic Structure, Layout Patterns, Content Areas, Slide Options, Built-in Features, Content Formatting Guidelines). See `buildSystemPrompt()` in `ai-enhancer.js` for the full text.

## Mode: Fix Issues

Post-processes rule-based markdown to fix common extraction issues:

1. Recover code block newlines lost during extraction
2. Fix horizontal adjacency (image+text → two-column layout)
3. Remove decorative/template/logo images
4. Fix formatting: spacing, lists, tables
5. Ensure every slide has a `layout:` directive
6. Convert `[Diagram: ...]` markers into Mermaid code blocks

## Mode: Generate Inspired Deck

Creates a new presentation from the imported content:

1. Reorganize slides for better flow and pacing
2. Add or remove slides as needed
3. Convert ALL `[Diagram: ...]` markers into Mermaid code blocks
4. Improve content structure, formatting, and layout
5. Suggest better visual hierarchy
6. Use varied layouts
7. Add speaker notes to key slides
8. Keep all substantive content from the original

## Diagram Conversion

Diagram text markers (`[Diagram: Item 1, Item 2, Item 3]`) are converted to Mermaid:

- `flowchart TD` — hierarchical/top-down structures
- `flowchart LR` — sequential/process flows
- `graph TD` / `graph LR` — relationship diagrams
- Each text item becomes a labeled node
- Connect nodes logically based on content
- Add `classDef` styling when appropriate
