# HTML Slides — Quick Guide

A lightweight, browser-based slide deck with a presenter view.

This repo is optimized for **deterministic rendering** across laptop/projector displays:
- Slides render on a fixed 16:9 stage (1920×1080 coordinate system)
- The stage scales to fit the window (letterboxing/pillarboxing adds whitespace; content doesn’t reflow)
- No runtime Tailwind/CDN dependencies

Authoring is **Markdown-first**:
- Edit `decks/deck.md`
- Slides are separated by `---`
- Use `layout:` + `@area` markers to place content
- Prefer plain Markdown (avoid custom HTML/classes unless you truly need them)

## Run Locally

Because the runtime fetches and parses `decks/deck.md` in dev mode, serve the repo root over HTTP (not `file://`). In build output, the parsed deck is embedded so it works fully offline.


```powershell
npm install
npm run dev
```

Opens automatically at http://localhost:8000/index.html.

## File Layout

- `index.html` — main deck page
- `deck.js` — deck runtime (rendering, navigation, presenter UI)
- `decks/deck.md` — deck content (Markdown + `layout:` + `@area` markers)
- `tools/` — build and export scripts
- `dist/deck.html` — generated **single-file** deck for sharing (build output)
- `dist/deck.pdf` — generated deterministic PDF (optional)

## Authoring Format (deck.md)

Slides are separated by `---`.

The default input file is `decks/deck.md`.

Each slide supports:
- A heading (e.g. `# Title` or `## Title`) used to generate a stable slide id + presenter/ARIA title
- `layout:` (CSS Grid shorthand-like string or preset name)
- `align:` (optional; currently supports `center` for main-only slides)
- `background:` (optional; CSS background value for slide-specific backgrounds)
- `theme:` (optional; `light` or `dark` for per-slide theme control)
- `<!-- notes: ... -->` speaker notes
- `@areaName` markers to route content to named grid areas

Example:

```markdown
# Two Column Example
layout: "header header" "main media" / 1fr 1fr
<!-- notes: Say the quiet part out loud here -->

@header
## Side by Side

@main
- Point A
- Point B

@media
![diagram](images/waterfall.png)
```

Notes:
- Any text before the first `@area` marker goes to `@main`.
- You can use any area names you want; common ones are `header`, `main`, `footer`, `media`, `secondary`.

### Custom Layouts (CSS Grid)

`layout:` ultimately sets `grid-template-areas`, `grid-template-columns`, and `grid-template-rows` on the slide’s grid.

The format is:

- **Rows (areas):** one or more quoted strings, each string is a `grid-template-areas` row
	- Use double quotes (`"...") or single quotes (`'...'`).
	- Separate area names with spaces: `"header header"` or `"main media"`.
	- Use `.` for an empty cell (standard CSS Grid behavior): `"main ."`.
- **Optional row sizes:** you can put a row size *after a row* (before the next quoted row, or before the `/`).
	- If you don’t specify a size, the runtime guesses:
		- Rows containing typical content areas (`main`, `media`, `sidebar`, `secondary`, etc.) expand with `minmax(0, 1fr)`.
		- Other rows (often headers/footers) size to content with `auto`.
	- If you use custom area names like `"body"`, it may be treated as a header-like row and become `auto` — in that case, set the row size explicitly.
- **Columns:** everything after the first `/` becomes `grid-template-columns`.
	- Example: `/ 1fr 480px` or `/ 300px 1fr`.
	- If you omit `/ ...`, columns default to `1fr`.

Area-name matching is literal and case-sensitive at the CSS level. Because `@area` markers are normalized to lowercase, prefer lowercase names in your layout strings too.

Examples:

**1) Header + two columns + footer**

```markdown
# Custom Header + Two Column
layout: "header header" auto "main media" minmax(0, 1fr) "footer footer" auto / 1fr 1fr

@header
## Title on top

@main
- Left side

@media
![img](images/waterfall.png)

@footer
Small footer text
```

**2) Fixed-width sidebar + content**

```markdown
# Sidebar Layout
layout: "sidebar main" minmax(0, 1fr) / 320px 1fr

@sidebar
- Agenda
- Links

@main
## Content
```

**3) Empty cells with `.` (spacer column)**

```markdown
# Spacer Column
layout: "main . media" minmax(0, 1fr) / 1fr 48px 1fr

@main
Left

@media
Right
```

Tips:
- Keep every row the same number of cells (same count of names/dots), like normal CSS Grid.
- If a named area appears in the layout but you don’t provide `@thatArea` content, it renders as an empty region (useful for reserved space).
- If you *do* provide `@area` content but forget to include that area name in the layout, it still renders (appended after the layout-defined areas), but it won’t be positioned how you expect—add it to your `layout:` string.

### Layout Presets

Instead of writing full CSS Grid syntax, you can use preset names:

- `focus` - Single centered content area
- `two-column` - Equal two-column layout
- `left-heavy` - Two columns with left side larger (2:1)
- `right-heavy` - Two columns with right side larger (1:2)
- `header-content` - Header row with content below
- `header-two-column` - Header row with two columns below
- `title-slide` - Full-screen centered content
- `three-column` - Three equal columns
- `sidebar-content` - Fixed sidebar (300px) with flexible content
- `content-sidebar` - Flexible content with fixed sidebar (300px)

Example:
```markdown
# Simple Layout
layout: two-column

@main
Left content here

@media
Right content here
```

### Slide Backgrounds

Use the `background:` directive to set custom backgrounds per slide:

```markdown
# Gradient Background
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)

Content here...

---

# Image Background
background: url(images/hero.jpg) center/cover

Content here...

---

# Solid Color
background: #1a1a1a
theme: dark

Light text on dark background
```

The build process automatically inlines local image backgrounds as data URIs.

### Theming

Use `theme: light` or `theme: dark` to override the default theme for specific slides:

```markdown
# Dark Slide
theme: dark

This slide uses light text on dark background

---

# Light Slide  
theme: light

This slide uses dark text on light background
```

## Syntax Highlighting (PrismJS)

Use fenced code blocks. Language aliases like `js`, `ts`, `py`, `ps` work:

```markdown
```js
console.log('hi')
```
```

The build output `dist/deck.html` inlines PrismJS so it works offline.

## Math / LaTeX (KaTeX)

Math is rendered automatically inside text blocks using KaTeX auto-render. Supported delimiters:

- Inline: `$...$` or `\\(...\\)`
- Display: `$$...$$` or `\\[...\\]`

The build output `dist/deck.html` inlines KaTeX + fonts so it works offline.

## Build a Single HTML for Students

This produces a **single** HTML file with CSS/JS + images inlined as data URIs:

```powershell
npm install
npm run build
```

Output: `dist/deck.html`

Tip: preview the built deck with:

```powershell
npm run preview
```

Then open http://localhost:8000/deck.html

## Deterministic PDF Export

```powershell
npm run pdf
```

Output: `dist/deck.pdf`

## Multiple Decks / Lecture Backup

This repo includes multiple deck sources under `decks/`, including an original lecture deck JSON backup in `decks/deck.lecture.backup.json` and Markdown variants like `decks/deck.lecture.md`.

To build/preview a different deck, swap it in as `decks/deck.md`:

```powershell
Copy-Item .\decks\deck.lecture.md .\decks\deck.md -Force
npm run build
```

## Tips
- Images/videos: Use absolute URLs or relative paths and serve them via the same local server.
- Optional fields: Omit what you don’t need; the renderer handles missing fields.
- When printing to PDF: if `dist/deck.pdf` is open in a viewer, the exporter will write a timestamped alternative file.
