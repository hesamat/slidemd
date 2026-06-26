# SlideMD - Markdown Presentations

A lightweight, browser-based slide deck with a presenter view.

This project prioritizes:

- Deterministic rendering on a fixed 16:9 stage (1920x1080 coordinate system)
- Window scaling without content reflow (letterboxing or pillarboxing adds whitespace)
- Offline-friendly builds with no Tailwind or CDN dependencies at runtime
- Markdown-first authoring with simple directives

## Run Locally

Because the runtime fetches and parses `docs/example.md` in dev mode, serve the repo root over HTTP (not `file://`). In build output, the parsed deck is embedded so it works fully offline.

```powershell
npm install
npm run dev
```

Opens automatically at http://localhost:8000/index.html.

## Repository Layout

- `index.html` - main deck page
- `deck.js` - deck runtime (rendering, navigation, presenter UI)
- `docs/example.md` - default deck content (Markdown with `layout:` and `@area` markers)
- `tools/` - build and export scripts
- `dist/example.html` - generated single-file deck for sharing (build output)
- `dist/example.pdf` - generated deterministic PDF (optional)

## Authoring docs/example.md

- Slides are separated by `---`; the default input file is `docs/example.md`.
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

More layouts, backgrounds, and theming recipes live in [docs/example.md](docs/example.md).

## Layout Presets

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
  - **New slide** (Alt+N) — adds a new slide immediately after the right-clicked slide
  - **Duplicate slide** (Alt+D)
  - **Delete slide** (Alt+⌫)
- **"+ Add Slide"** button pinned below the thumbnail list — appends a new slide to the end of the deck.

The context menu is keyboard-driven too: the same Alt+N / Alt+D / Alt+⌫ shortcuts work anywhere in edit mode, not just from the menu.

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

Image selected (contextual — only the image overlay is active):

- `C`: Center image on slide
- `W`: Fit image to area width
- `]`: Bring to front
- `[`: Send to back
- `R`: Replace image (opens the picker)
- Arrow keys / `Shift+Arrow`: move 1px / 10px
- `Escape`: deselect
- `Delete`: delete image from the slide

Note: We use `Alt+` for new slide and duplicate (instead of `Ctrl+N` / `Ctrl+D`) because those `Ctrl` combinations are reserved by the browser for "new window" and "bookmark" and cannot be intercepted by web pages.

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
- Diagrams via Mermaid. Use ` ```mermaid ` code blocks. See [docs/example.md](docs/example.md) for syntax guide.

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
- Single-file HTML: `npm run build` (outputs `dist/example.html` with assets inlined)
- Preview built output: `npm run preview` (serves `dist/example.html`)
- Deterministic PDF: `npm run pdf` (outputs `dist/example.pdf`)
- If Chromium is missing after `npm update`, run `npx playwright install chromium` once; `npm run pdf` also runs that install step automatically.

## Multiple Decks / Lecture Backup

The `decks/` folder includes alternatives. To build a different source, pass it as an argument to the build script (for example: `node tools/build.mjs decks/deck.md`).

## Tips

- Images/videos: Use absolute URLs or relative paths served from the same local server.
- Optional fields: Omit what you do not need; the renderer handles missing fields.
- When printing to PDF: if `dist/example.pdf` is open in a viewer, the exporter writes a timestamped alternative file.
