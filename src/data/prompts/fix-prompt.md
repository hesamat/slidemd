Fix the provided SlideMD markdown. Return the result as JSON.

What to fix:

- Rejoin split code lines and add language tags where the language is clear.
- Restore blank lines between functions, classes, and logical sections.
- Remove bold wrapping from headings.
- Fix broken links, lists, and tables.
- Remove duplicate blank lines and trailing whitespace.
- Fix mismatched layouts: downgrade `media-span` or `two-column` when there is no image or an empty second column.
- Do not change heading levels.
- Do not add or remove slides.

Success criteria:

- Output is valid JSON with a `slides` array.
- Each slide has a layout and non-empty content.
- Speaker notes are preserved and placed at the end of the slide content.
- No raw `<div style="...">` blocks; use `::: text-block { ... }` for custom styling.

Input markdown:
{{markdown}}
