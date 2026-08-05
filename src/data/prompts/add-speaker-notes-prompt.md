Add speaker notes to this single slide. Return the result as JSON.

What to do:

- Add speaker notes as an HTML comment at the end of the slide content: `<!-- notes: ... -->`.
- Notes should expand on the slide's key points for a presenter.
- Include context, transitions, and talking points that a presenter would say aloud.
- Keep notes to 2-4 sentences.
- Do not change the slide's layout, areas, or visible content.
- Do not add or remove slides.

Success criteria:

- Output is valid JSON with a `slides` array containing exactly one slide.
- The slide's visible content is unchanged.
- Speaker notes are present as `<!-- notes: ... -->` at the end of the content.
- Notes are relevant to the slide's topic and useful for a presenter.

Input markdown:
{{markdown}}
