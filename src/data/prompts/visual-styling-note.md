<!-- variant: absent -->

- Use the app's default neutral styling. Do not output `background:`, `theme:`, `style="..."`, `color`, `backgroundColor`, or `::: text-block { color="..." backgroundColor="..." }`. Use bold, headings, and layout to create emphasis, not color.

<!-- variant: absent-preserve -->

- The application will apply the source slide's visual identity (`theme:`, `background:`, colors, and background images) automatically after generation. Do not output `theme:`, `background:`, `color`, or `backgroundColor:` directives, and do not move images from one slide to another. Keep every image that belongs to the source slide in roughly the same role (inline `<img>` or `background: url(...)`), but do not add new image URLs. Use bold, headings, and layout to create emphasis, not color.

<!-- variant: present -->

- A visual system with a specific palette, typography, composition, imagery, motifs, and contrast rules is provided in the instructions below. Use it for `theme:`, `background:`, layout, imagery treatment, and pacing. You may only use the palette colors listed in the visual system; do not invent your own colors. Use `theme: light` or `theme: dark` to ensure text contrast, and `background: <hex>` or `background: url(<kept-image-path>)` with palette colors.
