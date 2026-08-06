Analyze this deck and produce a restructuring plan. Return the result as JSON.

Output format:

```json
{
  "plan": [
    {
      "action": "keep",
      "source": [0],
      "brief": "",
      "title": "Introduction"
    },
    {
      "action": "rewrite",
      "source": [2],
      "brief": "Make this slide more concise and use a two-column layout",
      "title": "Roadmap"
    },
    {
      "action": "merge",
      "source": [3, 4],
      "brief": "Combine these two thin slides into a single comparison slide",
      "title": "Comparison"
    }
  ]
}
```

Rules:

- Return only valid JSON. No explanations, markdown fences, or surrounding text.
- `action` must be one of: `keep`, `rewrite`, `merge`.
  - `keep` — the slide is already good; copy it as-is. `brief` should be empty.
  - `rewrite` — rework one slide's content. `source` must have exactly 1 index.
  - `merge` — combine multiple slides into one. `source` must have 2 or more indices.
- `source` indices are 0-based into the original deck.
- `brief` is a one-sentence description of what the output slide should contain. Required for `rewrite` and `merge`; empty for `keep`.
- `title` is a short label for the slide (used for display, not sent to the generator).
- Keep the total slide count reasonable. Do not expand a 10-slide deck into 25 slides.
- Prefer merging thin or overlapping slides over keeping them separate.
- Use `keep` for slides that are already clear and well-structured.
- Every output slide must have a clear purpose — do not create slides with vague or duplicate content.
- Preserve the overall narrative flow of the presentation.

Success criteria:

- The plan covers every original slide (every source index appears in at least one entry).
- The JSON is valid and parseable.
- No source index is out of range.

Input deck summary and outline:
{{markdown}}
