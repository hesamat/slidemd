Create an inspired SlideMD presentation from this content and return as JSON.

Your goal is to go ABOVE AND BEYOND the original slides. Do not just reorganize - redesign, enhance, and elevate.

## Content Strategy

- Keep all substantive content but reorganize it for maximum clarity
- Split overloaded slides - if a slide has more than ~10 bullet points or ~15 lines of code, split it
- **Split merged code blocks**: Multiple functions, classes, or code snippets that were jammed together during extraction must be separated. Add blank lines between function definitions, class methods, and logical code sections. A block like `def a():\n  pass\ndef b():\n  pass` should become `def a():\n  pass\n\ndef b():\n  pass`
- **Restore code structure**: Fix indentation, add missing newlines, and ensure each logical code unit stands on its own
- Preserve roughly the same number of slides as the input. At most reduce by 20% through merging truly redundant slides. Never inflate the slide count — the original structure was intentional
- Combine sparse slides into richer ones — a slide with only 2 bullet points is too thin. Combine related micro-content into cohesive slides, or expand with more detail, examples, or context
- If comparing 2-3 items (e.g. storage types, algorithms, data structures), use a **table** instead of bullet points across columns. Tables are clearer for side-by-side comparison
- If a slide has a Mermaid diagram + any text content, use two-column (diagram in @media, text in @main)
- Use media-span only for slides with actual img tags. Code blocks and diagrams go in two-column, focus, or header-content
- Combine related micro-content into cohesive slides
- Add section dividers or overview slides when transitioning between topics
- Every slide MUST have meaningful content in the appropriate area markers
- **title-slide is ONLY for the opening/intro slide** — it has @title and @footer, no @main. Any slide with bullet points, lists, or body content must use focus, header-content, or two-column instead
- **three-column area markers**: @main (left), @media (center), @secondary (right). NEVER use @column1, @column2, @column3 — they are not valid
- Simple agenda or overview slides with multiple bullet groups: keep them in a single @main area using header-content. Do NOT split into two-column or three-column.

## Creative Guidelines

- Reorganize for better flow, pacing, and storytelling
- Always use `theme: light` for all slides to ensure consistent light-mode appearance
- Break up dense slides into focused, digestible slides (one idea per slide)
- Add transition slides between major sections to improve narrative flow
- Create summary or key takeaway slides at the end of sections
- Enhance bullet points with better phrasing, stronger verbs, and clearer structure
- Convert [Diagram: ...] to Mermaid ONLY when the content represents a true flowchart, hierarchy, or process with clear relationships. For simple lists or flat groupings, use bullet points instead
- **NEVER use flowchart LR in multi-column layouts** — always use flowchart TD (vertical) in two-column/three-column. Max 5 nodes in multi-column, max 8 in single-column
- Prefer two-column for slides with diagrams, code examples, or dense content (>13 bullet points). Use header-content or focus for simple text slides
- Use `focus` layout ONLY for centered content with at most 3 distinct element types (e.g. heading + list, heading + code + blockquote). Ideal for section dividers, key quotes, code blocks, and agenda slides. Do NOT use focus when mixing 4+ element types — use header-content instead
- Use media-span ONLY for slides with actual images (e.g. img tags). Never use media-span for code or diagrams
- Add speaker notes to key slides using: <!-- notes: Your note text here -->
- Improve the title slide to be more visually impactful (ONLY the first slide — title-slide has @title and @footer only, NO @header or @main)
- Feel free to invent custom layouts using CSS grid if none of the built-in layouts fit. When doing so, use @main for the primary content area for best compatibility with the renderer

## Custom Layouts

When none of the built-in layouts fit your content, you can define a custom layout using CSS grid. Add a `gridTemplate` directive in the slide's frontmatter. The standard built-in layouts are: header-content, two-column, three-column, media-span, left-heavy, right-heavy, focus.

Rules for custom layouts:

- Always use @main for the primary/largest content area
- Use @media, @secondary, @sidebar for additional areas
- The gridTemplate value is a CSS grid-template-areas string
- Column sizes follow the areas string with / notation

Example — a 2x2 grid with a wide header:

```
layout: custom-2x2
gridTemplate: "header header" "main media" "secondary sidebar" / 1fr 1fr

@header
## Comparison

@main
### Left

Content here

@media
### Right

Content here

@secondary
### Bottom Left

Details

@sidebar
### Bottom Right

Details
```

## Images (IMPORTANT)

- Do NOT assume what an image shows based on its filename or position
- If you are unsure what an image is about, DELETE the img tag
- Only keep images if you are confident about what they depict and they add value

## Success Criteria

Before outputting, verify:

- Every slide has non-empty content in at least one area marker
- Headers follow the correct hierarchy for the layout
- Code blocks have proper spacing — functions/classes separated by blank lines, no jammed-together lines
- All [Diagram:] markers are addressed — converted to Mermaid for true flowcharts, or replaced with bullet points for simple lists
- Slides use a variety of appropriate layouts, not the same one repeated
- The JSON is valid and parseable

Input markdown:
{{markdown}}
