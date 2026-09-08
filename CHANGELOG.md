# Changelog

## 1.0.0-beta.1 (2026-09-07)

First public release of SlideMD — a local-first, Markdown-driven presentation
tool for technical educators. Write slides in plain Markdown, present with a
dual-window presenter view, and export to PDF or standalone HTML. No account,
no cloud, no vendor lock-in.

Versions 0.1.0–0.14.0 predate the public release; their history lives in the
git log.

### Authoring & editing

- Markdown-first slides on a fixed 16:9 stage (1920×1080) with layout, theme,
  slide/area background, and media full-bleed directives
- Split-screen live editor: instant preview, autocomplete, slash commands,
  drag-and-drop for images, code, diagrams, and math, and drag-to-resize
  columns on multi-column layouts
- Container directives: `::: text-block` for multi-column text, styled
  blocks, and a speech-bubble preset; `::: table` for width, alignment,
  borders, striping, header color, and column weights
- Image styling: opacity, corner radius, flip, rotation, and
  brightness/contrast/saturation filters
- Global undo/redo across structural edits; `Ctrl+S` saves to disk and
  updates a local baseline that reloads and other windows pick up
- Code highlighting (Prism), math (KaTeX), and diagrams (Mermaid)

### Presenting

- Dual-window presenter view: speaker notes, next-slide preview, break
  timer, elapsed time, and slide grid overview
- Command palette (`Ctrl+K`), full-text slide search, keyboard-first
  navigation with documented shortcuts
- Accessibility: slide-change announcements, semantic slide labels, and alt
  text preserved from PPTX import through export
- The audience (viewer) window renders deck-folder images for decks opened
  through the file picker, including images the presenter adds afterwards

### Import & export

- PPTX import with rule-based layout inference and shape/diagram rendering
  as images — in the app or from the command line (`npm run pptx`, with
  direct PPTX-to-PDF)
- PPTX diagram fixes from real lecture-deck testing: corrected an image
  unit mix that misplaced imported images, kept tables and charts out of
  diagram renders, and added a text shrink floor for dense diagrams
- Standalone offline HTML export (vendor assets inlined) and deterministic
  PDF export
- `.md + images/` decks that stay diffable in git, or `.textpack` for
  single-file sharing

### AI editing (opt-in)

- Enhance, remix, and reimagine slides via OpenRouter, Ollama, LM Studio, or
  any OpenAI-compatible endpoint — sent directly to the endpoint you
  configure
- Vision-aware remix and reimagine, editable Reimagine outlines, and
  detection of AI results that race your own edits, with a keep-or-merge
  choice

### Platform

- Offline-first builds: highlighter, math, diagram, and icon assets inlined
  at build time
- Works in all modern browsers; File System Access features (open/save from
  disk) on Chromium-based browsers
- Full favicon and manifest icon set

### Documentation

- README screenshots, a Privacy & Data section, and a comparison page
  against PowerPoint, Reveal.js, Marp, and Slidev
- Public forward-looking roadmap
