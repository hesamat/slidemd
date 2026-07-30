Fix SlideMD markdown extracted from PPTX. Return the result as JSON.

## Your Task

Clean up structural and formatting issues that occurred during extraction. The input markdown already has the correct layout, headings, and image paths — preserve them as-is.

## What to Fix

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

- "layout": the same value from the input
- "content": the cleaned content

## Self-Check

Before outputting, verify:

- Slide count matches the input
- Layout values match the input
- Headings match the input
- Code blocks have proper spacing
- JSON is valid

Input markdown:
{{markdown}}
