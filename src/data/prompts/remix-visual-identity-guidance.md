<!-- variant: preserve -->

The application will apply the source slides' visual identity (`theme:`, `background:`, colors, and background images) automatically after the execute phase. Do not output `theme:`, `background:`, `color`, or `backgroundColor:` directives, and do not move images from one slide to another. Keep every image that belongs to the source slide in roughly the same role (inline `<img>` or `background: url(...)`), but do not add new image URLs or copy images from other slides.
<!-- variant: discard -->

Do not preserve the original color theme, colored text, backgrounds, or visual language. The source deck's `theme:`, `background:`, and `color`/`backgroundColor` directives have already been stripped. The execution AI is free to choose a new professional color scheme, `theme:`, `background:`, and colored text as appropriate for the remixed content. It may vary backgrounds across the deck.
