layout: title-slide

@title

# SlideMD

### Markdown-Based Presentations

Create beautiful slides with plain Markdown. No installation, no accounts, no build steps.

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

<img src="assets/icon.png" alt="SlideMD Icon" style="position: relative; left: 0px; top: 5px; width: 720px; height: 696px; border-radius: 19px; box-shadow: rgba(120, 120, 120, 0.4) 0px 6px 20px; border: none; object-fit: contain; cursor: move" />

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

layout: left-heavy

@header

## Slide Structure & Syntax

@main

Use `---` to separate slides. Define the layout first, then place content with `@area` markers.

| Layout           | Areas                                             |
| ---------------- | ------------------------------------------------- |
| `header-content` | `@header` `@main` `@footer`                       |
| `title-slide`    | `@title`                                          |
| `two-column`     | `@header` `@main` `@media` `@footer`              |
| `media-span`     | `@header` `@main` `@media` `@footer`              |
| `left-heavy`     | `@header` `@main` `@media` `@footer`              |
| `right-heavy`    | `@header` `@main` `@media` `@footer`              |
| `three-column`   | `@header` `@main` `@media` `@secondary` `@footer` |

@media

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

### Editor Features

- **Live preview** – See changes instantly as you type
- **Slide thumbnails** – Jump to any slide while editing
- **Quick actions** – Add, delete, duplicate, reorder slides
- **Layout Picker** – Choose presets with filled templates
- **Autocomplete** – `layout:`, `theme:`, `@area` directives
- **Slash commands** – Type `/` for quick insertions
- **Mermaid helpers** – Insert diagram scaffolds
- **Search** – `Ctrl+F` to find within slides
- **Context menu** – Right-click thumbnails for slide operations

@media

![Edit mode screenshot](assets/edit-mode.png)

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

### Inserting Images

**Drag and drop** an image onto a slide in Edit Mode, or use the image picker from the toolbar.

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

- **In .textpack files** – Drag & drop saves images into the `assets/` folder. Paths like `images/photo.png` resolve automatically.
- **In .md files** – Use full URLs (`https://...`). Local relative paths only work if served by the dev server.
- **PPTX import** – Images are extracted and saved alongside the `.md` file in an `images/` folder.

### Formats

- PNG, JPG, SVG, GIF
- Images auto-scale to fit the slide area
- Combine with `theme: dark` for overlay effects

---

layout: two-column

@header

## Supported File Formats

@main

### Markdown (.md)

Plain markdown files with optional frontmatter for layout and theme. Use full URLs for images when working with `.md` files directly.

### Textpack (.textpack)

A ZIP archive containing `text.markdown` and `assets/`. Can be opened directly via Menu → Open File or served by the CLI dev server.

### How It Works

- Open `.md` or `.textpack` files via Menu → Open File
- PPTX import creates a `.md` file + `images/` folder with embedded images
- Export as `.textpack` to share a self-contained archive with images

@media

### Open Deck Modal

The Open Deck modal provides a quick way to open presentations.

### Recent Decks

The modal remembers your recently opened decks for quick access.

---

layout: two-column

@header

## PPTX Import

@main

### Convert PowerPoint to SlideMD

Import existing PowerPoint presentations and convert them to SlideMD format with automatic layout detection.

### Features

- **Layout detection**: Automatic two-column, title, and content layouts
- **Image extraction**: Pulls images from PPTX and embeds them
- **Code block detection**: Identifies monospace text as code
- **Dark theme detection**: Auto-sets theme when background is dark
- **Per-deck folder**: Organizes imported files in dedicated folders

### How to Import

1. Click Menu → Import PPTX
2. Select your PowerPoint file
3. Review conversion settings
4. Click Convert
5. Edit mode opens for manual cleanup

@media

### Conversion Options

- **Keep backgrounds**: Preserve slide backgrounds
- **Import images**: Extract and embed images
- **Language detection**: Auto-detect code languages

### Post-Conversion

After import, you can:

- Edit the converted markdown directly
- Adjust layouts with the layout picker
- Fine-tune image positions
- ...

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

layout: header-content

@title

## Ready to Present!

@main

1. **Press `E`** – Validate slide flow and fit
2. **Press `P`** – Open viewer on your presentation display
3. **Press `F`** – Go fullscreen and deliver

### Learn More

- **README.md** – Installation and setup
- **GitHub** – Contribute, report issues, or star the project

@footer

Open source • Built for educators • Free forever
