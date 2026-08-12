Polish this SlideMD presentation. Return the result as JSON.

What to do:

- Fix formatting, links, lists, tables, code blocks, and layout mismatches.
- Review code blocks and fix issues beyond indentation: correct syntax errors, broken logic, nonsensical code, and placeholders.
- Rejoin split code lines and add language tags where the language is clear.
- Split lumped code blocks: PPTX import cannot detect separate code snippets on a slide and often merges them into one fenced block. When a single fenced block contains two or more distinct code snippets (different languages, unrelated examples, or separated by comments/blank lines that signal a boundary), split them into separate fenced blocks with their own language tags.
- Restore blank lines between functions, classes, and logical sections.
- Remove bold wrapping from headings.
- Remove duplicate blank lines and trailing whitespace.
- Fix mismatched layouts: downgrade `media-span-left`, `media-span-right`, or `two-column` when there is no image or an empty second column.
- Improve wording: make headlines concise and human-facing, tighten bullet points, replace vague text with specific statements, and remove textbook-style repetition. Do not add content indiscriminately — tighten, do not inflate.
- Pick the best layout for each slide's content; use `two-column`, `focus`, or `table` layouts when they clarify the material.
- Use tables for 2-3 item comparisons.
- Preserve each slide's `theme:` and `background:` directives and the existing color scheme. Do not add new `theme:`/`background:` values, colored text, or `color`/`backgroundColor` attributes.
- Drop images that are low quality, redundant, or add no value, and keep the rest.
- Wrap multi-line code or complex examples in fenced code blocks with the appropriate language tag.
- If the input looks like a PPTX import (mismatched layouts, images in wrong areas, verbose text boxes), fix the layout to match the actual content, reposition images where they make sense, and tighten the text.
- Handle crowded slides: when a slide has too much content for its layout, move supporting detail to speaker notes and choose a clearer layout. Do not change the slide sequence — keep the same slide count and order.
- Apply all of the above changes; do not return the input unchanged or leave formatting problems unfixed.

Constraints:

- Keep the same slide count and order.
- Keep the same overall narrative flow.
- Preserve existing speaker notes unless asked to add new ones. Do not add new notes when the preserve mode is active.
- Preserve the existing `theme:`, `background:`, and color scheme. Do not add new `theme:`/`background:` values, colored text, or `color`/`backgroundColor` attributes.

Success criteria:

- Each slide has a layout and non-empty content.
- Headers use the correct hierarchy.
- Existing `theme:`, `background:`, and color scheme are preserved.
- The output is visibly different from the input (better formatting, wording, or layout).
- All `[Diagram:]` markers are addressed.
- Speaker notes are preserved and placed at the end of the slide content.
- No slide exceeds its layout's density budget; crowded slides have been trimmed or moved to notes.

Input markdown:
{{markdown}}
