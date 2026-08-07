Refine this SlideMD presentation. Return the result as JSON.

Content strategy:

- Improve wording: make headers concise, tighten bullet points, replace vague text with specific statements.
- Pick the best layout for each slide's content — don't default to header-content if a two-column, focus, or table layout would be clearer.
- Use tables for 2-3 item comparisons.
- Use two-column for diagrams, code, or dense content.
- Add speaker notes where helpful: `<!-- notes: ... -->`.
- Drop images that are low quality, redundant, or don't add value to the slide.
- If the input appears to be from a PPTX import (mismatched layouts, images in wrong areas, verbose text boxes), fix the layout to match the actual content, reposition images to where they make sense, and tighten the text.
- If a slide has a `<!-- brief: ... -->` comment, follow that brief. A brief saying "merge" means combine the following slides into one output slide.
- Follow the mode and visual-identity instructions that follow this prompt.

Visual styling:

- Pick ONE coherent visual theme for the whole deck: a light palette with dark text, a dark palette with light text, or a high-contrast accent palette. Use it consistently across slides — do not make each slide look random.
- Every slide must have a `background:` directive. Use solid colors, gradients, or image URLs. The background should support the chosen theme and be readable with the text color.
- Every slide must have a `theme:` directive that matches the background darkness:
  - If the `background:` is dark or has a dark image, set `theme: dark` so the default text renders light.
  - If the `background:` is light, set `theme: light` so the default text renders dark.
- Use a small set of accent colors repeatedly (e.g., one primary highlight color, one secondary). Keep backgrounds within the same family and vary them subtly for rhythm.
- Place content images using `<img>` tags with appropriate `position: relative` + `left`/`top`/`width` for custom placement when the layout allows it.
- For full-bleed visuals, use `layout: full-image` with the image as the `@main` content.
- When `preserveVisualIdentity` is true, keep existing `theme:` and `background:` directives unless they clearly don't fit.

Diagrams:

- Use Mermaid for ALL diagrams (flowcharts, sequence diagrams, class diagrams, etc.). Mermaid syntax: `​```mermaid` code blocks.
- Do NOT use ASCII art, box-drawing characters, or text-based diagrams (e.g. `─┐`, `├──>`, `──>`). These render poorly and are not interactive.
- If a concept needs a visual, use Mermaid or a table instead.

Success criteria:

- Every slide has an appropriate layout with valid area markers.
- Every slide has a `background:` directive.
- Headers use the correct hierarchy.
- All `[Diagram:]` markers are addressed with Mermaid.
- No ASCII art or text-based diagrams.
- The JSON is valid and parseable.

Input markdown:
{{markdown}}
