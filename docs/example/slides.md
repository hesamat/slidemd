layout: title-slide

@title

# Welcome to SlideMD

### Markdown-Based Presentations

### Create beautiful slides with plain Markdown.

---

layout: two-column

@header

## What is SlideMD?

@main

An open-source tool for creating and presenting slides using plain Markdown. Built for technical educators who need code highlighting, math notation, and diagrams without the overhead of traditional presentation software.

### Features

- **Markdown syntax** with pre-made layouts
- **Live editing** with side-by-side preview
- **Presenter view** with speaker notes and timer
- **Code blocks** with syntax highlighting
- **Math rendering** via KaTeX
- **Diagrams** via Mermaid
- **Export** to PDF or standalone HTML

@media

<img src="images/icon.png" alt="SlideMD Icon" style="position: relative; left: 0px; top: 5px; width: 720px; height: 696px; border-radius: 19px; box-shadow: rgba(120, 120, 120, 0.4) 0px 6px 20px; border: none; object-fit: contain; cursor: move" />

---

layout: two-column

<!-- notes: Your talking points! Speaker notes appear only in the presenter view, not on the audience screen. -->

@header

## Quick Start

@main

### Getting Started

1. **Open your deck** – Load a `.md` or `.textpack` file via Menu → Open File
2. **Press `P`** – Open viewer window for your audience
3. **Move viewer** – Drag it to projector/external display
4. **Press `F`** – Go fullscreen on viewer

@media

### Essential Shortcuts

- Press **`E`** to toggle Edit Mode
- Navigate with **Arrow Keys** or **Space** or mouse scroll
- Add speaker notes using HTML comments before the `layout` tag:
  ```html
  <!-- notes: Your talking points here -->
  ```
- Notes appear only on your presenter dashboard.

---

layout: "header header" auto "main media" minmax(0, 1fr) "footer footer" auto / 1.8755fr 1.1245fr
@header

## Slide Structure & Syntax

@main

| Layout           | Areas                                             |
| ---------------- | ------------------------------------------------- |
| `header-content` | `@header` `@main` `@footer`                       |
| `title-slide`    | `@title`                                          |
| `focus`          | `@header` `@main` `@footer`                       |
| `full-image`     | `@main`                                           |
| `two-column`     | `@header` `@main` `@media` `@footer`              |
| `media-span`     | `@header` `@main` `@media` `@footer`              |
| `left-heavy`     | `@header` `@main` `@media` `@footer`              |
| `right-heavy`    | `@header` `@main` `@media` `@footer`              |
| `three-column`   | `@header` `@main` `@media` `@secondary` `@footer` |

@media

Use `---` to separate slides. Define the layout first, then place content with `@area` markers.

### Example

```markdown
layout: two-column

@header

## Slide Title

@main
Left column content.

@media
Right column content.
```

@footer

- `hidden: true` or `hide: true` skips a slide by default. Add `?showHidden=1` in the URL to override.

---

layout: left-heavy

@header

## Code, Math & Diagrams

@main

### Code Highlighting

Fenced code blocks with language identifier:

```python
def fibonacci(n: int) -> int:
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)
```

### Math with KaTeX

Inline: `$x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}$` → $x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}$

Block: $$\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}$$

@media

### Mermaid Diagrams

```mermaid
graph TD
    A[Write Markdown] --> B[Live Preview]
    B --> C{Ready?}
    C -->|No| A
    C -->|Yes| D[Export PDF]

    style A fill:#e1f5fe
    style B fill:#fff3e0
    style D fill:#e8f5e9
```

---

background: linear-gradient(135deg, #c7d2fe 0%, #f5d0fe 100%)

layout: two-column

@header

## Edit Mode

@main

Press `E` to toggle split-screen editing with live preview.

### Writing Tools

- **Live preview:** See changes instantly as you type
- **Autocomplete:** `layout:`, `theme:`, `@media` directives
- **Slash commands:** Type `/` for quick insertions
- **Mermaid helper:** Insert diagram scaffolds
- **Search:** `Ctrl+F` to find within slides

### Slide Management

- **Slide thumbnails:** Jump to any slide while editing
- **Quick actions:** Add, delete, duplicate, reorder slides
- **Layout Picker:** Choose presets with filled templates
- **Context menu:** Right-click thumbnails for slide operations

@media

![Edit mode screenshot](images/edit-mode.png)

### Visual Guides

- Area outlines show the layout grid
- Overflow warnings when content is too long
- Slide warnings for layout/area mismatches

---

layout: two-column

@header

## Speaker Notes

@main

### Adding Notes

Place an HTML comment as the **first line** of any slide, before the `layout:` directive:

```markdown
<!-- notes: Your talking points here -->

layout: two-column

@main
Slide content...
```

### Where Notes Appear

- **Presenter view** (press `P`) – Shows notes alongside current and next slide
- **Audience view** – Notes are never visible
- **PDF export** – Notes are excluded by default

@media

### Presenter Dashboard

| Panel              | Purpose                     |
| ------------------ | --------------------------- |
| **Current Slide**  | What the audience sees      |
| **Next Slide**     | Preview of upcoming content |
| **Speaker Notes**  | Your private notes          |
| **Break Controls** | Timer for breaks            |

---

layout: two-column

@header

## Images & Media

@main

To **insert an image**, drag and drop it onto a slide in Edit Mode, or use the image picker from the toolbar.

### Resizing & Positioning

- Drag corner handles to resize
- Double-click to reset to original size
- Use the properties panel for precise dimensions
- Drag images across columns to reorder them in the markdown

### Background Images

Add `background: url(...)` to slide frontmatter for full-slide backgrounds. Use a remote URL:

```yaml
background: url(https://example.com/hero.png)
```

@media

### How Images Work

- **In .textpack files** – Images are stored in the `assets/` folder inside the archive. When opened with the CLI dev server, images are uploaded to the server.
- **In .md files** – Use full URLs (`https://...`). Relative paths like `images/photo.png` work when served by the dev server.

### Formats

- PNG, JPG, SVG, GIF
- Images auto-scale to fit the slide area
- Combine with `theme: dark` for overlay effects

---

layout: two-column

@header

## Supported File Formats

@main

### Opening Decks

| Format        | Description                                                |
| ------------- | ---------------------------------------------------------- |
| **.md**       | Plain Markdown with frontmatter. Use full URLs for images. |
| **.textpack** | ZIP with `text.markdown` + `assets/`. Self-contained.      |

### Exporting

- **HTML** – Standalone file with all assets inlined. Share or host anywhere.
- **PDF** – One-click export via Menu → Export, or use the CLI build + PDF tools.
- **.textpack** – Package your deck with images into a single shareable archive.

@media

### Open Deck Workflow

1. **Menu → Open File** – Load `.md` or `.textpack`
2. **Recent Decks** – Quickly reopen recent presentations from the modal
3. **CLI dev server** – `npm run dev:cli` serves your deck with live reload

### PPTX Import (Experimental)

- Import PowerPoint files via Menu → Import PPTX
- Extracts images into an `images/` folder
- Converts slide content to Markdown with layout hints
- Original `.pptx` is not modified
- Optionally post-process with AI to fix formatting or redesign the deck

---

layout: two-column

@header

## AI Post-Processing

@main

Optionally, enhance the result with AI when importing a PPTX.

### Fix Issues

- Cleans up formatting, headers, and code blocks
- Fixes broken links and list formatting
- Normalizes header levels across slides
- Conservative — preserves working slides as-is

### AI Inspiration

- Redesigns layout and visual structure
- Reorganizes for better flow and pacing
- Converts diagrams to Mermaid code blocks (selective — only where they represent true flowcharts/processes)
- Adds speaker notes to key slides
- Splits dense slides into focused ones

@media

### Getting Started

1. Open **Settings** from the main menu
2. Enter your OpenRouter API key
3. Select a model (DeepSeek V4 Flash is the default)
4. Import a PPTX file
5. Choose **Fix Issues** or click **AI Inspiration**

---

layout: two-column
theme: dark
background: #3e1d5f

@header

## Custom Layouts & Themes

@main

### CSS Grid Syntax

Define custom layouts with Grid. Add `minmax(0, 1fr)` to content Rows.

```markdown
layout: "header header" "main media" / 2fr 1fr
```

### Tips

- Use `.` for empty grid cells
- Column sizes: `fr`, `px`, `%`, `auto`
- Theme modes: `theme: dark` or `theme: light`
- Background: `#hex`, `linear-gradient(...)`, or `url(...)`

@media

### Examples

**Two equal columns:**

```yaml
layout: "left right" / 1fr 1fr
```

**Fixed Width Centered:**

```yaml
layout: "header" auto "main" 1fr / 800px
```

**Hidden Slide:**

```yaml
layout: header-content
hidden: true
```

---

layout: two-column

@header

## Markdown Styling

@main

### Text Formatting

- `**Bold**` for **important concepts**
- `*Italic*` for _definitions or emphasis_
- `` `Code` `` for `filenames` and commands
- `[Links](https://example.com)` for references
- `~~Strikethrough~~` for ~~removed content~~

### Lists

**Unordered** – Use for related points:

- Use `-` at the beginning of the line

**Ordered** – For sequences:

1. Use item number followed by dot at the beginning of the line

@media

### Tables

| Feature           | Support   |
| ----------------- | --------- |
| Code highlighting | Prism.js  |
| Math rendering    | KaTeX     |
| Diagrams          | Mermaid   |
| Export            | PDF, HTML |

### Blockquotes

Use for key takeaways and callouts:

> **Pro tip:** Combine markdown with inline HTML for custom styling when needed.

---

layout: two-column

@header

## Presentation Flow

@main

### The Presenter Dashboard

When you open SlideMD, you see the presenter dashboard with:

| Panel              | Purpose                     |
| ------------------ | --------------------------- |
| **Current Slide**  | What the audience sees      |
| **Next Slide**     | Preview of upcoming content |
| **Speaker Notes**  | Your private notes          |
| **Break Controls** | Timer for breaks            |

@media

### Typical Workflow

1. **Open your deck** – Load your `.md` file
2. **Press `P`** – Open viewer window for audience
3. **Drag to second screen** – Move to projector/display
4. **Press `F`** – Go fullscreen on viewer
5. **Present** – Navigate with arrow keys or space

> _The break timer shows your audience when you'll return based on the selected duration (5-15 minutes)._

---

layout: two-column

@header

## Keyboard Shortcuts Reference

@main

### Navigation

| Key               | Action                    |
| ----------------- | ------------------------- |
| `→` / `Space`     | Next slide                |
| `←` / `Backspace` | Previous slide            |
| `Home`            | First slide               |
| `End`             | Last slide                |
| `G`               | Go to slide (type number) |

@media

### Presentation Controls

| Key | Action                   |
| --- | ------------------------ |
| `P` | Open/close viewer window |
| `F` | Toggle fullscreen        |
| `E` | Toggle edit mode         |
| `B` | Start break timer        |
| `T` | Toggle dark/light theme  |
| `R` | Reload deck from file    |

---

layout: header-content

@header

## Quick Authoring Reference

@main

### Rules & Features

1. Default Layout is `header-content`
2. First `@area` defaults to `@main`. Text placed before an area also goes to `@main`.
3. Slash commands in Edit mode (`E`): Type `/` to insert layouts, areas, Mermaid diagrams, or `<!-- notes: -->` tags.
4. Auto-completion happens automatically on directives.
5. Export your presentation via Menu (⋮) → Export → PDF or HTML. Make sure to close edit mode before printing.

### Hiding slides

```markdown
layout: header-content
hidden: true

@main
This slide won't show in the viewer unless `?showHidden=1` is in the URL.
```

---

layout: focus

@header

## Ready to Present?

@main

**Press `E`** – Validate slide flow and fit
**Press `P`** – Open viewer on your presentation display
**Press `F`** – Go fullscreen and deliver

### Learn More

**README.md** – Installation and setup
**GitHub** – Contribute, report issues, or star the project

@footer

Open source • Built for educators • Free forever
