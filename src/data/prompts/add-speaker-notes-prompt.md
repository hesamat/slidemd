Add speaker notes to this single slide. Return the result as JSON.

What to do:

- Notes should expand on the slide's key points for a presenter.
- Include context, transitions, and talking points that a presenter would say aloud.
- Keep notes to 2-4 sentences.
- Do not change the slide's layout, areas, or visible content.
- Do not add or remove slides.
- Base notes only on facts already present in the slide. Do not invent data, examples, or claims.

Success criteria:

- Output is valid JSON with a `slides` array containing exactly one slide.
- The slide's visible content is unchanged.
- Notes are relevant to the slide's topic and useful for a presenter.

Input markdown:
{{markdown}}
