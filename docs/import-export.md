# Import & Export

## File Formats

### `.md + images/` (primary)

Presentations are plain Markdown files with a sidecar `images/` folder:

```
my-presentation/
  slides.md          ← diffable in git
  images/
    diagram.png      ← tracked in git
    photo.jpg
```

- Images are referenced with relative paths: `![alt](images/photo.png)`
- The CLI dev server serves images from disk during development
- For distribution, images can be served via GitHub raw URLs or embedded as data URIs (build output)

### `.textpack` (sharing)

A `.textpack` is a ZIP archive for single-file sharing:

```
my-deck.textpack
  text.markdown      ← the slide markdown
  assets/            ← images referenced in the markdown
    diagram.png
    photo.jpg
```

- The markdown file is always named `text.markdown`
- Images go in the `assets/` folder
- Open via Menu → Open File in the app
- The CLI dev server can serve `.textpack` files directly
- Export from the app menu to create a `.textpack`

## PPTX Import

Import PowerPoint files via **Menu → Import PPTX**. The import:

- Extracts text, images, and layouts from `.pptx` files
- Renders detected shape groups and diagrams (flowcharts, Venn diagrams, concept maps) as PNG images instead of flattening them to bullet lists
- Preserves the original slide order from the presentation
- Extracts images into an `images/` folder
- Converts slide content to Markdown with layout inference
- Does not modify the original `.pptx`
- Is instant — no AI processing during import

Use the [AI editing](ai-editing.md) features to refine slides afterward.

## CLI Dev Server

```bash
node tools/dev-server.mjs slides.md
```

Serves the deck with live reload. Also handles image uploads and deck saves via API.

To open a specific deck:

```bash
npm run dev -- path/to/slides.md
```

## Build & Export

| Command           | Output                                               |
| ----------------- | ---------------------------------------------------- |
| `npm run dev`     | Dev server at http://localhost:8000/index.html       |
| `npm run build`   | `dist/slides.html` — single self-contained HTML file |
| `npm run preview` | Serves `dist/slides.html` for preview                |
| `npm run pdf`     | `dist/slides.pdf` — deterministic PDF via Playwright |

- The build inlines all assets (CSS, JS, images, KaTeX fonts) so the HTML file works offline.
- If Chromium is missing after `npm update`, run `npx playwright install chromium` once; `npm run pdf` also runs that install step automatically.
- When printing to PDF: if `dist/slides.pdf` is open in a viewer, the exporter writes a timestamped alternative file.

## Multiple Decks

The `decks/` folder includes alternatives. To build a different source, pass it as an argument:

```bash
node tools/build.mjs decks/deck.md
```
