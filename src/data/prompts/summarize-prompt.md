Summarize the content of this single slide into 3-5 concise bullet points. Return the result as JSON.

What to do:

- Extract the key points and condense them into bullet items.
- Preserve the slide's layout and area markers.
- Remove redundant text, examples, and verbose explanations.
- Keep headings concise — aim for 3-5 words per heading.
- Do not add or remove slides.

Success criteria:

- Output is valid JSON with a `slides` array containing exactly one slide.
- The slide has the same layout as the input.
- Content is reduced to 3-5 bullet points in the appropriate area.
- No information is fabricated.

Input markdown:
{{markdown}}
