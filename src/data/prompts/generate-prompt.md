Create an inspired SlideMD presentation from this content. Return as JSON.

Content strategy:

- Keep all substantive content but reorganize for clarity and flow.
- Split overloaded slides (>10 bullets or >15 code lines) into focused slides.
- Combine sparse slides into richer ones.
- Use tables for 2-3 item comparisons.
- Use two-column for diagrams, code, or dense content.
- Use `media-span` only for actual `<img>` tags.
- Use `full-image` only for a full-bleed image with no text.
- `title-slide` is only for the first slide: it uses `@title` and `@footer`, no `@main`.
- `three-column` uses `@main`, `@media`, `@secondary`. Never use `@column1`, `@column2`, or `@column3`.
- Use `header-content` or `focus` for simple text. Use `focus` only for centered content with at most 3 element types.
- Add speaker notes where helpful: `<!-- notes: ... -->`.
- Use `theme: light` for consistent light mode.
- Do not inflate the slide count.

Success criteria:

- Every slide has an appropriate layout with valid area markers.
- Headers use the correct hierarchy.
- Code blocks have proper spacing.
- All `[Diagram:]` markers are addressed.
- The JSON is valid and parseable.

Input markdown:
{{markdown}}
