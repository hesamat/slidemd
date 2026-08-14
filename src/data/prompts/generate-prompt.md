Refine this SlideMD presentation. Return the result as JSON.

Content strategy:

- Improve wording: make headers concise, tighten bullet points, replace vague text with specific statements.
- Pick the best layout for each slide's content — don't default to header-content if a two-column, focus, or table layout would be clearer.
- Vary layouts across the deck. If three consecutive slides use the same layout, reconsider at least one. Use `focus` for a single key takeaway, `two-column` for balanced code+explanation, `media-span-left`/`media-span-right` ONLY when the `@media` area contains an image or Mermaid diagram, `full-image` for atmospheric/visual slides, and `title-slide` for the deck's opening slide.
- Match the layout to the content. Use `focus` only for a single key takeaway; `focus` has limited height, so use `header-content` or `two-column` for dense tables, code, and Mermaid diagrams. Use `two-column` only when both columns have real content. Use `media-span-left` or `media-span-right` only when the `@media` area is an image or a Mermaid diagram.
- If the first slide's brief says "Title slide", use `layout: title-slide` with the topic as `@title` and the identity text as `@footer`. Do not add body content to a title slide. Keep the footer to one or two short lines of identifying information (e.g. course code and term).
- Use tables for 2-3 item comparisons.
- Use two-column for diagrams, code, or dense content.
- Do not repeat slide titles. Every slide title must be unique and clearly distinguishable from other slides in the deck.
- Do not include internal chapter labels, step numbers, stage markers, or brief metadata in slide text. Slide titles and body text should be clean, human-facing content. Remove markers like `chapter 03 / ...`, `> $ section / step N`, `>>> ...`, or similar leaked brief tokens.
- Add speaker notes where helpful: `<!-- notes: ... -->`.
- Drop images that are low quality, redundant, or don't add value to the slide — unless the visual-styling instructions below say to preserve the deck's visual identity. In that case, keep every image from the input slide (as `<img>` or `background: url(...)`); do not drop it for quality or relevance reasons.
- If the input appears to be from a PPTX import (mismatched layouts, images in wrong areas, verbose text boxes), fix the layout to match the actual content, reposition images to where they make sense, and tighten the text.
- If a slide has a `<!-- brief: ... -->` comment, follow that brief. A brief saying "merge" means combine the following slides into one output slide.
- The brief may include `| beat: ..., energy: ..., contrast: ..., relationship: ... |` after the intent. When a visual system is present, use the beat-treatment guidance in the visual-styling instructions below to choose density, hierarchy, layout, and imagery for that slide.
- The brief may include `| image: <query>` at the end. Only honor the query if it is a `reuse:<path>` directive (e.g. `reuse:images/team-photo.jpg`). In that case, insert `<img src="path">` on that slide using the exact path. If the query is anything other than `reuse:<path>` (a search term, a description, etc.), ignore it — do not insert an image.
- If the brief intent text contains "Footer: <text>", place that text verbatim in the slide's `@footer` area (not in `@main`). This is used to preserve deck identity (course code, week number, etc.) on the first slide.
- If the brief asks to "preserve the existing closing message" or the slide is the deck's closing/recap slide, keep the original sign-off, thank-you, and call-to-action text verbatim. Add any requested recap content (outcomes, next steps) around or beneath the original closing message, not as a replacement for it.
- Do not introduce concepts that are more advanced than the source slide. Keep the same terminology, conceptual depth, and expected prior knowledge.
- Follow the mode and visual-identity instructions that follow this prompt.

Presentation voice:

- Write as if speaking to the audience, not writing an encyclopedia entry. Use a conversational, presentable tone.
- Headlines should be short, intriguing phrases — not full-sentence labels. Let the headline create interest and the body deliver the point.
- Keep bullets short and limited to one idea each. Prefer phrases over complete sentences; avoid dense paragraphs.
- Vary bullet openings and sentence structure so the deck does not feel repetitive.
- Use concrete examples, analogies, comparisons, and real-world references where they make a point clearer.
- Put supporting detail, narration, transitions, and likely audience questions in speaker notes (`<!-- notes: ... -->`) when they do not belong on the slide.
- Do not pack more text onto a slide just because voice guidance was applied. Respect the density budgets below.

Visual styling:

{{visualStylingNote}}

- Place content images using `<img>` tags with appropriate `position: relative` + `left`/`top`/`width` for custom placement when the layout allows it.
- For full-bleed visuals, use `layout: full-image` with the image as the `@main` content.

Diagrams:

- Use Mermaid only when a concept has branches, decisions, loops, or parallel paths. A straight line of boxes is a list, not a diagram.
- Do NOT use ASCII art, box-drawing characters, or text-based diagrams (e.g. `─┐`, `├──>`, `──>`). These render poorly and are not interactive.
- If a concept needs a visual, prefer a table, a numbered list, or a short code example. Only use Mermaid when a relationship cannot be shown clearly in text.
- Diagrams should be substantive, not trivial. A two-box flowchart is not a diagram — it is a label. Show real relationships: multiple paths, branches, before/after states, data transformations, or layered structures. Keep diagrams to 3–7 nodes.
- Do not generate more than two Mermaid diagrams per chapter or per five content slides. Most slides should not have a diagram.
- Do not draw a linear sequence of 4+ boxes connected by arrows. That is a bullet list, not a diagram. Only use a `flowchart` when there are branches, decisions, loops, or parallel paths. Do not use a flowchart to explain or define a concept; use a numbered list, a table, a `classDiagram`, or a `stateDiagram-v2` instead.
- Vary diagram types: use `flowchart` for data flow and decisions, `sequenceDiagram` for interactions between components, `classDiagram` for data models, and `stateDiagram-v2` for state transitions. Don't use `flowchart LR` for everything.
- Diagrams should illustrate the concept, not restate the title. A diagram showing `A --> B` with the same text as the slide title adds nothing. Show the internal structure, the decision points, or the transformation steps.

Content depth:

- Each slide should have enough content to stand on its own — not just a title and one sentence. Include concrete examples, code, comparisons, or visual structure that makes the point clear.
- Vary content structure across slides. Don't make every slide a title + code block + one-line explanation. Mix in: tables, side-by-side comparisons, annotated code, step-by-step traces, prediction questions, before/after contrasts, analogies, historical remarks, and visual metaphors.
- Code blocks should be realistic and illustrative, not trivially short. Show enough context (variables, types, and state) that the reader can trace what happens.
- Do not add answers, expected outputs, or result comments to code blocks unless the source slide already includes them. Code used as a prediction exercise, open question, or trace-for-the-audience should remain open; the reader or presenter supplies the result. If the source shows an output, preserve it exactly; otherwise keep the code block free of inline answers.
- Speaker notes should add teaching value — not just restate the slide. Include suggested questions to ask the audience, common misconceptions, or transitions to the next slide.

Slide density and overflow prevention:

- One main idea per slide. If a slide's content cannot fit comfortably, split it into two slides or move the detail to speaker notes. Do not try to pack every concept onto one slide.
- Respect these per-area line budgets.
  {{densityBudgets}}
- Speaker notes are where detail lives: common misconceptions, step-by-step narration, extra examples, and transition scripts should go in `<!-- notes: ... -->`, not on the slide.

Success criteria:

- Every slide has an appropriate layout with valid area markers.
- `theme:`, `background:`, and color directives follow the visual-styling instructions above: if a visual system is provided, use only the palette colors for `theme:` and `background:`; preserve mode keeps the originals; otherwise do not emit custom color directives.
- Headers use the correct hierarchy.
- All `[Diagram:]` markers are addressed with Mermaid.
- No ASCII art or text-based diagrams.
- No fabricated images: every `<img>` and `background: url(...)` in the output references an image from the input deck or a `reuse:<path>` directive.
- Each slide's content fits its layout — no area exceeds the density caps above. Split or trim overflowing slides.
- The JSON is valid and parseable.

Input markdown:
{{markdown}}
