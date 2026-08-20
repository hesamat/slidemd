<!-- variant: preserve -->

The application will apply the source slide's visual identity (`theme:`, `background:`, colors, and background images) automatically after generation. Do not output `theme:`, `background:`, `color`, or `backgroundColor:` directives, and do not move images from one slide to another. Keep every image that belongs to the source slide in roughly the same role (inline `<img>` or `background: url(...)`), but do not add new image URLs.
<!-- variant: discard -->

Do not preserve the original color theme, colored text, backgrounds, or visual language. Strip all `theme:`, `background:`, and `color`/`backgroundColor` directives. Do not introduce new colors, `theme:`, `background:`, or colored text. The app provides its own neutral color scheme.

<!-- variant: remix -->

Do not preserve the original color theme, colored text, backgrounds, or visual language. The source slide's `theme:`, `background:`, `color:`, `backgroundColor:`, and `area-bg-*:` directives have already been stripped. You are free to choose a new professional color scheme, `theme:`, `background:`, and colored text as appropriate for the content. For every slide, include both `theme:` and `background:` as the first lines of the `content` string, before the first `@area` marker. Vary backgrounds across the deck.
