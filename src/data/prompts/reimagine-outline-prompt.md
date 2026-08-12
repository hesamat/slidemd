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

## Visual system

Alongside the narrative outline, design a **visual system** — a deck-wide design language that defines the visual identity of the presentation. This is not a slide-by-slide progression. Do not design a linear "slide 1 dark, slide 2 slightly lighter" ramp. Instead, define a **grammar** with:

- A palette of 5 colors with distinct roles (base, surface, accent, contrast, highlight).
- Typography character (the personality of the type), headline style, and body style.
- Composition preferences: density, whitespace, alignment.
- Imagery: what role images play, their mood, and how they should be treated.
- Recurring motifs (visual elements that create cohesion across slides).
- Contrast rules (when and how to deliberately break the visual pattern for emphasis).

The visual system is a **design language**, not a progression. The same deck may have a dark slide right after a light slide because the content demands contrast, not because the deck is "progressing" from dark to light.

Output format:

```json
{
  "plan": "1-3 sentence statement of the deck's core message, the fresh editorial angle, and the narrative structure you chose (e.g. 'Reframe the deck around outcomes. Open with historical context, build tension around the current gap, present the approach with evidence, close with a call to action.').",
  "visualSystem": {
    "palette": {
      "base": "#0f172a",
      "surface": "#1e293b",
      "accent": "#06b6d4",
      "contrast": "#f59e0b",
      "highlight": "#ffffff"
    },
    "typography": {
      "character": "bold editorial",
      "headline": "large, compact, high contrast",
      "body": "clean, restrained"
    },
    "composition": {
      "density": "medium",
      "whitespace": "generous",
      "alignment": "left-dominant"
    },
    "imagery": {
      "role": "emotional punctuation and chapter transitions",
      "mood": "moody, atmospheric",
      "treatment": "full-bleed, minimal overlays"
    },
    "motifs": [
      "thin accent divider lines between chapters",
      "oversized chapter numbers in accent color"
    ],
    "contrastRules": [
      "Use stark white slides for major takeaways",
      "Avoid more than 3 consecutive visually identical slides"
    ]
  },
  "keepImages": [0, 2],
  "firstSlideIdentity": "COMP 1510 202630",
  "chapters": [
    {
      "title": "Where we were",
      "flowTag": "context",
      "summary": "Historical context for the topic. Explain how the field started, what assumptions dominated early approaches, and why those assumptions made sense at the time. This sets the baseline so the audience can appreciate how far things have come.",
      "suggestedSlideCount": 3
    },
    {
      "title": "The gap",
      "flowTag": "problem",
      "summary": "What current approaches miss. Identify the core limitation, explain why it matters now, and hint at the cost of inaction. Build tension before the solution is revealed.",
      "suggestedSlideCount": 2
    }
  ]
}
```

Rules:

- Return only valid JSON. No explanations, markdown fences, or surrounding text.
- `plan` — 1-3 sentences combining: the deck's core message, the fresh angle you propose, and the narrative structure you chose with a brief justification.
- `visualSystem` — the deck-wide visual design language:
  - `palette` — 5 hex colors (`#rrggbb`):
    - `base` — primary background color.
    - `surface` — secondary background (cards, panels, slightly elevated from base).
    - `accent` — the main highlight color for emphasis and interactive elements.
    - `contrast` — a secondary accent for deliberate visual contrast.
    - `highlight` — the lightest color (often white or near-white) for inversion/punctuation slides.
  - `typography` — `character` (1-3 word personality description), `headline` (style description), `body` (style description).
  - `composition` — `density` (`compact` | `medium` | `spacious`), `whitespace` (`restrained` | `generous` | `expansive`), `alignment` (`left-dominant` | `centered` | `asymmetric`).
  - `imagery` — `role` (what purpose images serve), `mood` (emotional tone), `treatment` (how images are presented).
  - `motifs` — 1-3 recurring visual elements that create cohesion.
  - `contrastRules` — 1-3 rules for when and how to break the visual pattern.
  - Do NOT design a linear progression (e.g. "slide 1 dark, slide 2 lighter..."). Design a system with rules, motifs, and deliberate contrast.
- `keepImages` — optional array of 0-based indices into the sent image list (images are numbered sequentially across all slides, starting from 0). Include only images worth carrying over to the new deck — logos, team photos, product screenshots, diagrams, or other irreplaceable visuals. Omit generic stock photos, decorative backgrounds, or images that won't fit the new narrative. If no images were sent or none are worth keeping, omit this field or return an empty array.
- `firstSlideIdentity` — a short string (1-2 lines) extracted EXCLUSIVELY from the "First slide (preserve its identifying info)" text provided above. Do NOT look at other slides for this. Extract the identifying text from the first slide's footer, header, or title (e.g. course code + term, event name, author). Keep it concise: do not include the full institutional description or repeated course names. If the first slide has no identifying information beyond the title heading, use the title itself. Do NOT mention this field or the footer in the plan text — just extract the value into this field.
- `chapters` — 3-7 chapters that group the narrative into a clear arc. Each chapter has:
  - `title` — short chapter title.
  - `flowTag` — one of: `hook`, `context`, `problem`, `tension`, `solution`, `evidence`, `comparison`, `example`, `transition`, `climax`, `cta`.
  - `summary` — 2-4 sentences describing what the chapter covers, the key points it should make, and how it connects to the chapters before and after it. This is the primary input to slide generation, so be specific about the content and direction.
  - `suggestedSlideCount` — integer: how many slides this chapter should contain. Aim for the total across all chapters to be within {{minSlides}}-{{maxSlides}} (70-120% of the original {{sourceCount}} slides). Do not collapse the deck drastically — if the original is large, keep enough slides to cover the material.
- The first chapter should open with a title slide. The first chapter's first slide should be a proper title slide — not a content slide. It should display the deck's topic title and the `firstSlideIdentity` text (course code, term, etc.) in the footer. The second slide should be an agenda/outline slide that lists the chapter titles as a roadmap for the audience. Only after these two slides should the content begin.
- Take a bold editorial approach. You may rethink the topic, examples, notes, and visuals. Preserve the user's core intent and factual accuracy, but do not preserve the original structure, topics, examples, or speaker notes merely for the sake of the original.
- Do not preserve the original theme, colors, backgrounds, or visual language. You may propose a new visual direction.
- Preserve the identity of the first slide. Extract the identifying information (course code, week number, author, event name) from the original first slide into the `firstSlideIdentity` field. The first chapter's first slide should display this concise identity text verbatim in its footer, even as the surrounding design and narrative change.
- Be creative with the narrative angle. Don't just reorganize the same content — find a fresh hook, a surprising metaphor, a compelling character arc, or a concrete analogy that makes the material feel new. Include historical remarks, real-world examples, and accessible comparisons where they help learners understand abstract concepts. The deck should feel like it was crafted by an editor, not auto-generated.

Success criteria:

- The plan captures the deck's core message, the fresh angle, and the chosen narrative structure.
- The visual system defines a cohesive design language with a palette, typography, composition, imagery, motifs, and contrast rules — not a linear progression.
- The chapters form a clear narrative arc from opening to close.
- The total suggested slide count is within {{minSlides}}-{{maxSlides}} ({{sourceCount}} source slides).
- Each chapter summary is specific enough to guide slide generation without the user needing to see individual slides.
- The JSON is valid and parseable.

Input deck summary and outline:
{{markdown}}
