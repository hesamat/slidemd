<!-- variant: absent -->

- Use the app's default neutral styling. Do not output `background:`, `theme:`, `style="..."`, `color`, `backgroundColor`, or `::: text-block { color="..." backgroundColor="..." }`. Use bold, headings, and layout to create emphasis, not color.

<!-- variant: absent-preserve -->

- The application will apply the source slide's visual identity (`theme:`, `background:`, colors, and background images) automatically after generation. Do not output `theme:`, `background:`, `color`, or `backgroundColor:` directives, and do not move images from one slide to another. Keep every image that belongs to the source slide in roughly the same role (inline `<img>` or `background: url(...)`), but do not add new image URLs. Use bold, headings, and layout to create emphasis, not color.

<!-- variant: present -->

- A visual system with a specific 3-color palette is provided in the instructions below. You MUST use it for every slide.
- The palette is `base` (dark), `accent` (pop/attention), and `highlight` (light).
- For EVERY slide, emit `theme:` and `background:`. Choose `theme` to contrast with the background: `theme: light` for `base` and `accent`, `theme: dark` for `highlight`.
- Use only the 3 palette hex colors for `background: <hex>`, or use `background: url(<kept-image-path>)` for a kept image. Do not invent colors. Vary `background:` across the deck — do not make every slide `base`.
- For colored callouts, panels, tables, code, or emphasized text, you may use `::: text-block { markdown=true color="<hex>" backgroundColor="<hex>" } ... :::`. Only use the 3 palette colors for `color` and `backgroundColor`.
