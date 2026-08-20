You are given a finalized chapter outline for a presentation, along with a visual system that defines the deck-wide design language. For each chapter, produce a list of individual slide briefs. Each slide brief describes what one slide should accomplish and what visual role it plays within the design language.

The user has reviewed and finalized the chapters — do not change chapter titles, summaries, flow tags, or ordering. Only decide how to break each chapter into slides, what each slide should cover, and what visual beat each slide should have.

## Flow tags

Each chapter in the outline carries a `flowTag` that describes its narrative role. Use it to guide beat assignment and density:

- **Story/persuasion tags** — `hook` (grab attention), `context` (set the scene), `problem` (identify the gap), `tension` (raise the stakes), `solution` (present the approach), `evidence` (back it up), `comparison` (contrast alternatives), `example` (show it in action), `transition` (bridge to the next point), `climax` (the key moment), `cta` (call to action).
- **Instructional tags** — `objectives` (what the audience will learn — favor a clear focal point), `steps` (walk through a process — favor continuation beats with consistent density), `practice` (apply or check understanding — favor a focused exercise or question), `recap` (summarize key points — favor a clear focal point).
- **Technical tags** — `assertion` (state a claim — pair naturally with an adjacent `evidence` chapter), `evidence` (back it up with data), `implication` (what it means going forward — favor a punctuation or transition beat).

The flow tag is a hint, not a constraint. Use it to inform beat choice and content density, but prioritize the chapter summary as the primary guide.

## Visual beats

Each slide gets a `visualBeat` — its semantic visual role within the design language:

- **continuation** — Maintain the established visual language. This is the default.
- **transition** — Move the presentation from one visual/narrative chapter to another.
- **punctuation** — A high-emphasis moment: key statistic, conclusion, quote, revelation, or important takeaway.
- **emotional** — A visually expressive moment where imagery or atmosphere carries more of the communication.
- **divider** — A chapter/section marker with minimal content.

Guidance:

- `continuation` is the default — most slides should use it.
- Use high-impact beats (`punctuation`, `emotional`, `divider`) sparingly. They lose their impact if overused.
- Avoid repeating the same high-impact beat on adjacent slides.
- Consider neighboring slides and the overall narrative when assigning beats.
- `punctuation` should usually correspond to genuinely important content.
- `emotional` should usually correspond to content that benefits from imagery or atmosphere.
- `divider` should only be used when a meaningful section boundary exists.
- `relationship: break` should indicate deliberate visual contrast with the preceding slide.
- `relationship: continue` should preserve visual continuity.

Do not apply rigid mathematical quotas. Optimize for visual rhythm rather than satisfying an arbitrary number of beat occurrences.

## First slide identity

The first slide of the deck must preserve the identifying information from the original deck's first slide. The outline provides this as `firstSlideIdentity`:

{{firstSlideIdentity}}

The first slide brief's `intent` field must include this text verbatim (e.g. "Footer: COMP 1510 202630"). The generate phase will place it in the slide's `@footer` area. Keep the footer to one or two short lines; do not overload it with long institutional text.

## Deck structure

The first chapter should open with TWO special slides before content begins:

1. **Title slide** (first slide of the deck): The intent should say "Title slide for the deck. Topic: <topic>. Footer: <firstSlideIdentity>. Use a large title and minimal content — this is the opening visual." The generate AI will use the `title-slide` layout for this.
2. **Agenda slide** (second slide of the deck): The intent should say "Agenda/outline slide listing the chapter titles as a roadmap: <chapter 1 title>, <chapter 2 title>, ... Keep it visual and scannable, not a wall of text."

Only after these two slides should the chapter's content slides begin. If the first chapter's `suggestedSlideCount` is less than 3, increase it to accommodate the title and agenda slides.

## Layout variety

The generate AI chooses layouts, but you can guide it through the intent. Vary the visual structure across slides — don't make every slide a code block with an explanation. Consider:

- Tables for comparisons
- Full-image or media-span layouts for emotional/visual slides
- Focus layouts for key takeaways and predictions
- Two-column for code + explanation or before/after comparisons
- Multi-column text blocks (`::: text-block { column-count=N markdown=true } ... :::`) for long lists or tables that exceed a single column. The line budget for that content is multiplied by N, so dense material can stay on one slide.
- Use `media-span-left`/`media-span-right` ONLY when the slide's `@media` area will contain an image. Do not choose these layouts for tables, text, or code.

Only ask for a Mermaid diagram when the concept has branches, decisions, loops, or parallel paths that cannot be shown clearly in text, a table, or code. A straight line of boxes is a list, not a diagram. Do not request a flowchart to explain or define a concept; use a numbered list, table, or code example instead.

No more than one Mermaid diagram per chapter. For most chapters, zero diagrams is the right choice.

Vary the content format across slides in a chapter. Don't make every slide "code block + explanation." Mix in: comparison tables, step-by-step traces, prediction questions, before/after contrasts, annotated examples, analogies, and historical remarks. If a chapter has 5 slides, at most 2 should use a visual format (diagram, table, or image) and the rest should be code or concise text.

## Image queries

If a slide would benefit from an image, you may only use an image from the original deck. Reference it by setting `imageQuery` to `reuse:<path>` (e.g. `reuse:images/team-photo.jpg`). Use this when a kept image fits the slide's content. If no kept image fits, omit `imageQuery`. Do not use search terms, descriptions, or AI-generated image ideas.

{{keptImages}}

Output format:

```json
{
  "chapters": [
    {
      "title": "Where we were",
      "slides": [
        {
          "title": "The origins",
          "intent": "How the field started and why those early assumptions made sense at the time.",
          "visualBeat": "continuation",
          "energy": "medium",
          "contrast": "moderate",
          "relationship": "continue"
        },
        {
          "title": "How it evolved",
          "intent": "Key milestones over the past decade that shifted thinking.",
          "visualBeat": "continuation",
          "energy": "medium",
          "contrast": "moderate",
          "relationship": "continue"
        },
        {
          "title": "The old consensus",
          "intent": "What most people still believe, setting up the gap in the next chapter.",
          "visualBeat": "punctuation",
          "energy": "high",
          "contrast": "strong",
          "relationship": "break"
        }
      ]
    },
    {
      "title": "The gap",
      "slides": [
        {
          "title": "The limitation",
          "intent": "The core problem with existing solutions and why it matters now.",
          "visualBeat": "transition",
          "energy": "medium",
          "contrast": "moderate",
          "relationship": "break",
          "imageQuery": "reuse:images/gears.jpg"
        },
        {
          "title": "The cost of inaction",
          "intent": "What we lose by ignoring this problem, building tension before the solution.",
          "visualBeat": "emotional",
          "energy": "high",
          "contrast": "strong",
          "relationship": "break",
          "imageQuery": "reuse:images/storm.jpg"
        }
      ]
    }
  ]
}
```

Rules:

- Return only valid JSON. No explanations, markdown fences, or surrounding text.
- Keep the same number of chapters, in the same order, with the same titles as the input.
- Each chapter's `slides` array must have at least 1 slide. Use the `suggestedSlideCount` as a starting point, but add or remove slides when the chapter's content demands it. The final slide count should serve the narrative, not the exact target.
- Each slide has:
  - `title` — a short slide title (2-6 words).
  - `intent` — one sentence describing what the slide should accomplish and what content it should contain.
  - `visualBeat` — one of: `continuation`, `transition`, `punctuation`, `emotional`, `divider`.
  - `energy` — one of: `low`, `medium`, `high`. Default `medium`.
  - `contrast` — one of: `subtle`, `moderate`, `strong`. Default `moderate`.
  - `relationship` — one of: `continue`, `break`. Default `continue`.
  - `imageQuery` — (optional) only allowed as a `reuse:<path>` reference to a kept image from the original deck. Omit if no kept image fits.
- Slides within a chapter should flow naturally — each one building on the previous, none redundant.
- Every slide `title` must be unique within the deck. Do not repeat a title used by another slide. If a topic reappears, use a distinct, specific title (e.g., "A reliable workflow" and "The path to a reliable answer" instead of the same title twice).
- Slide titles must not include internal chapter labels, step numbers, stage markers, or brief metadata. Titles should be clean, human-facing headings (e.g., "Trace the path before you run it", not "chapter 03 / prediction").
- Use the chapter summary as the primary guide for what the slides should cover. The summary specifies the key points; distribute them across the slides.
- Enrich technical content with analogies, real-world examples, historical remarks, or memorable stories. The intent for at least a few slides per chapter should explicitly include a concrete comparison or a non-technical context that helps learners connect the concept to something familiar.
- Do not advance the conceptual level. Each slide must cover the same conceptual depth as the source deck. You may enrich content with concrete comparisons, real-world examples, historical remarks, and memorable stories, but do not introduce new concepts, jargon, or examples that assume more prior knowledge than the original.

Success criteria:

- The output has the same chapters (same count, same titles, same order) as the input.
- Each chapter has a sensible number of slides for its content; the suggested count is a guide, not a requirement.
- Each slide has a distinct purpose within its chapter.
- The slide intents are specific enough to guide full slide generation.
- The visual beats create rhythm — high-impact beats are used sparingly and not repeated on adjacent slides.
- Image queries (when present) are consistent with the chosen visual direction.
- The JSON is valid and parseable.

Visual direction:

{{visualSystem}}

Use the direction above to assign a sensible `visualBeat` and image query to each slide. The later generate AI will turn these into concrete `layout:`, `theme:`, and `background:` choices. Do not treat the direction as a strict palette; the generate AI is free to pick any professional colors or kept images that fit.

Background / layout guidance by beat:

- `continuation` — default content beat. Use `header-content` or `two-column` for dense content; follow the visual direction's default background.
- `punctuation` — a high-emphasis moment. Use `focus` only for a single short takeaway; otherwise use `header-content` with a bright, light, or image background.
- `transition` — bridge between chapters. Use a deliberate background/theme shift; `header-content` or `focus`.
- `emotional` — imagery or atmosphere. Use `full-image` or `media-span` with a kept image when available; otherwise use `header-content` with an atmospheric background.
- `divider` — a section marker. Minimal content, a large heading, and a strong background/theme change. `title-slide` or `header-content`.
- Title/agenda (first two slides of the first chapter) — `title-slide` for the title and `header-content` or `title-slide` for the agenda, with a light or dramatic background.

Vary backgrounds across the deck; do not use the same background for every slide. Do not default to a single dark color for most slides — mix dark, neutral, and light backgrounds as the visual direction suggests.

Finalized chapter outline:
{{chapters}}
