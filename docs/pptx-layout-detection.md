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
`@media`. If neither side qualifies cleanly, the converter uses the historical
right-side `media-span-right` variant as its deterministic tie-breaker; in the
two-image-columns case, left-side images become `@media` and right-side images
remain in `@main`. When the fallback picks the right side but all dominant
images sit on the left, the render branch still emits the layout with `@media`
on the right, so the slide mirrors the source geometry rather than matching it.

### Two-column pre-check

If `TWO_COLUMN` split would leave one side empty, downgrade to `HEADER_CONTENT`.
Exception: a single wide element (>80% of slide width) is kept as `TWO_COLUMN`
because it likely represents merged two-column content from PPTX.

### Empty-@main guard (MEDIA_SPAN rendering)

If MEDIA_SPAN rendering would produce an empty `@main` (all body elements are
dominant images), downgrade to `HEADER_CONTENT` and put images in `@main`.

## Code detection

The code detection in `inferLayout` checks for:

1. **Fenced code blocks**: ` ```...``` ` in the content
2. **Keyword lines**: lines matching `def`, `function`, `print(`, `for (`, etc.

The keyword check requires **≥2 matching lines** to avoid false positives from
inline code in numbered lists (e.g., `1. print("hello")`).

A wide code element (>80% of slide width) with ≥10 non-empty lines uses
`TWO_COLUMN` so merged two-column content can be split. Two refinements, both
grounded in corpus analysis of real decks:

- **Fenced blocks are single snippets.** A fenced code block spanning the slide
  is a single code demo, not merged columns. It only uses `TWO_COLUMN` when the
  total slide content is substantial (`>= maxTitleLength`); otherwise it uses
  `FOCUS` — the two-column path would only be downgraded to `HEADER_CONTENT`
  after a failed split, which is worse for a short centered code demo.
- **Unfenced raw code keeps the historical behavior.** PPTX merged-column code
  arrives as unfenced raw text, so wide + long unfenced code still splits into
  two columns.

## Edge cases

| Scenario                                               | Problem                                       | Fix                                                                     |
| ------------------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------- |
| MEDIA_SPAN with only header + image                    | `@main` would be empty                        | Empty-@main guard downgrades to HEADER_CONTENT                          |
| `print()` in a numbered list                           | Triggers code detection → TWO_COLUMN          | Requires ≥2 matching lines                                              |
| Wide element spanning both columns                     | Pre-check would downgrade to HEADER_CONTENT   | Wide-element exception keeps TWO_COLUMN                                 |
| Footer text in body area                               | Would affect layout inference                 | Footer elements always excluded                                         |
| `extractHeader` disagrees with `inferLayout` on header | Body text disappears from @main               | Empty-@main guard catches this                                          |
| Middle image straddling midpoint in two-column         | Element unclassified by 1.2x threshold → lost | Unclassified elements assigned to nearest column                        |
| Image on the LEFT column with text on the right        | Image in `@main`, text in `@media`            | Side-agnostic MEDIA_SPAN decision in `inferLayout`                      |
| Small icon/logo beside the heading                     | Treated as content image                      | Header-band filter drops small images in the shared `bodyTopRatio` band |

## Shape & diagram rendering (Phase 14.9, #117)

Shape groups and diagrams (detected by `PptxExtractor.#isManualDiagram()` /
`#detectTopLevelDiagrams()`) are rendered to PNG screenshots instead of
flattening to bullet lists or a `[Diagram: ...]` marker.

### Pipeline

```
PptxExtractor.extract()
  └─ #processElement() — preserves full shape geometry (path, fill, border, transform)
      └─ #isManualDiagram() → #shapesToDiagram() — stashes constituent shapes on the diagram element
  └─ renderDiagramsToPng()  ← post-pass (async, after EMF/TIFF conversion)
      └─ cropSlideToDiagram()   — high-fidelity: render slide with @aiden0z/pptx-renderer,
      |                            hide non-diagram elements, crop to diagram bbox
      └─ fallback: buildShapeSvg() + renderSvgToPng()   — SVG → canvas → toDataURL
      └─ trimTransparentMargins() — crops transparent borders
      └─ replaces diagram element with an image element (labels → alt text)
```

The presentation is parsed/built once per import and shared across all
diagram crops (see `parsePresentation()`). Grouped diagrams (`<p:grpSp>`) skip
the crop path because the renderer positions group children relative to the
group container; they render via the SVG builder instead. Both paths produce
images with a transparent background so the diagram sits on any slide theme.
The crop path also rejects blank crops (a crop with almost no opaque pixels
falls back to SVG) so a failed position match can never emit an empty image.

`#detectTopLevelDiagrams()` only keeps connectors that actually touch a
box-like shape (within 20 pt). Decorative side arrows that merely float next
to a shape (e.g. the arrows pointing at a sudoku's rows/columns) are dropped
instead of being cropped into the diagram image. When that leaves a single
`table` element, the sudoku renders as a styled CSS grid: tables with a
meaningful share of coloured cells (≥25% with luminance below 230/255) keep
their colours as a `.fullpage-grid` (preserving the source aspect ratio),
instead of flattening to a plain markdown table.

### Files involved

| File                               | Role                                                           |
| ---------------------------------- | -------------------------------------------------------------- |
| `src/data/pptx-diagram-cropper.js` | High-fidelity slide-crop renderer (`cropSlideToDiagram`)       |
| `src/data/pptx-shape-renderer.js`  | `renderDiagramsToPng()`, `buildShapeSvg()`, `renderSvgToPng()` |
| `src/data/pptx-extractor.js`       | Preserves shape geometry; stashes `shapes` on diagram elements |
| `src/data/pptx-image-converter.js` | `trimTransparentMargins()` (shared with EMF/TIFF conversion)   |

### Fallback chain

1. **Renderable shapes + canvas available + crop path runs** → high-fidelity
   PNG from the slide crop (top-level diagrams only).
2. **Grouped diagram / no crop / blank crop / crop throws** → SVG builder.
3. **No renderable shapes** (no `path`, `shapType`, or fill) → diagram element
   unchanged → existing `[Diagram: ...]` → bullets path.
4. **Canvas unavailable** (jsdom, SSR) → diagram element unchanged → same fallback.

### Labels as alt text

When a shape group has text content, the labels are joined into a concise
caption that becomes the rendered image's `alt` text, so the diagram stays
searchable and accessible without dumping labels into the slide body. Markdown
emphasis characters, newlines and duplicate labels are stripped before the
caption is emitted.

### Font replacement (offline note)

Microsoft fonts that are not installed on the machine (Tw Cen MT, Calibri,
Cambria, Segoe UI, …) are replaced in the rendered DOM with metrically
compatible Google Fonts (League Spartan, Carlito, Caladea, Open Sans, Verdana)
so text metrics match the original PPTX. The fonts load lazily from the Google
Fonts CDN with a short timeout and are skipped when offline or when the
replacement fonts are already installed locally. This is the one deliberate
runtime CDN dependency in the import path; it degrades gracefully (text may
overflow) and never blocks or fails the import. Self-hosting the font files
under `public/fonts/` would remove the dependency entirely.
