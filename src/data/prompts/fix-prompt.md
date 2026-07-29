Fix this SlideMD markdown and return as JSON.

## Core Principle: Be Conservative

Fix formatting and structural problems. Do NOT restructure slides that already work.
Use only content present in the input markdown.
Do NOT change a layout unless it is genuinely broken.

## What to Fix

- Header levels: # for title-slide only, ## for all other slide titles
- Remove bold wrapping from headers (e.g. "### AGENDA" -> "## AGENDA")
- Recover code block newlines lost during extraction
- Fix broken links (URLs split across lines)
- Fix code with extra backticks, missing language tags, or wrong indentation
- Fix broken list formatting (missing dashes, wrong indentation)
- Fix tables with misaligned columns or missing header rows
- Remove duplicate blank lines and trailing whitespace
- Convert [Diagram: ...] markers to Mermaid ONLY when the content represents a true flowchart or process. For simple lists, use bullet points instead

## What to Preserve

- Preserve custom `gridTemplate` directives on slides — these are intentional CSS grid layouts
- Preserve `focus` layout — it is a valid content-first layout with centered content
- Preserve multi-column list divs (class "multi-column-list") — these use CSS columns for compact lists
- Preserve all image references and paths as-is

## Slide Structure

- A slide with @main only is valid - leave it alone
- A slide with @header and @main is valid - leave it alone
- Two-column with empty @media -> change to header-content (remove the empty @media)
- Media-span without @media -> that's broken, add @media or change layout

## Success Criteria

Before outputting, verify:

- Every slide has non-empty content in at least one area marker
- Headers follow the correct hierarchy for the layout
- All [Diagram:] markers are addressed — converted to Mermaid for true flowcharts only, left as bullet points otherwise. Do NOT invent diagrams where none existed
- The JSON is valid and parseable

Input markdown:
{{markdown}}
