Refine this SlideMD presentation. Return the result as JSON.

Content strategy:

- Improve wording: make headers concise, tighten bullet points, replace vague text with specific statements.
- Pick the best layout for each slide's content — don't default to header-content if a two-column, focus, or table layout would be clearer.
- Use tables for 2-3 item comparisons.
- Use two-column for diagrams, code, or dense content.
- Add speaker notes where helpful: `<!-- notes: ... -->`.
- Preserve each slide's `theme:` directive. Keep `background:` directives unless they don't fit the restructured content — you may change or drop backgrounds that are decorative overlays or don't match the slide's purpose.
- Preserve `<img>` tags from the input. You may reposition images using `style="position: relative; left: ...; top: ...; width: ...;"` on the `<img>` tag for custom placement that doesn't fit the standard area layout.
- Drop images that are low quality, redundant, or don't add value to the slide.
- If the input appears to be from a PPTX import (mismatched layouts, images in wrong areas, verbose text boxes), fix the layout to match the actual content, reposition images to where they make sense, and tighten the text.
- If a slide has a `<!-- brief: ... -->` comment, follow that brief. A brief saying "merge" means combine the following slides into one output slide.
- Follow the FIDELITY instruction that follows this prompt for whether to polish, improve, or rewrite.

Success criteria:

- Every slide has an appropriate layout with valid area markers.
- Headers use the correct hierarchy.
- Code blocks have proper spacing.
- All `[Diagram:]` markers are addressed.
- The JSON is valid and parseable.

Input markdown:
{{markdown}}
