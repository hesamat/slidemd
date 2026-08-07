Analyze this deck and propose a bold new direction. Return the result as JSON.

If images are provided with this request, use them to assess the visual content, quality, and style of the original deck. You may reference the visual themes in your plan, but you are free to propose a completely new visual direction.

The presentation flow is **{{flow}}**. Choose storytelling techniques that fit this flow and the content — you may combine several:

- **Problem → Solution → Benefits** — open with the gap, present the approach, show the payoff.
- **Historical context arc** — trace how the topic evolved over time, then position the present moment.
- **Hook → Tension → Resolution** — grab attention, build stakes, deliver the payoff.
- **Compare → Contrast** — juxtapose alternatives, then argue for one.
- **Past → Present → Future** — where we were, where we are, where we're going.
- **Cause → Effect** — trace consequences from a root cause.
- **Layered reveal** — start simple, add complexity layer by layer.

Output format:

```json
{
  "plan": "1-3 sentence statement of the deck's core message, the fresh editorial angle, and the narrative structure you chose (e.g. 'Reframe the deck around outcomes. Open with historical context, build tension around the current gap, present the approach with evidence, close with a call to action.').",
  "chapters": [
    {
      "title": "Where we were",
      "flowTag": "context",
      "summary": "Historical context for the topic.",
      "slides": [
        { "title": "The origins", "intent": "How the field started and why." },
        { "title": "How it evolved", "intent": "Key milestones over the past decade." }
      ]
    },
    {
      "title": "The gap",
      "flowTag": "problem",
      "summary": "What current approaches miss.",
      "slides": [
        { "title": "The limitation", "intent": "The core problem with existing solutions." }
      ]
    }
  ]
}
```

Rules:

- Return only valid JSON. No explanations, markdown fences, or surrounding text.
- `plan` — 1-3 sentences combining: the deck's core message, the fresh angle you propose, and the narrative structure you chose with a brief justification.
- `chapters` — 3-7 chapters that group the slides into a narrative arc. Each chapter has:
  - `title` — short chapter title.
  - `flowTag` — one of: `hook`, `context`, `problem`, `tension`, `solution`, `evidence`, `comparison`, `example`, `transition`, `climax`, `cta`.
  - `summary` — one sentence describing what the chapter covers.
  - `slides` — array of `{ title, intent }` entries. Each `intent` is one sentence describing what the slide should accomplish.
- **Slide count target**: the original deck has {{sourceCount}} slides. Aim for {{minSlides}}-{{maxSlides}} slides total (70-120% of the original). Do not collapse the deck drastically — if the original is large, keep enough slides to cover the material. Add slides where the story needs them; drop only slides that are truly redundant.
- Take a bold editorial approach. You may rethink the topic, examples, notes, and visuals. Preserve the user's core intent and factual accuracy, but do not preserve the original structure, topics, examples, or speaker notes merely for the sake of the original.
- Do not preserve the original theme, colors, backgrounds, or visual language. You may propose a new visual direction.

Success criteria:

- The plan captures the deck's core message, the fresh angle, and the chosen narrative structure.
- The chapters form a clear narrative arc from opening to close.
- The total slide count is within {{minSlides}}-{{maxSlides}} ({{sourceCount}} source slides).
- Each slide has a distinct purpose within its chapter.
- The JSON is valid and parseable.

Input deck summary and outline:
{{markdown}}
