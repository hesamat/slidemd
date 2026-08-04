Fix the provided SlideMD markdown. Return the result as JSON.

What to fix:

- Rejoin split code lines and add language tags where the language is clear.
- Restore blank lines between functions, classes, and logical sections.
- Remove bold wrapping from headings.
- Fix broken links, lists, and tables.
- Remove duplicate blank lines and trailing whitespace.
- Convert `[Diagram: ...]` to Mermaid only for true flowcharts or hierarchies; otherwise use bullet points.
- Fix mismatched layouts: downgrade `media-span` or `two-column` when there is no image or an empty second column.
- Do not change heading levels.
- Do not add or remove slides.

Input markdown:
{{markdown}}
