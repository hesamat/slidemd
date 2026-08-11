You are given a finalized chapter outline for a presentation. For each chapter, produce a list of individual slide briefs. Each slide brief describes what one slide should accomplish.

The user has reviewed and finalized the chapters — do not change chapter titles, summaries, flow tags, or ordering. Only decide how to break each chapter into slides and what each slide should cover.

Output format:

```json
{
  "chapters": [
    {
      "title": "Where we were",
      "slides": [
        {
          "title": "The origins",
          "intent": "How the field started and why those early assumptions made sense at the time."
        },
        {
          "title": "How it evolved",
          "intent": "Key milestones over the past decade that shifted thinking."
        },
        {
          "title": "The old consensus",
          "intent": "What most people still believe, setting up the gap in the next chapter."
        }
      ]
    },
    {
      "title": "The gap",
      "slides": [
        {
          "title": "The limitation",
          "intent": "The core problem with existing solutions and why it matters now."
        },
        {
          "title": "The cost of inaction",
          "intent": "What we lose by ignoring this problem, building tension before the solution."
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
- Slides within a chapter should flow naturally — each one building on the previous, none redundant.
- Use the chapter summary as the primary guide for what the slides should cover. The summary specifies the key points; distribute them across the slides.

Success criteria:

- The output has the same chapters (same count, same titles, same order) as the input.
- Each chapter has the suggested number of slides (or close to it).
- Each slide has a distinct purpose within its chapter.
- The slide intents are specific enough to guide full slide generation.
- The JSON is valid and parseable.

Finalized chapter outline:
{{chapters}}
