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
- Preserves author alt text: `descr` on a picture (PowerPoint's "Alt Text") becomes the image's `alt` attribute, and diagram labels become the diagram image's alt text
- Preserves the original slide order from the presentation
- Extracts images into an `images/` folder
- Converts slide content to Markdown with layout inference
- Tags fenced code blocks with their detected language by default (configurable via the dialog's **Code language** option)
- Does not modify the original `.pptx`
- Is instant — no AI processing during import

Use the [AI editing](ai-editing.md) features to refine slides afterward.

### Command line

Convert decks without opening the app. Run commands from the SlideMD project
folder after installing dependencies with `npm install`:

```bash
npm run pptx -- --help
npm run pptx -- path/to/deck.pptx
```

The default output is an app-openable deck folder next to the input, containing
`deck/deck.md` and `deck/images/`. Use `--out` to choose another output
directory. Quote paths that contain spaces.

```bash
# Choose where the generated deck folder goes
npm run pptx -- path/to/deck.pptx --out path/to/output

# Write a single .textpack archive, or produce both formats
npm run pptx -- path/to/deck.pptx --format textpack
npm run pptx -- path/to/deck.pptx --format both

# Convert multiple files, or every .pptx directly inside a folder
npm run pptx -- first.pptx second.pptx
npm run pptx -- path/to/presentations/ --out path/to/output

# Convert only the first 5 slides and also create a PDF
npm run pptx -- path/to/deck.pptx --limit 5 --pdf
```

Options:

- `--format md|textpack|both` selects the output format (`md` is the default).
- `--out <dir>` sets the output directory. By default, output is placed beside
  each input file.
- `--limit <n>` converts only the first _n_ slides.
- `--code-language <mode>` tags code fences. `auto` (default) detects a
  language per block, `none` leaves fences untagged, and a language such as
  `javascript` forces that language for all code blocks. Run `--help` for the
  supported language names.
- `--no-content-images`, `--no-backgrounds`, and `--no-theme` omit content
  images, background images, and theme/background color directives respectively.
- `--pdf` also renders a PDF; it works with `md` and `both` formats.
- `--port <n>` sets the Vite port used during conversion (normally selected
  automatically).

The converter uses Playwright's Chromium browser. If Chromium is not installed,
run `npx playwright install chromium` once. The original `.pptx` is left
untouched.

## CLI Dev Server

```bash
npm run dev:cli -- slides.md
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
