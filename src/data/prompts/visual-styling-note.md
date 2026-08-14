<!-- variant: absent -->

- Use the app's default neutral styling. Do not output `background:`, `theme:`, `style="..."`, `color`, `backgroundColor`, or `::: text-block { color="..." backgroundColor="..." }`. Use bold, headings, and layout to create emphasis, not color.

<!-- variant: absent-preserve -->

- The application will apply the source slide's visual identity (`theme:`, `background:`, colors, and background images) automatically after generation. Do not output `theme:`, `background:`, `color`, or `backgroundColor:` directives, and do not move images from one slide to another. Keep every image that belongs to the source slide in roughly the same role (inline `<img>` or `background: url(...)`), but do not add new image URLs. Use bold, headings, and layout to create emphasis, not color.

<!-- variant: present -->

- A visual system with a specific 3-color palette is provided in the instructions below. You MUST use it for every slide.
- The palette is `base` (dark), `accent` (pop/attention), and `highlight` (light). Use only these three hex colors for `background:` and for any `color`/`backgroundColor` text-block directives.
- For EVERY slide, the frontmatter must include both `theme:` and `background:`. Do not omit either.
- `theme:` is a color scheme, not a palette color. It tells the renderer what ink color to use:
  - `theme: light` = light background, dark text and UI elements.
  - `theme: dark` = dark background, light text and UI elements.
- Pair `theme:` with `background:` for contrast:
  - `background: <base>` (dark) → `theme: dark`
  - `background: <accent>` (bright) → `theme: light`
  - `background: <highlight>` (white) → `theme: light`
- Correct examples:
  - `background: #0f172a` with `theme: dark`
  - `background: #06b6d4` with `theme: light`
  - `background: #ffffff` with `theme: light`
- Use only the 3 palette hex colors for `background: <hex>`, or use `background: url(<kept-image-path>)` for a kept image. Do not invent colors. Vary `background:` across the deck — do not make every slide `base`.
- For colored callouts, panels, tables, code, or emphasized text, you may use `::: text-block { markdown=true color="<hex>" backgroundColor="<hex>" } ... :::`. Only use the 3 palette colors for `color` and `backgroundColor`.
- Beat treatment: each slide brief includes `| beat: <beat>, energy: ..., contrast: ..., relationship: ... |`. Use it to shape density, hierarchy, layout, and imagery:
  - `continuation` — the default. Maintain normal content density and the established visual language.
  - `transition` — signal a chapter or idea change. Reduce density, shift hierarchy, and consider a `background:` change.
  - `punctuation` — one strong takeaway. Use a focus layout, minimal competing content, and an `accent` `background:` for emphasis.
  - `emotional` — imagery or atmosphere carries the message. Prefer a `full-image` or `media-span` layout when an image is available; keep text restrained.
  - `divider` — a chapter/section marker. Use minimal content, a large heading, and a clear `background:` or `theme:` change.
- Apply `energy`, `contrast`, and `relationship` as modifiers:
  - `energy: high` permits stronger hierarchy and more visual emphasis; `energy: low` favors quieter, text-heavy treatment.
  - `contrast: strong` permits a deliberate departure from the previous slide; `contrast: subtle` favors continuity.
  - `relationship: break` should produce a noticeable but intentional visual departure from the previous slide; `relationship: continue` should preserve visual continuity.
