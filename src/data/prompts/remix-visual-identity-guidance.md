<!-- variant: preserve -->

The application will apply the source slides' visual identity (`theme:`, `background:`, colors, and background images) automatically after the execute phase. Do not output `theme:`, `background:`, `color`, or `backgroundColor:` directives, and do not move images from one slide to another. Keep every image that belongs to the source slide in roughly the same role (inline `<img>` or `background: url(...)`), but do not add new image URLs or copy images from other slides.
<!-- variant: discard -->

Do not preserve the original color theme, colored text, backgrounds, or visual language. Strip all `theme:`, `background:`, and `color`/`backgroundColor` directives. Do not introduce new colors, `theme:`, `background:`, or colored text. The app provides its own neutral color scheme.
