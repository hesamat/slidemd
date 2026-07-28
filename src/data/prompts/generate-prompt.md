Create an inspired SlideMD presentation from this content and return as JSON.

Your goal is to go ABOVE AND BEYOND the original slides. Do not just reorganize - redesign, enhance, and elevate.

## Creative Guidelines

- Reorganize for better flow, pacing, and storytelling
- Break up dense slides into focused, digestible slides (one idea per slide)
- Add transition slides between major sections to improve narrative flow
- Create summary or key takeaway slides at the end of sections
- Enhance bullet points with better phrasing, stronger verbs, and clearer structure
- Convert ALL [Diagram: ...] to Mermaid code blocks with varied shapes
- Prefer two-column for slides with diagrams, code examples, or dense content (>13 bullet points). Use header-content for simple text slides
- Use media-span ONLY for slides with actual images (e.g. img tags). Never use media-span for code or diagrams
- Add speaker notes to key slides using: <!-- notes: Your note text here -->
- Improve the title slide to be more visually impactful (ONLY the first slide — title-slide has @title and @footer only, NO @header or @main)
- Feel free to invent custom layouts using CSS grid if none of the built-in layouts fit. When doing so, use @main for the primary content area for best compatibility with the renderer

## Custom Layouts

When none of the built-in layouts (header-content, two-column, three-column, media-span) fit your content, you can define a custom layout using CSS grid. Add a `gridTemplate` directive in the slide's frontmatter.

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

## Content Strategy

- Keep all substantive content but reorganize for it for maximum clarity
- Split overloaded slides - if a slide has more than ~10 bullet points or ~15 lines of code, split it
- **Do NOT create sparse slides** — a slide with only 2 bullet points is too thin. Combine related micro-content into cohesive slides, or expand with more detail, examples, or context
- If comparing 2-3 items (e.g. storage types, algorithms, data structures), use a **table** instead of bullet points across columns. Tables are clearer for side-by-side comparison
- If a slide has a Mermaid diagram + any text content, use two-column (diagram in @media, text in @main)
- NEVER use media-span unless the slide contains an img tag. Code blocks and diagrams go in two-column or header-content
- Combine related micro-content into cohesive slides
- Add section dividers or overview slides when transitioning between topics
- Every slide MUST have meaningful content in the appropriate area markers
- **title-slide is ONLY for the opening/intro slide** — it has @title and @footer, no @main. Any slide with bullet points, lists, or body content must use header-content or two-column instead
- **three-column area markers**: @main (left), @media (center), @secondary (right). NEVER use @column1, @column2, @column3 — they are not valid

## Formatting Rules (STRICT)

- Area markers (@header, @main, @media, @footer) MUST have a blank line BEFORE and AFTER them
- Example: "@header\n## Title\n\n@main\n\n- Point 1\n- Point 2" (note double newline before @main)
- Code blocks MUST have a blank line before and after the triple backticks
- Lists MUST have a blank line before and after them
- Tables MUST have a blank line before and after them
- Headers inside @main MUST have a blank line before them
- Speaker notes (<!-- notes: ... -->) go at the very end, with a blank line before them
- Do NOT use @notes - it is not a valid area marker. Use <!-- notes: ... --> instead

## Header Rules

- Title slide: # for main title, ## for subtitle/author
- All other slides: ## for slide titles in @header
- Inside @main: NEVER use ## for sub-sections. Use ### only if truly needed
- Remove bold wrapping from headers

## Images (IMPORTANT)

- Do NOT assume what an image shows based on its filename or position
- If you are unsure what an image is about, DELETE the img tag
- Only keep images if you are confident about what they depict and they add value

## Mermaid Diagrams

- Use flowchart LR (horizontal) for single-column layouts (header-content, media-span)
- Use flowchart TD (vertical) for multi-column layouts (two-column, three-column)
- Use varied shapes and arrow labels. NOT just linear chains.

Input markdown:
{{markdown}}
