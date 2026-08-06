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
- `keepImages` is an optional array of 0-based indices into the source slide's extracted images (in order of appearance). Use it to specify which images to keep in the output. Omit to keep all images. Use `[]` to drop all images from a slide.
- Keep the total slide count reasonable. Do not expand a 10-slide deck into 25 slides.
- Use `keep` for slides that are already clear and well-structured.
- Prefer `keep` or `rewrite` over `merge`; only `merge` slides that are genuinely thin, overlapping, or redundant.
- Every output slide must have a clear purpose — do not create slides with vague or duplicate content.
- Preserve the overall narrative flow of the presentation.

When images are provided:

- You will also receive the raw images from each slide (background images are excluded). Use these images to assess their content and quality when deciding whether to keep, rewrite, or merge slides.
- In the plan, each entry can reference which images to keep via the `keepImages` field (array of 0-based image indices from the source slide).
- When merging slides, choose which images from each source slide to keep in the merged output.
- You are not limited to placing images in a `@media` area. Images can be freely positioned using `position: relative` with `left`, `top`, `width`, and `height` style attributes on the `<img>` tag. Use this when an image needs custom placement that doesn't fit the standard area layout.
- If an image is low quality, redundant, or doesn't add value, drop it (don't include it in `keepImages`).

Success criteria:

- The plan covers every original slide (every source index appears in at least one entry).
- The JSON is valid and parseable.
- No source index is out of range.

Input deck summary and outline:
{{markdown}}
