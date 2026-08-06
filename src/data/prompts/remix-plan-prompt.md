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
      "title": "Roadmap",
      "keepImages": [0]
    },
    {
      "action": "merge",
      "source": [3, 4],
      "brief": "Combine these two thin slides into a single comparison slide",
      "title": "Comparison",
      "keepImages": [0, 1]
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
- `keepImages` is only meaningful when you were sent slide images (see "When images are provided" below). If you were not sent any images, omit `keepImages` entirely — do not guess it.
- Cover every source slide. Reorder freely if a different order tells the story better.
- Use `keep` for slides that are already clear, well-structured, and in the right place.
- Use `rewrite` when the topic is right but the content or layout could be improved.
- Use `merge` when adjacent slides are thin, overlapping, or redundant.

{{creativeGuidance}}

{{visualIdentityGuidance}}

{{imagesSection}}

Success criteria:

- The plan covers every original slide (every source index appears in at least one entry).
- The JSON is valid and parseable.
- No source index is out of range.
- Each output slide has a clear purpose.

Input deck summary and outline:
{{markdown}}
