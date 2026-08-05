Convert the content of this single slide into a metric-cards layout. Return the result as JSON.

What to do:

- Extract key numbers, statistics, or quantifiable data from the slide.
- Present each metric as a large number with a short label.
- Use the `metric-cards` layout if available; otherwise use `header-content`.
- Place metrics in the `@main` area as a grid of metric cards.
- Keep a concise header that frames the metrics.
- If the slide has no quantifiable data, extract the most important concepts and present them as labeled cards.
- Do not add or remove slides.

Success criteria:

- Output is valid JSON with a `slides` array containing exactly one slide.
- The slide uses a layout that supports a card grid.
- Each metric has a large number and a short label.
- No information is fabricated.

Input markdown:
{{markdown}}
