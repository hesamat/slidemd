You are given a finalized chapter outline for a presentation, along with a visual system that defines the deck-wide design language. For each chapter, produce a list of individual slide briefs. Each slide brief describes what one slide should accomplish and what visual role it plays within the design language.

The user has reviewed and finalized the chapters — do not change chapter titles, summaries, flow tags, or ordering. Only decide how to break each chapter into slides, what each slide should cover, and what visual beat each slide should have.

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

- Diagrams and flowcharts for conceptual relationships (Mermaid)
- Tables for comparisons
- Full-image or media-span layouts for emotional/visual slides
- Focus layouts for key takeaways and predictions
- Two-column for code + explanation or before/after comparisons
- Use `media-span-left`/`media-span-right` ONLY when the slide's `@media` area will contain an image or a Mermaid diagram. Do not choose these layouts for tables, text, or code.

If a slide should use a specific visual format, mention it in the intent (e.g. "Use a Mermaid flowchart to show the data flow" or "Use a table comparing lists vs dictionaries").

When describing diagrams in the intent, be specific about what the diagram should show — not just "use a flowchart" but "use a flowchart showing the access path from list → dict → key → value with 5+ nodes and a branch for the error case." Trivial diagrams (two boxes with an arrow) add no value; guide the generate AI toward diagrams that illustrate real structure, relationships, or transformations.

Do not ask for a Mermaid diagram that is just a straight line of 4+ boxes connected by arrows. That is a list, not a diagram. Only request a flowchart when the concept has branches, decisions, loops, or parallel paths. Do not request a flowchart to explain or define a concept; use a numbered list, table, or code example instead.

Vary the content format across slides in a chapter. Don't make every slide "code block + explanation." Mix in: comparison tables, step-by-step traces, prediction questions, before/after contrasts, annotated examples, diagrams, analogies, and historical remarks. If a chapter has 5 slides, at least 2 should use a non-code-centric format and at least 1 should use an analogy or a memorable story.

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
- Each chapter's `slides` array must have at least 1 slide and should match the `suggestedSlideCount` for that chapter when possible.
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
- Do not level up the material. Each slide must cover the same conceptual depth as the source deck. Do not introduce new concepts, jargon, or examples that assume more prior knowledge than the original.

Success criteria:

- The output has the same chapters (same count, same titles, same order) as the input.
- Each chapter has the suggested number of slides (or close to it).
- Each slide has a distinct purpose within its chapter.
- The slide intents are specific enough to guide full slide generation.
- The visual beats create rhythm — high-impact beats are used sparingly and not repeated on adjacent slides.
- Image queries (when present) are consistent with the visual system's imagery mood.
- The JSON is valid and parseable.

Visual system:
{{visualSystem}}

Use the visual system to guide the beat treatment. Match the energy and contrast fields in the JSON above to the beat, and choose visual treatments that fit the palette, typography, composition, imagery mood, motifs, and contrast rules. Do not invent colors or visual treatments that contradict the visual system.

Finalized chapter outline:
{{chapters}}
