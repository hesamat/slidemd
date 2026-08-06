Polish this SlideMD presentation. Return the result as JSON.

What to do:

- Fix formatting, links, lists, tables, code blocks, and layout mismatches.
- Rejoin split code lines and add language tags where the language is clear.
- Restore blank lines between functions, classes, and logical sections.
- Remove bold wrapping from headings.
- Remove duplicate blank lines and trailing whitespace.
- Fix mismatched layouts: downgrade `media-span` or `two-column` when there is no image or an empty second column.
- Improve wording: make headers concise, tighten bullet points, replace vague text with specific statements.
- Pick the best layout for each slide's content; use `two-column`, `focus`, or `table` layouts when they clarify the material.
- Use tables for 2-3 item comparisons.
- Preserve each slide's `theme:` directive. Keep `background:` directives unless they no longer fit the restructured content.
- Drop images that are low quality, redundant, or add no value, and keep the rest.
- If the input looks like a PPTX import (mismatched layouts, images in wrong areas, verbose text boxes), fix the layout to match the actual content, reposition images where they make sense, and tighten the text.

Constraints:

- Keep the same slide count and order.
- Keep the same overall narrative flow.
- Preserve existing speaker notes unless asked to add new ones.
- Preserve the overall visual identity (theme, colors, backgrounds).

Success criteria:

- Each slide has a layout and non-empty content.
- Headers use the correct hierarchy.
- All `[Diagram:]` markers are addressed.
- Speaker notes are preserved and placed at the end of the slide content.

Input markdown:
{{markdown}}
