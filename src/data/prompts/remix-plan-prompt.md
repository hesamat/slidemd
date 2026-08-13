Analyze this deck and produce a restructuring plan. Return the result as JSON.

Output format:

```json
{
  "plan": [
    {
      "action": "keep",
      "source": [0],
      "brief": "",
      "reason": "Clear title slide with correct layout",
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
- `action` must be one of: `keep`, `rewrite`, `merge`.
  - `keep` — the slide is already good; copy it as-is. `brief` should be empty.
  - `rewrite` — rework one slide's content. `source` must have exactly 1 index.
  - `merge` — combine exactly two slides into one. `source` must have exactly 2 indices.
- `source` indices are 0-based into the original deck. The deck has {{sourceCount}} source slides, so valid source indices are 0 through {{maxSourceIndex}} inclusive. The outline above is numbered from 1 for readability, but the index for the first source slide is 0 and the last source slide is {{maxSourceIndex}}.
- `brief` is a one-sentence description of what the output slide should contain and how it should change. Required for `rewrite` and `merge`; empty for `keep`. Be specific — name what to tighten, add, rearrange, or combine, not just "improve this slide".
- `reason` is a short explanation of why this action was chosen (not what the slide will contain — that goes in `brief`). Expected for all actions including `keep`, but not strictly required — if omitted, the plan still succeeds. Keep it to one sentence.
- `title` is a short label for the slide (used for display, not sent to the generator).
- `keepImages` is only meaningful when you were sent slide images (see "When images are provided" below). If you were not sent any images, omit `keepImages` entirely — do not guess it.
- Cover every source slide. Reorder freely if a different order tells the story better.
- Use `keep` only for slides that are already clear, well-structured, in the right place, at a good density, AND have clean formatting. When in doubt, `rewrite` — a slide that looks fine in outline may still benefit from tightening.
- Use `rewrite` when the topic is right but the content or layout could be improved: dense slides that need tightening, weak layouts that could be clearer, code buried in text, or vague wording.
- Slides containing fenced code blocks (` ``` `) should usually be `rewrite`d unless the code is already clean: each statement or declaration on its own line, consistent indentation, no flattened multi-statement lines, and no stray markdown backticks inside the code fence. Imported or pasted code frequently arrives flattened or with doubled backticks (e.g. ` `assert` `) — those slides need rewriting, not `keep`.
- Use `merge` only when two slides are thin (few lines each), overlapping in topic, or redundant — and combining them clearly improves the deck. Do not merge slides with distinct topics, key takeaways, or strong standalone value. When merging, the `brief` must state what each source slide contributes to the merged output so no content is silently lost.
- Do not produce output slides with no clear purpose. If a source slide adds no value, merge it into a neighbor rather than keeping it as a standalone low-value slide.

{{creativeGuidance}}

{{visualIdentityGuidance}}

{{imagesSection}}

Success criteria:

- The plan covers every original slide (every source index appears in at least one entry).
- The JSON is valid and parseable.
- No source index is out of range.
- Each output slide has a clear purpose; include `reason` to explain the decision.
- Each `rewrite`/`merge` `brief` is specific and actionable, not generic.

Input deck summary and outline:
{{markdown}}
