<!-- variant: absent -->

- Use the app's default neutral styling. Do not output `background:`, `theme:`, `style="..."`, `color`, `backgroundColor`, or `::: text-block { color="..." backgroundColor="..." }`. Use bold, headings, and layout to create emphasis, not color.

<!-- variant: absent-preserve -->

- The application will apply the source slide's visual identity (`theme:`, `background:`, colors, and background images) automatically after generation. Do not output `theme:`, `background:`, `color`, or `backgroundColor:` directives, and do not move images from one slide to another. Keep every image that belongs to the source slide in roughly the same role (inline `<img>` or `background: url(...)`), but do not add new image URLs. Use bold, headings, and layout to create emphasis, not color.

<!-- variant: present -->

- A visual direction is provided below. It describes the mood and the rules of thumb for choosing `layout:`, `theme:`, and `background:`. Follow it closely — it is the primary authority on background choices for this deck. You are free to pick any professional colors, gradients, or kept images that match the direction. Do not feel constrained to a specific 3-color palette.
- For EVERY slide, include both `theme:` and `background:` as the first lines of the `content` string, before the first `@area` marker. Example: `"content": "theme: dark\nbackground: #1e293b\n\n@header\n# Title\n\n@main\n- Point"`. Do not omit either. Do not put them anywhere except the top of the content string.
- `theme:` is a color scheme, not a color. It tells the renderer what ink color to use:
  - `theme: light` = light/bright background, dark text and UI elements.
  - `theme: dark` = dark background, light text and UI elements.
- Pair `theme:` with `background:` for readable contrast:
  - dark background → `theme: dark`
  - light/bright background → `theme: light`
  - kept image as background → choose `theme:` based on whether the image is mostly dark or light
- `background:` must be a solid hex color, gradient, or kept image. Do not use `transparent`, `none`, or an empty value — a see-through background makes text and diagrams (e.g. Mermaid) unreadable. Do not combine a color with an image in the same directive (e.g. avoid `url(images/bg.png) #1a1a2e`). Use the image by itself and choose `theme:` to match it. Do not use CSS named colors such as `red`, `white`, or `dark`; always use an explicit hex, `rgb()`, `hsl()`, or gradient value.
- Vary `background:` across the deck. These rules are mandatory:
  - No two consecutive slides may share the same `background:` value.
  - At least 30% of slides must use `theme: light` with a light/bright `background:`.
  - Do not reuse the same `background:` value more than twice in the entire deck.
  - Do not default to a single dark color (e.g. navy or slate) for most slides. Mix dark, neutral, and light backgrounds as the visual direction suggests.
  - Do not use `#0f172a` as a default. If you need a dark background, pick from a variety of darks such as `#1a1a2e`, `#1e293b`, `#0d1117`, `#181818`, `#1c1c1c`, `#141414`, `#202030`, `#2d1b3d`, `#1a2a3a`, `#252030`, etc.
  - For light backgrounds, pick from a variety of lights such as `#f8f9fa`, `#f0f0e8`, `#eef2f7`, `#faf3e0`, `#f5f5dc`, `#e8e8e8`, `#f0ede4`, `#fdf6e3`, etc.
- Beat treatment: each slide brief includes `| beat: <beat>, energy: ..., contrast: ..., relationship: ... |`. Use it to shape density, hierarchy, layout, and imagery:
  - `continuation` — the default. Use `header-content` or `two-column`. Follow the visual direction's default background.
  - `example` / `practice` — code, tables, or step-by-step content. Use `two-column` or `header-content`.
  - `punctuation` — one strong takeaway. Use `focus` only for a single short statement; if it is a list or has multiple points, use `header-content` with a bright, light, or image background.
  - `transition` — signal a chapter or idea change. Reduce density, shift hierarchy, and consider a `background:` or `theme:` change.
  - `emotional` — imagery or atmosphere carries the message. Prefer a `full-image` or `media-span` layout when an image is available; otherwise use `header-content` with an atmospheric background.
  - `divider` — a chapter/section marker. Use minimal content, a large heading, and a clear `background:` or `theme:` change.
- Apply `energy`, `contrast`, and `relationship` as modifiers:
  - `energy: high` permits stronger hierarchy and more visual emphasis; `energy: low` favors quieter, text-heavy treatment.
  - `contrast: strong` permits a deliberate departure from the previous slide; `contrast: subtle` favors continuity.
  - `relationship: break` should produce a noticeable but intentional visual departure from the previous slide; `relationship: continue` should preserve visual continuity.

Use the visual direction provided in the prompt to choose colors and images, but trust your judgement.
