Fix this SlideMD markdown and return as JSON.

## Core Principle: Be Conservative

Fix formatting and structural problems. Do NOT restructure slides that already work.
Do NOT invent content (headers, text, lists) that doesn't exist in the original.
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
- Convert [Diagram: ...] markers to Mermaid code blocks

## What NOT to Do

- Do NOT change a slide's layout unless it is truly broken (e.g. two-column with empty right column)
- Do NOT add @header to a slide that only has @main - that's valid
- Do NOT add content that doesn't exist in the original (no fake headers, no invented lists)
- Do NOT split or merge slides
- Do NOT change image references or paths
- Do NOT modify content inside multi-column lists (HTML divs with multi-column-list class) - preserve the HTML structure and list content as-is
- Do NOT convert multi-column divs to plain markdown lists - keep the HTML div structure intact
- Do NOT renumber list items or change the order of list items

## Slide Structure

- A slide with @main only is valid - leave it alone
- A slide with @header and @main is valid - leave it alone
- Two-column with empty @media -> change to header-content (remove the empty @media)
- Media-span without @media -> that's broken, add @media or change layout

Input markdown:
{{markdown}}
