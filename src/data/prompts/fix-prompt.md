Fix SlideMD markdown extracted from PPTX. Return the result as JSON.

## Your Task

Clean up structural and formatting issues that occurred during extraction. Preserve the input layout when it's appropriate for the content, but fix layouts when they're clearly broken or mismatched.

## What to Fix

### Layouts

Preserve the input layout unless it's broken. Fix layouts when:

- `media-span` is used but there are no images — downgrade to `header-content`
- `two-column` has an empty `@media` column — downgrade to `header-content`
- Content clearly doesn't fit the layout (e.g., a table crammed into a single-column layout that should be two-column)
- The layout contradicts the content structure

When changing a layout, choose the simplest layout that fits the content.

### Code Blocks

- Rejoin code lines that were split across extraction boundaries
- Restore blank lines between functions, classes, and logical sections
- Add language tags where the code language is clear
- Fix indentation lost during extraction
- Remove extra backticks or stray fence markers

### Text Formatting

- Remove bold wrapping from headings (e.g. "**AGENDA**" → "AGENDA")
- Fix broken links, lists, and tables
- Remove duplicate blank lines and trailing whitespace

### Diagrams

- Convert [Diagram: ...] markers to Mermaid only when they represent true flowcharts or processes
- Use bullet points for simple lists

## Output Format

Return one JSON object per slide with:

- "layout": the appropriate layout for the content
- "content": the cleaned content

## Self-Check

Before outputting, verify:

- Slide count matches the input
- Each layout fits its content
- Headings match the input
- Code blocks have proper spacing
- JSON is valid

Input markdown:
{{markdown}}
