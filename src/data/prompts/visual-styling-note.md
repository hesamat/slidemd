<!-- variant: absent -->

- Use the app's default neutral styling. Do not output `background:`, `theme:`, `style="..."`, `color`, `backgroundColor`, or `::: text-block { color="..." backgroundColor="..." }`. Use bold, headings, and layout to create emphasis, not color.

<!-- variant: absent-preserve -->

- The application will apply the source slide's visual identity (`theme:`, `background:`, colors, and background images) automatically after generation. Do not output `theme:`, `background:`, `color`, or `backgroundColor:` directives, and do not move images from one slide to another. Keep every image that belongs to the source slide in roughly the same role (inline `<img>` or `background: url(...)`), but do not add new image URLs. Use bold, headings, and layout to create emphasis, not color.

<!-- variant: present -->

- A visual system with a specific palette is provided in the instructions below. You MUST use it for every slide.
- For EVERY slide, emit `theme: light` or `theme: dark` and a `background:` directive. Use only the palette colors for `background: <hex>`, or use `background: url(<kept-image-path>)` for a kept image. Do not leave a slide without a `theme:` and `background:`.
- Do not invent your own colors. Do not use `color`, `backgroundColor`, or other colored text directives.
