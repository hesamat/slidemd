# PPTX Layout Detection

How the PPTX importer decides which layout to use for each slide.

## Files involved

| File                                | Role                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/data/pptx-layout-inference.js` | `inferLayout()` — pure function, decides layout from element positions                        |
| `src/data/pptx-to-slide-md.js`      | `convertSlide()` — renders the layout into markdown with `@header`/`@main`/`@media`/`@footer` |
| `src/data/pptx-slide-config.js`     | Layout constants (`LAYOUT.*`), thresholds (`CONFIG.*`)                                        |

## Decision flow (`inferLayout`)

```
1. No content?                         → HEADER_CONTENT
2. Image-only (no text)?
   ├─ ≥3 dominant images              → MEDIA_SPAN
   ├─ 2 side-by-side images           → TWO_COLUMN
   └─ otherwise                       → HEADER_CONTENT
3. Header detected? (top 22%, ≤150 chars, no bullets, not massive)
4. Has media (images/tables/charts)?
   ├─ header + two columns + text     → check both columns:
   │   ├─ one side image-only (with a dominant image) → MEDIA_SPAN (image side becomes @media)
   │   └─ both sides have text        → TWO_COLUMN
   ├─ no header + ≥2 dominant images  → MEDIA_SPAN
   ├─ 1 dominant image + text body    → MEDIA_SPAN
   └─ header present                  → HEADER_CONTENT
5. No media?
   ├─ spread row (horizontal pair)    → TWO_COLUMN
   ├─ short content (<300 chars)      → TITLE_SLIDE (slide 0) / FOCUS
   ├─ header + body → code detection?
   │   ├─ fenced code block           → TWO_COLUMN / FOCUS (by width)
   │   ├─ ≥2 lines matching keywords → TWO_COLUMN / FOCUS (by width)
   │   └─ no code                     → HEADER_CONTENT
   └─ otherwise                       → FOCUS
```

## Rendering guards (in `convertSlide`)

After `inferLayout` returns, the renderer applies several corrections:

### MEDIA_SPAN decision (in `inferLayout`)

The side-agnostic `MEDIA_SPAN` decision lives entirely in `inferLayout`: when
one column holds only images (with a dominant image) and the other holds body
text, the layout is `MEDIA_SPAN` regardless of which side the image is on —
image-left layouts previously rendered the image in `@main` and the TEXT in
`@media`.

### Two-column pre-check (lines ~364–382)

If `TWO_COLUMN` split would leave one side empty, downgrade to `HEADER_CONTENT`.
Exception: a single wide element (>80% of slide width) is kept as `TWO_COLUMN`
because it likely represents merged two-column content from PPTX.

### Empty-@main guard (MEDIA_SPAN rendering, lines ~640–680)

If MEDIA_SPAN rendering would produce an empty `@main` (all body elements are
dominant images), downgrade to `HEADER_CONTENT` and put images in `@main`.

## Code detection

The code detection in `inferLayout` checks for:

1. **Fenced code blocks**: ` ```...``` ` in the content
2. **Keyword lines**: lines matching `def`, `function`, `print(`, `for (`, etc.

The keyword check requires **≥2 matching lines** to avoid false positives from
inline code in numbered lists (e.g., `1. print("hello")`).

## Edge cases

| Scenario                                               | Problem                                       | Fix                                                          |
| ------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------ |
| MEDIA_SPAN with only header + image                    | `@main` would be empty                        | Empty-@main guard downgrades to HEADER_CONTENT               |
| `print()` in a numbered list                           | Triggers code detection → TWO_COLUMN          | Requires ≥2 matching lines                                   |
| Wide element spanning both columns                     | Pre-check would downgrade to HEADER_CONTENT   | Wide-element exception keeps TWO_COLUMN                      |
| Footer text in body area                               | Would affect layout inference                 | Footer elements always excluded                              |
| `extractHeader` disagrees with `inferLayout` on header | Body text disappears from @main               | Empty-@main guard catches this                               |
| Middle image straddling midpoint in two-column         | Element unclassified by 1.2x threshold → lost | Unclassified elements assigned to nearest column             |
| Image on the LEFT column with text on the right        | Image in `@main`, text in `@media`            | Side-agnostic MEDIA_SPAN decision in `inferLayout`           |
| Small icon/logo beside the heading                     | Treated as content image                      | Header-band filter drops small images (`maxHeaderBandRatio`) |
