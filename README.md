# SlideMD - Markdown Presentations

A lightweight, browser-based slide deck with a presenter view.

This project prioritizes:
- Deterministic rendering on a fixed 16:9 stage (1920x1080 coordinate system)
- Window scaling without content reflow (letterboxing or pillarboxing adds whitespace)
- Offline-friendly builds with no Tailwind or CDN dependencies at runtime
- Markdown-first authoring with simple directives

## Run Locally

Because the runtime fetches and parses `decks/deck.md` in dev mode, serve the repo root over HTTP (not `file://`). In build output, the parsed deck is embedded so it works fully offline.

```powershell
npm install
npm run dev
```

Opens automatically at http://localhost:8000/index.html.

## Repository Layout

- `index.html` - main deck page
- `deck.js` - deck runtime (rendering, navigation, presenter UI)
- `decks/deck.md` - deck content (Markdown with `layout:` and `@area` markers)
- `tools/` - build and export scripts
- `dist/deck.html` - generated single-file deck for sharing (build output)
- `dist/deck.pdf` - generated deterministic PDF (optional)

## Authoring decks/deck.md

- Slides are separated by `---`; the default input file is `decks/deck.md`.
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

More layouts, backgrounds, and theming recipes live in [docs/authoring-examples.md](docs/authoring-examples.md).

## Layout Presets

## Keyboard Shortcuts

### Navigation
- `Space`, `ArrowRight`, `ArrowDown`, `PageDown`: Next slide
- `ArrowLeft`, `ArrowUp`, `PageUp`, `Backspace`: Previous slide
- `Home`: Go to first slide
- `End`: Go to last slide
- `G`: Open "Go to slide" prompt

### Stage Controls (all windows)
- `F`: Toggle fullscreen for the stage

### Presenter Panel Only
- `P`: Toggle viewer window (present)
- `E`: Toggle edit mode
- `B`: Toggle break overlay (press again or hit Space/Arrow/Page keys to dismiss)
- `R`: Reload the deck
- `D`: Toggle theme

Notes:
- The presenter panel includes a `Break length` dropdown (5–15 minutes, default 10). When a break is started the break slide shows the time you'll return (current time + selected minutes).


Use preset names instead of full CSS grid strings:

- `focus` - Single column content area
- `two-column` - Equal two-column layout
- `left-heavy` - Two columns with left side larger (2:1)
- `right-heavy` - Two columns with right side larger (1:2)
- `header-content` - Header, content, footer stacked
- `header-two-column` - Header row with two columns and footer
- `title-slide` - Full-screen centered content
- `three-column` - Three equal columns
- `sidebar-content` - Fixed sidebar (300px) with flexible content
- `content-sidebar` - Flexible content with fixed sidebar (300px)

## Rendering Features

- Syntax highlighting via Prism; the build inlines assets so it works offline.
- Math via KaTeX auto-render. Inline: `$...$` or `\(...\)`; display: `$$...$$` or `\[...\]`.
- Diagrams via Mermaid. Use ` ```mermaid ` code blocks. See [docs/authoring-examples.md](docs/authoring-examples.md#mermaid-diagrams) for syntax guide.

## Build and Export

- Development server: `npm run dev` (opens http://localhost:8000/index.html)
- Single-file HTML: `npm run build` (outputs `dist/deck.html` with assets inlined)
- Preview built output: `npm run preview` (serves `dist/deck.html`)
- Deterministic PDF: `npm run pdf` (outputs `dist/deck.pdf`)

## Multiple Decks / Lecture Backup

The `decks/` folder includes alternatives. To build or preview a different source, swap it in the build.mjs `decks/deck.md`:

## Tips
- Images/videos: Use absolute URLs or relative paths served from the same local server.
- Optional fields: Omit what you do not need; the renderer handles missing fields.
- When printing to PDF: if `dist/deck.pdf` is open in a viewer, the exporter writes a timestamped alternative file.
