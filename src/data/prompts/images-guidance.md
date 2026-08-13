<!-- variant: not-sent -->

No images were sent with this request — omit `keepImages` from every plan entry.
<!-- variant: sent -->

When images are provided:

- You will also receive the raw images from each slide (background images are excluded). Use these images to assess their content and quality when deciding whether to keep, rewrite, or merge slides.
- In the plan, each entry can specify `keepImages`: an array of 0-based indices into that source slide's extracted images (in order of appearance). Omit to keep all images; use `[]` to drop all images from a slide.
- When merging slides, `keepImages` indices are still per-source-slide, not indices into a combined set — the same array is applied independently to each slide listed in `source`.
- You are not limited to placing images in a `@media` area. Images can be freely positioned using `position: relative` with `left`, `top`, `width`, and `height` style attributes on the `<img>` tag. Use this when an image needs custom placement that doesn't fit the standard area layout.
- Kept images are reused in the new deck with their exact original source paths — never rename them and never invent new image URLs. The execute phase may only place images that exist in the source deck.
- If an image is low quality, redundant, or doesn't add value, drop it (don't include it in `keepImages`).
