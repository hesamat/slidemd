Analyze this deck and produce a restructuring plan. Return the result as JSON.

Output format:

```json
{
  "plan": [
    {
      "action": "polish",
      "source": [0],
      "brief": "Tighten title wording and center the subtitle for balance",
      "reason": "Title slide is good but subtitle is slightly off-center",
      "title": "Introduction"
    },
    {
      "action": "rewrite",
      "source": [2],
      "brief": "Tighten the 12 bullets to 5 key points and switch to two-column so the code example sits in @media",
      "reason": "Content is dense (12 bullets) and the code block is buried in @main",
      "title": "Roadmap",
      "keepImages": [0]
    },
    {
      "action": "merge",
      "source": [3, 4],
      "brief": "Combine the two thin overview slides into a single comparison table covering both topics",
      "reason": "Both slides are under 4 lines, cover related concepts, and neither stands alone well",
      "title": "Comparison",
      "keepImages": [0, 1]
    }
  ]
}
```

Rules:

- Return only valid JSON. No explanations, markdown fences, or surrounding text.
- `action` must be one of: `polish`, `rewrite`, `merge`.
  - `polish` — light cleanup of one slide. Fix formatting (especially code blocks), tighten wording, correct layout issues, and remove PPTX-import artifacts, but keep the topic, structure, examples, and images unchanged. `source` must have exactly 1 index. Provide a brief stating exactly what to clean up.
  - `rewrite` — substantial rework of one slide's content or layout. Use when the topic is right but the content needs restructuring, examples need replacing, or the layout needs a different approach. `source` must have exactly 1 index.
  - `merge` — combine exactly two slides into one. `source` must have exactly 2 indices.
- `source` indices are 0-based into the original deck. The deck has {{sourceCount}} source slides, so valid source indices are 0 through {{maxSourceIndex}} inclusive. The outline above is numbered from 1 for readability, but the index for the first source slide is 0 and the last source slide is {{maxSourceIndex}}.
- `brief` is a one-sentence description of what the output slide should contain and how it should change. Required for `polish`, `rewrite`, and `merge`. Be specific — name what to tighten, add, rearrange, or combine, not just "improve this slide".
- `reason` is a short explanation of why this action was chosen (not what the slide will contain — that goes in `brief`). Expected for all actions, but not strictly required — if omitted, the plan still succeeds. Keep it to one sentence.
- `title` is a short label for the slide (used for display, not sent to the generator).
- `keepImages` is only meaningful when you were sent slide images (see "When images are provided" below). If you were not sent any images, omit `keepImages` entirely — do not guess it.
- Cover every source slide. Reorder freely if a different order tells the story better.
- Use `polish` for slides that are structurally sound but have mechanical problems: dense paragraphs that need tightening, awkward wording, misaligned content, or fenced code blocks that are flattened or have stray markdown backticks. A slide containing code should almost always be `polish`ed unless the code is already perfectly formatted.
- Use `rewrite` when the topic is right but the content or layout needs a deeper change: dense slides that need restructuring, weak layouts that need a different grid, code buried in text that should move to a dedicated area, or vague wording that needs new examples.
- Slides containing fenced code blocks (` ``` `) should be `polish`ed unless the code is already clean: each statement or declaration on its own line, consistent indentation, no flattened multi-statement lines, and no stray markdown backticks inside the code fence. Imported or pasted code frequently arrives flattened or with doubled backticks (e.g. ` `assert` `) — those slides need `polish`, not `keep`.
- Use `merge` only when two slides are thin (few lines each), overlapping in topic, or redundant — and combining them clearly improves the deck. Do not merge slides with distinct topics, key takeaways, or strong standalone value. When merging, the `brief` must state what each source slide contributes to the merged output so no content is silently lost.
- Never merge a slide that is marked with `image` or `diagram` in the outline metadata, or whose layout name suggests a prominent visual (`media-left`, `media-right`, `full-image`, `media-span-*`, etc.). Those slides should remain standalone so the image or diagram stays prominent; use `polish` or `rewrite` instead.
- Do not produce output slides with no clear purpose. If a source slide adds no value, merge it into a neighbor rather than leaving it as a standalone low-value slide.

{{flowGuidance}}

{{creativeGuidance}}

{{visualIdentityGuidance}}

{{imagesSection}}

Success criteria:

- The plan covers every original slide (every source index appears in at least one entry).
- The JSON is valid and parseable.
- No source index is out of range.
- Each output slide has a clear purpose; include `reason` to explain the decision.
- Each `polish`/`rewrite`/`merge` `brief` is specific and actionable, not generic.

Input deck summary and outline:
{{markdown}}
