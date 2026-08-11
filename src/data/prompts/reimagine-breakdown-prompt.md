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

## Image queries

If a slide would benefit from an image, include an `imageQuery` — a short search query describing the desired image. Make image queries consistent with the visual system's imagery mood. Do not force literal repetition of mood words if that makes the query unnatural. If no image is needed, omit `imageQuery`.

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
          "imageQuery": "broken gears industrial moody"
        },
        {
          "title": "The cost of inaction",
          "intent": "What we lose by ignoring this problem, building tension before the solution.",
          "visualBeat": "emotional",
          "energy": "high",
          "contrast": "strong",
          "relationship": "break",
          "imageQuery": "storm clouds dramatic moody"
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
  - `imageQuery` — (optional) a short search query for an image that would enhance the slide. Omit if no image is needed.
- Slides within a chapter should flow naturally — each one building on the previous, none redundant.
- Use the chapter summary as the primary guide for what the slides should cover. The summary specifies the key points; distribute them across the slides.

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

Finalized chapter outline:
{{chapters}}
