Fix this SlideMD markdown and return as JSON.

## Core Principles

Fix formatting, structural, and content problems within the existing layout structure. Fix code blocks, lists, headers, and formatting that clearly lost structure during extraction. Only change a layout or area markers when the slide is in a genuinely broken state (e.g. media-span with no @media, two-column with an empty @media that has no content).

Use only content present in the input markdown. Do NOT invent new content.

## CRITICAL: Slide Count and Order

- Return EXACTLY the same number of slides as the input
- Return slides in the SAME ORDER as the input
- Each slide in the output corresponds 1:1 to a slide in the input (separated by ---)
- Do NOT add, remove, merge, or reorder slides

## What to Fix

### Headers & Text

- Header levels: # for title-slide only, ## for all other slide titles
- Remove bold wrapping from headers (e.g. "### AGENDA" -> "## AGENDA")
- Fix broken links (URLs split across lines)
- Fix broken list formatting (missing dashes, wrong indentation)
- Fix tables with misaligned columns or missing header rows
- Remove duplicate blank lines and trailing whitespace

### Code Blocks (IMPORTANT)

- **Split merged code blocks**: Multiple functions, classes, or code snippets are often concatenated without proper separation. Add blank lines between function definitions, class methods, and logical code sections
- **Fix missing newlines**: Code lines that are jammed together (e.g. `func1()func2()`) should be split onto separate lines
- **Recover lost newlines**: During PPTX extraction, code block newlines are often lost — restore them by detecting code structure (function definitions, indentation patterns, keyword boundaries)
- **Fix language tags**: Add or correct missing code language identifiers
- **Fix indentation**: Restore proper indentation where it was lost during extraction
- **Remove extra backticks** or stray fence markers

### Diagrams

- Convert [Diagram: ...] markers to Mermaid ONLY when the content represents a true flowchart or process. For simple lists, use bullet points instead

## What to Preserve

- Preserve custom `gridTemplate` directives on slides — these are intentional CSS grid layouts
- Preserve `focus` layout — it is a valid content-first layout with centered content
- Preserve multi-column list divs (class "multi-column-list") — these use CSS columns for compact lists
- Preserve all image references and paths as-is
- Preserve all area markers (@header, @main, @media, @secondary, @sidebar, @footer) exactly as they appear in the input

## Slide Structure

- A slide with @main only is valid - leave it alone
- A slide with @header and @main is valid - leave it alone
- Two-column with an empty @media (no content at all) -> change to header-content and remove the empty @media. If @media has any content, keep the two-column layout
- Media-span without @media -> that's broken, add @media or change layout

## Success Criteria

Before outputting, verify:

- Every slide has non-empty content in at least one area marker
- Headers follow the correct hierarchy for the layout
- Code blocks have proper spacing — functions/classes separated by blank lines, no jammed-together lines
- Language tags are present on code blocks where the language is clear
- All [Diagram:] markers are addressed — converted to Mermaid for true flowcharts only, left as bullet points otherwise. Do NOT invent diagrams where none existed
- The JSON is valid and parseable

Input markdown:
{{markdown}}
