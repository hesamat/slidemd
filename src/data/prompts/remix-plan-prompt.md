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
      "action": "split",
      "source": [2],
      "brief": "Move the three core concepts into a slide of their own",
      "reason": "Roadmap has 12 bullets plus a code example; splitting keeps each slide on one main idea",
      "title": "Roadmap: Concepts"
    },
    {
      "action": "split",
      "source": [2],
      "brief": "Use the code example and its trade-offs as the second slide",
      "reason": "The example is dense enough to deserve its own slide after the concepts",
      "title": "Roadmap: Example"
    },
    {
      "action": "add",
      "source": [],
      "brief": "Insert a short recap slide that lists the three takeaways from this section",
      "reason": "The section has no recap and ends too abruptly",
      "title": "Section Recap"
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
- `action` must be one of: `polish`, `rewrite`, `merge`, `split`, `add`.
  - `polish` — light cleanup of one slide. Fix formatting (especially code blocks), tighten wording, correct layout issues, and remove PPTX-import artifacts, but keep the topic, structure, examples, and images unchanged. `source` must have exactly 1 index. Provide a brief stating exactly what to clean up.
  - `rewrite` — substantial rework of one slide's content or layout. Use when the topic is right but the content needs restructuring, examples need replacing, or the layout needs a different approach. `source` must have exactly 1 index.
  - `merge` — combine exactly two slides into one. `source` must have exactly 2 indices.
  - `split` — turn one source slide into one or more output slides. `source` must have exactly 1 index. To create multiple output slides from the same source, include multiple `split` entries with the same `source` index. Each `split` entry must have a `brief` describing the portion of the source that becomes that output slide. Use `split` when a slide is too dense to fit comfortably even after using a multi-column text block or multi-column layout.
  - `add` — create a new output slide that is not based on a source slide (e.g. a recap, transition, example, or emphasis slide). `source` must be an empty array. Use `add` to fill a real gap in the narrative, not to add padding.
- `source` indices are 0-based into the original deck. The deck has {{sourceCount}} source slides, so valid source indices are 0 through {{maxSourceIndex}} inclusive. The outline above is numbered from 1 for readability, but the index for the first source slide is 0 and the last source slide is {{maxSourceIndex}}.
- `brief` is a one-sentence description of what the output slide should contain and how it should change. Required for `polish`, `rewrite`, `merge`, `split`, and `add`. Be specific — name what to tighten, add, rearrange, or combine, not just "improve this slide".
  - For dense lists or tables, prefer a multi-column text block (`::: text-block { column-count=N markdown=true } ... :::`) or a multi-column layout (`two-column`, `three-column`, `left-heavy`, `right-heavy`) in the rewrite/split brief. The line budget for `column-count=N` content is multiplied by N, so long lists/tables can stay on one slide. Do not split a slide or trim content unless multi-column is genuinely not appropriate.
- `reason` is a short explanation of why this action was chosen (not what the slide will contain — that goes in `brief`). Expected for all actions, but not strictly required — if omitted, the plan still succeeds. Keep it to one sentence.
- `title` is a short label for the slide (used for display, not sent to the generator).
- `keepImages` is only meaningful when you were sent slide images (see "When images are provided" below). If you were not sent any images, omit `keepImages` entirely — do not guess it.
- Cover every source slide. Reorder freely if a different order tells the story better. `add` and `split` entries may change the total slide count; the final output may have more or fewer slides than the source deck.
- Use `polish` for slides that are structurally sound but have mechanical problems: dense paragraphs that need tightening, awkward wording, misaligned content, or fenced code blocks that are flattened or have stray markdown backticks. A slide containing code should almost always be `polish`ed unless the code is already perfectly formatted.
- Use `rewrite` when the topic is right but the content or layout needs a deeper change: dense slides that need restructuring, weak layouts that need a different grid, code buried in text that should move to a dedicated area, or vague wording that needs new examples.
- Slides containing fenced code blocks (` ``` `) should be `polish`ed unless the code is already clean: each statement or declaration on its own line, consistent indentation, no flattened multi-statement lines, and no stray markdown backticks inside the code fence. Imported or pasted code frequently arrives flattened or with doubled backticks (e.g. ` `assert` `) — those slides need `polish`, not `keep`.
- Use `merge` only when two slides are thin (few lines each), overlapping in topic, or redundant — and combining them clearly improves the deck. Do not merge slides with distinct topics, key takeaways, or strong standalone value. When merging, the `brief` must state what each source slide contributes to the merged output so no content is silently lost.
- Use `split` when a single source slide has enough material for multiple focused slides. After trying multi-column layouts, splitting is a valid way to give each idea room. Do not split a thin slide just to increase the slide count.
- Use `add` when the narrative is missing a transition, recap, example, or hook that does not exist in the source deck. Do not add a slide that merely restates a source slide; use `rewrite` or `split` instead.
- Never merge a slide that is marked with `image` or `diagram` in the outline metadata, or whose layout name suggests a prominent visual (`media-left`, `media-right`, `full-image`, `media-span-*`, etc.). Those slides should remain standalone so the image or diagram stays prominent; use `polish` or `rewrite` instead. The `image: "..."` and `diagram: "..."` markers carry alt text and diagram labels — use them to judge whether a visual is irreplaceable (e.g. `image: "team photo"`, `diagram: "Step 1, Step 2, Step 3"`) versus decorative or generic.
- Do not produce output slides with no clear purpose. If a source slide adds no value, merge it into a neighbor rather than leaving it as a standalone low-value slide.

{{flowGuidance}}

{{creativeGuidance}}

{{visualIdentityGuidance}}

{{imagesSection}}

Success criteria:

- The plan covers every original slide (every source index appears in at least one entry that references it). `add` entries do not cover source slides; they are allowed as extra output slides.
- The total number of output slides equals the number of plan entries.
- The JSON is valid and parseable.
- No source index is out of range.
- Each output slide has a clear purpose; include `reason` to explain the decision.
- Each `polish`/`rewrite`/`merge`/`split`/`add` `brief` is specific and actionable, not generic.

Input deck summary and outline:
{{markdown}}
