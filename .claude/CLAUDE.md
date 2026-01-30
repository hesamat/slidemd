# Project-Specific Instructions

## Project Overview
This is **SlideMD** - a lightweight, browser-based slide deck system that creates presentations from Markdown. The key priorities are:
- Deterministic 16:9 stage rendering (1920x1080 coordinate system)
- Window scaling without content reflow (letterboxing/pillarboxing)
- Offline-friendly builds (no Tailwind or CDN dependencies at runtime)
- Markdown-first authoring with layout directives

## Git Workflow
- When finishing a task, suggest a git commit command
- The main branch is `main`; feature branches should follow `feature/` or `fix/` convention

## Available Scripts
```bash
npm run dev      # Development server at http://localhost:8000/index.html
npm run build    # Build single-file HTML to dist/deck.html (inlines assets)
npm run pdf      # Export to dist/deck.pdf using Playwright (deterministic PDF)
npm run preview  # Serve built output at http://localhost:8000
```

## Export Options

### Via the App UI (Development Mode)
When running `npm run dev`, you can export directly from the browser:

**HTML Export:**
- Click the menu button (☰) → "Export HTML"
- Downloads a self-contained HTML file with all assets inlined
- Handled by: [src/renderer/html-export-manager.js](src/renderer/html-export-manager.js)
- Works offline after download (includes embedded deck data)

**PDF Export:**
- Click the menu button (☰) → "Print PDF"
- Opens browser print dialog - save as PDF
- Handled by: [src/renderer/print-manager.js](src/renderer/print-manager.js)
- Removes emojis for PDF compatibility (for older PDF viewers)

### Via Build Scripts (Command Line)
For automated builds or CI/CD:

**HTML Build:**
```bash
npm run build
```
- Outputs to `dist/example.html` by default
- Uses: [tools/build.mjs](tools/build.mjs)
- Same as app export but CLI-based

**PDF Export:**
```bash
npm run pdf
```
- Outputs to `dist/example.pdf` using Playwright
- Uses: [tools/pdf.mjs](tools/pdf.mjs)
- Generates deterministic, timestamped output if file is in use

## Code Organization

### Source Structure ([src/](src))
- **core/** - Core utilities (asset-loader, element-gatherer, utils)
- **data/** - Data parsing (layout-data, layout-parser, markdown-parser, deck-loader)
- **editor/** - Live editing features (markdown-editor, edit-controller, layout-picker, slide-thumbnails)
- **engine/** - Presentation logic (deck-controller, slide-navigator, keyboard-handler, break-manager, reload-manager, role-manager)
- **renderer/** - Display logic (slide-renderer, stage-scaler, theme-manager, content-enhancer, html-export-manager, print-manager, notification)
- **ui/** - UI actions (ui-actions)

### Entry Points
- [index.html](index.html) - Main deck page (dev mode)
- [src/main.js](src/main.js) - Application entry point
- [tools/build.mjs](tools/build.mjs) - Build script
- [tools/pdf.mjs](tools/pdf.mjs) - PDF export script

## Deck Authoring

### Default Location
- [docs/example.md](docs/example.md) - Default deck content
- To build a different deck, update the build.mjs argument

### Slide Syntax
- Slides separated by `---`
- Frontmatter fields: `layout:`, `background:`, `theme:`, `hidden:`
- Speaker notes: `<!-- notes: ... -->`
- Area markers: `@main`, `@header`, `@footer`, `@left`, `@right`, `@center`, etc.

### Layout Presets
Use these preset names (defined in [src/data/layout-data.js](src/data/layout-data.js)):
- `focus` - Single column content area
- `two-column` - Equal two columns
- `left-heavy` / `right-heavy` - Two columns (2:1 or 1:2 ratio)
- `header-content` - Header, content, footer stacked
- `header-two-column` - Header with two columns and footer
- `title-slide` - Full-screen centered
- `three-column` - Three equal columns
- `sidebar-content` / `content-sidebar` - Fixed sidebar (300px) with flexible content

### Rendering Features
- **Code**: Prism.js syntax highlighting (auto-detected by language)
- **Math**: KaTeX - inline `$...$` or `\(...\)`; display `$$...$$` or `\[...\]`
- **Diagrams**: Mermaid in ```mermaid code blocks

#### Math Formatting (KaTeX)

**Inline math** (single `$` - stays on one line):
```markdown
$E = mc^2$
$\text{Time complexity: } O(n \log n)$
```

**Display math** (double `$$` - centered, larger):

For multi-line content with `\begin{aligned}` or similar, the `$$` delimiters MUST be on their own lines:
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

**Important KaTeX limitations:**
- KaTeX has limited LaTeX support compared to full LaTeX
- Advanced packages like `amssymb` are NOT available
- Use `\textrm{}` instead of `\text{}` inside math environments (`\begin{cases}`, `\begin{aligned}`, etc.)
- Symbols like `\square`, `\blacksquare` require workarounds (use `\text{QED}`, `\text{■}`, Unicode, or emojis instead)

## Development Guidelines

### Core Principles
1. **Deterministic rendering**: All positioning uses the 1920x1080 coordinate system
2. **Offline-first**: Build script inlines all assets; no runtime CDN dependencies
3. **No reflow on resize**: Use [stage-scaler.js](src/renderer/stage-scaler.js) for letterboxing/pillarboxing
4. **Markdown-driven**: Deck content comes from parsed Markdown files

### When Working with Layouts
- Layout definitions are in [src/data/layout-data.js](src/data/layout-data.js)
- Use CSS grid strings; consider adding presets for common patterns
- Area markers route content to specific grid regions
- Text before first `@area` marker flows into `@main`

### When Working with Themes
- Theme management is in [src/renderer/theme-manager.js](src/renderer/theme-manager.js)
- Themes can be set per-slide via `theme:` frontmatter

### When Working with Export
- **App UI HTML export**: [src/renderer/html-export-manager.js](src/renderer/html-export-manager.js) - triggered from menu (☰ → Export HTML)
- **App UI PDF export**: [src/renderer/print-manager.js](src/renderer/print-manager.js) - triggered from menu (☰ → Print PDF), uses browser print dialog
- **Build script HTML**: [tools/build.mjs](tools/build.mjs) - CLI-based build
- **Build script PDF**: [tools/pdf.mjs](tools/pdf.mjs) - Uses Playwright for headless PDF generation

### When Working with Editor Features
- Live editing: [src/editor/markdown-editor.js](src/editor/markdown-editor.js)
- Layout picker: [src/editor/layout-picker.js](src/editor/layout-picker.js)
- Slide thumbnails: [src/editor/slide-thumbnails.js](src/editor/slide-thumbnails.js)

### Keyboard shortcuts
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
## Testing

### Development Mode
- `npm run dev` then open http://localhost:8000/index.html
- Test HTML export via UI: Click menu (☰) → "Export HTML"
- Test PDF export via UI: Click menu (☰) → "Print PDF" (save as PDF)

### Build Output
- `npm run build && npm run preview` - Test single-file HTML build
- `npm run pdf` - Test Playwright PDF export (requires Playwright installed)

## Common Tasks
- **Add a new layout preset**: Add to [src/data/layout-data.js](src/data/layout-data.js)
- **Modify deck content**: Edit [docs/example.md](docs/example.md)
- **Change build input**: Update argument in [tools/build.mjs](tools/build.mjs)
- **Add a rendering feature**: Enhance [src/renderer/content-enhancer.js](src/renderer/content-enhancer.js) or [src/renderer/slide-renderer.js](src/renderer/slide-renderer.js)
- **Add keyboard shortcut**: Modify [src/engine/keyboard-handler.js](src/engine/keyboard-handler.js)
