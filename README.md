# SlideMD — Markdown Presentations

A lightweight, browser-based slide deck with a presenter view.

This project prioritizes:

- Deterministic rendering on a fixed 16:9 stage (1920x1080 coordinate system)
- Window scaling without content reflow (letterboxing or pillarboxing adds whitespace)
- Offline-friendly builds with no Tailwind or CDN dependencies at runtime
- Markdown-first authoring with simple directives

## Download

Download the latest release from [GitHub Releases](https://github.com/hesamat/html-presentation/releases/latest). Each release includes:

- `slides.html` — a single self-contained file that works offline in any browser
- `slides.pdf` — a pre-generated PDF of the example deck

### Browser Support

SlideMD works in all modern browsers. The CLI dev server and File System Access API features (open/save files from disk) require Chromium-based browsers (Chrome, Edge, Brave). Other browsers (Firefox, Safari) can view decks and use keyboard shortcuts but cannot open or save files directly from the filesystem.

## Run Locally

```bash
npm install
npm run dev
```

Opens automatically at http://localhost:8000/index.html.

The dev server starts two processes:

- **CLI server** (`tools/dev-server.mjs`) — serves the deck API, images, and file watching
- **Vite** — serves the frontend with module transforms and proxies API calls to the CLI server

To open a specific deck:

```bash
npm run dev -- path/to/slides.md
```

## Primary Format: `.md + images/`

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

### Sharing: `.textpack`

For single-file sharing, export to `.textpack` (a ZIP archive containing the markdown and images):

```bash
node tools/dev-server.mjs slides.md  # open the deck
# Then use the export menu to create a .textpack
```

### PPTX Import with AI Post-Processing

Import PowerPoint files via **Menu → Import PPTX**. The import extracts text, images, and layouts from `.pptx` files and converts them to SlideMD format.

After import, you can optionally post-process with AI:

- **Fix Issues** — AI cleans up formatting, headers, code blocks, and common extraction problems
- **AI Inspiration** — AI reorganizes and redesigns the entire presentation with better flow, layouts, and Mermaid diagrams

To use AI features, configure an API key in **Settings** (OpenRouter). See [docs/ai-prompt-template.md](docs/ai-prompt-template.md) for details on how the AI processes your slides.

## Repository Layout

- `index.html` - main deck page
- `deck.js` - deck runtime (rendering, navigation, presenter UI)
- `docs/example/slides.md` - example deck (diffable in git)
- `docs/example/images/` - example images
- `tools/` - build and export scripts
- `tools/dev-server.mjs` - CLI dev server
- `dist/slides.html` - generated single-file deck (build output)
- `dist/slides.pdf` - generated PDF (build output)

## Authoring docs/example/slides.md

- Slides are separated by `---`; the default input file is `docs/example/slides.md`.
- Each slide supports: `layout:`, `background:`, `theme:`, `hidden:`, `<!-- notes: ... -->`, and `@area` markers to route content.
- Text before the first `@area` marker flows into `@main`.
- Hidden slides: set `hidden: true`; add `?showHidden=1` to the URL to include them when reviewing.

Minimal example:

```markdown
layout: header-content

@header

## Slide Title

@main

- Point A
- Point B
```

More layouts, backgrounds, and theming recipes live in [docs/example/slides.md](docs/example/slides.md).

## Layout Presets

Use preset names instead of full CSS grid strings:

- `title-slide` - Full-screen centered content
- `header-content` - Header, content, footer stacked
- `two-column` - Two equal columns with optional header and footer
- `media-span` - Two columns with media spanning full height (1.2:0.8)
- `left-heavy` - Two columns with left side larger (2:1)
- `right-heavy` - Two columns with right side larger (1:2)
- `three-column` - Three equal columns

## Edit Mode Tips

Edit mode uses a CodeMirror-based editor with helpers to reduce layout guesswork:

- Search inside the slide with Ctrl/Cmd+F (and Ctrl/Cmd+G to jump results).
- Autocomplete for `layout:`, `theme:`, `background:`, `hidden:`, and `@area` markers.
- Slash commands: type `/` to insert common directives and blocks.
- Type ``` or ~~~ to expand fenced blocks quickly.
- Click the area tags in the preview to jump the cursor to that section.
- Overflow indicators highlight content that does not fit an area.
- The layout picker shows area tags for each preset.
- Mermaid helper panel inserts common diagram skeletons.
- Warnings show on the slide when layout or area markers are mismatched.
- **Image drag reorder**: Drag images across columns to reposition them in the markdown.
- **Dashed area outlines**: Toggle visibility of layout grid outlines with the Columns button.

## Keyboard Shortcuts

### Navigation

- `Space`, `ArrowRight`, `ArrowDown`, `PageDown`: Next slide
- `ArrowLeft`, `ArrowUp`, `PageUp`, `Backspace`: Previous slide
- `Home`: Go to first slide
- `End`: Go to last slide
- `G`: Open "Go to slide" prompt

### Stage Controls (all windows)

- `F`: Toggle fullscreen for the stage

### Editor Window (work in both viewing and edit mode)

- `E`: Toggle edit mode
- `R`: Reload the deck
- `T`: Toggle the **app** theme (light/dark UI chrome)

### Editor Window — Viewing Mode Only

- `P`: Toggle viewer window (present) — hidden in the footer when in edit mode

### Editor Window — Edit Mode Only (also hidden in footer)

- `B`: Toggle break overlay (press again or hit Space/Arrow/Page keys to dismiss)

Notes:

- `B` (break) and `P` (present) are intentionally disabled in edit mode — the break is for the presenter view, not for editing, and the presenter window is only useful when presenting, not when writing. Both buttons are also hidden from the footer in edit mode.
- The presenter panel includes a `Break length` dropdown (5–15 minutes, default 10). When a break is started the break slide shows the time you'll return (current time + selected minutes).

### Edit Mode

Edit mode (toggled with `E`) is the slide-editing workspace. All edit-mode shortcuts are discoverable in the **Format** dropdown and in the right-click context menu on slide thumbnails.

**Format dropdown** (in the editor body header) — modify the current slide:

- **Layout** — Layout, Columns
- **Appearance** — Background, Styles, Theme
- **Insert** — Image, Diagram

**Slide operations** — done from the slide-thumbnails sidebar:

- **Right-click** any slide thumbnail for a context menu with:
  - **New slide** (Alt+N) — opens the layout picker to add a new slide after the right-clicked slide
  - **Duplicate slide** (Alt+D)
  - **Delete slide** (Alt+Backspace)
- **"+ Add Slide"** button pinned below the thumbnail list — appends a new slide to the end of the deck.

The context menu is keyboard-driven too: the same Alt+N / Alt+D / Alt+Backspace shortcuts work anywhere in edit mode, not just from the menu.

There are two distinct themes and two distinct shortcuts:

- **`T` (single key)** toggles the global **app theme** — the light/dark chrome around the slides (top bar, editor, footer). The top-bar theme toggle button is an alternative.
- **`Alt+T` (modifier)** toggles the current **slide's theme** — the `theme:` directive on the current slide, which controls the slide's own light/dark background. This is the same as the "Theme" item in the Format dropdown.

**Saving changes** is done from the main app menu (top-bar dropdown, under "Toggle Edit Mode"). The menu also shows the `Ctrl+S` shortcut. Save is only meaningful in edit mode — clicking it from viewing mode shows a notification asking you to enter edit mode first.

Structural (work even while typing in the editor):

- `Ctrl+S`: Save changes
- `Alt+N`: New slide (opens the layout picker)
- `Alt+D`: Duplicate current slide
- `Alt+Backspace`: Delete current slide (with confirmation)

Insert content (work even while typing in the editor):

- `Alt+I`: Insert image
- `Alt+L`: Open layout picker for the current slide
- `Alt+A`: Toggle column resize handles (Adjust Columns)
- `Alt+M`: Toggle the Mermaid helper panel
- `Alt+B`: Pick slide background
- `Alt+T`: Toggle the current slide's theme (per-slide `theme:` directive)
- `Alt+S`: Toggle the slide styles panel

Note: We use `Alt+` for new slide and duplicate (instead of `Ctrl+N` / `Ctrl+D`) because those `Ctrl` combinations are reserved by the browser for "new window" and "bookmark" and cannot be intercepted by web pages.

## Rendering Features

- Syntax highlighting via Prism; the build inlines assets so it works offline.
- Math via KaTeX auto-render. Inline: `$...$` or `\(...\)`; display: `$$...$$` or `\[...\]`.
- Diagrams via Mermaid. Use ` ```mermaid ` code blocks. See [docs/example/slides.md](docs/example/slides.md) for syntax guide.

### Math Formatting (KaTeX)

**Inline math** (single `$` - stays on one line):

```markdown
$E = mc^2$
$\text{Time complexity: } O(n \log n)$
```

**Display math** (double `$$` - centered, larger):

For multi-line content with `\begin{aligned}` or similar, the `$$` delimiters must be on their own lines:

```markdown
$$
\begin{aligned}
x &= a + b \\
  &= c + d
\end{aligned}
$$
```

For single-line display math, delimiters can be on the same line:

```markdown
$$E = mc^2$$
```

**Note:** KaTeX has limited LaTeX support. Some advanced packages (`amssymb`, etc.) are not available. Use `\textrm{}` instead of `\text{}` inside math environments like `\begin{cases}` or `\begin{aligned}`.

## Build and Export

- Development server: `npm run dev` (opens http://localhost:8000/index.html)
- Single-file HTML: `npm run build` (outputs `dist/slides.html` with assets inlined)
- Preview built output: `npm run preview` (serves `dist/slides.html`)
- Deterministic PDF: `npm run pdf` (outputs `dist/slides.pdf`)
- If Chromium is missing after `npm update`, run `npx playwright install chromium` once; `npm run pdf` also runs that install step automatically.

## Multiple Decks / Lecture Backup

The `decks/` folder includes alternatives. To build a different source, pass it as an argument to the build script (for example: `node tools/build.mjs decks/deck.md`).

## Tips

- Images/videos: Use absolute URLs or relative paths served from the same local server.
- Optional fields: Omit what you do not need; the renderer handles missing fields.
- When printing to PDF: if `dist/slides.pdf` is open in a viewer, the exporter writes a timestamped alternative file.

## Testing

```bash
npm test
```

Runs the full Vitest suite (unit tests for parser, layout, PPTX conversion, image handling, and more).

## `.textpack` Format

A `.textpack` is a ZIP archive for single-file sharing. Structure:

```
my-deck.textpack
  text.markdown      ← the slide markdown
  assets/            ← images referenced in the markdown
    diagram.png
    photo.jpg
```

- The markdown file is always named `text.markdown`
- Images go in the `assets/` folder
- Image references in the markdown use relative paths: `![alt](images/photo.png)`
- The CLI dev server can serve `.textpack` files directly
- Open via Menu → Open File in the app

## License

MIT — see [LICENSE](LICENSE) for details.
