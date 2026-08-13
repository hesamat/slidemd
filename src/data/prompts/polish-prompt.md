Polish this SlideMD presentation. Return the result as JSON.

What to do:

- Fix formatting, links, lists, tables, code blocks, and layout mismatches.
- Review code blocks and fix issues beyond indentation: correct syntax errors, broken logic, nonsensical code, and placeholders.
- Rejoin split code lines and add language tags where the language is clear.
- Restore blank lines between functions, classes, and logical sections.
- Remove bold wrapping from headings.
- Remove duplicate blank lines and trailing whitespace.
- Fix mismatched layouts: downgrade `media-span-left`, `media-span-right`, or `two-column` when there is no image or an empty second column.
- Improve wording: make headlines concise and human-facing, tighten bullet points, replace vague text with specific statements, and remove textbook-style repetition. Tighten, do not inflate.
- Pick the best layout for each slide's content; use `two-column`, `focus`, or `table` layouts when they clarify the material.
- Use tables for 2-3 item comparisons.
- Preserve each slide's `theme:` and `background:` directives and the existing color scheme.
- Drop images that are low quality, redundant, or add no value, and keep the rest.
- Wrap multi-line code or complex examples in fenced code blocks with the appropriate language tag.
- If the input looks like a PPTX import (mismatched layouts, images in wrong areas, verbose text boxes), fix the layout to match the actual content, reposition images where they make sense, and tighten the text.
- Handle crowded slides: when a slide has too much content for its layout, relocate the overflow to speaker notes and choose a clearer layout — do not delete unique content to fit the budget. For dense tables, keep the most essential rows on the slide and move the rest to speaker notes as a reference list. {{densityBudgets}}
- Apply all of the above changes; do not return the input unchanged or leave formatting problems unfixed.

Constraints:

- Keep the same slide count and order.
- Keep the same overall narrative flow.
- Do not drop unique informational content (facts, table rows, examples, code). Tightening wording and removing redundancy are fine; relocating overflow to speaker notes is fine; deleting unique material to fit a density budget is not.
- Preserve existing speaker notes unless explicitly instructed to add new ones.
- Preserve the existing `theme:`, `background:`, and color scheme. Do not add new `theme:`/`background:` values, colored text, or `color`/`backgroundColor` attributes.

Success criteria:

- Each slide has a layout and non-empty content.
- Headers use the correct hierarchy.
- Existing `theme:`, `background:`, and color scheme are preserved.
- The output is visibly different from the input (better formatting, wording, or layout).
- All `[Diagram:]` markers are addressed.
- Speaker notes are preserved and placed at the end of the slide content.
- No slide exceeds its layout's density budget; overflow has been relocated to speaker notes, not deleted.

Input markdown:
{{markdown}}
