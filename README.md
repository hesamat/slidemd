# SlideMD — Markdown Presentations

A lightweight, browser-based slide deck tool for technical educators. Write slides in plain Markdown, present with a dual-window presenter view, and export to PDF or standalone HTML — no account, no cloud, no vendor lock-in.

SlideMD renders on a fixed 16:9 stage (1920x1080) so your deck looks the same on every screen. The editor runs entirely in the browser; the CLI dev server handles file I/O so your `.md` files stay diffable in git.

## Features

- **Markdown-first authoring** — layouts, themes, and backgrounds via simple directives
- **Live editing** — split-screen editor with instant preview, autocomplete, and slash commands
- **Image styling** — opacity, corner radius, flip, rotation, and brightness/contrast/saturation filters via the image properties panel
- **Dual-window presenter view** — speaker notes, next-slide preview, and break timer
- **Code highlighting** via Prism, **math** via KaTeX, **diagrams** via Mermaid
- **Table styling** — `::: table { ... }` container directive for width, alignment, borders, striping, header color, and column weights
- **PPTX import** — convert PowerPoint decks to Markdown with layout inference
- **AI editing** — enhance, remix, or reimagine slides with OpenRouter, Ollama, or any OpenAI-compatible endpoint
- **Export** — standalone HTML (all assets inlined) or deterministic PDF
- **Offline builds** — no Tailwind, no CDN dependencies at runtime
- **`.md + images/` or `.textpack`** — diffable in git or shareable as a single file

## Quick Start

**Requirements:** Node.js `>=22.12` (Node 22 LTS "Jod" or newer). Run `nvm use` to pick it up automatically.

```bash
npm install
npm run dev
```

Opens at http://localhost:8000/index.html. To open a specific deck:

```bash
npm run dev -- path/to/slides.md
```

If the default ports (8000 for Vite, 8001 for the CLI server) are in use,
`npm run dev` automatically finds the next free ports and prints them. To
pin specific ports, set `WEBDECK_VITE_PORT` and `WEBDECK_CLI_PORT`:

```bash
WEBDECK_VITE_PORT=9000 WEBDECK_CLI_PORT=9001 npm run dev
```

Create your first slide:

```markdown
layout: header-content

@header

## Hello, SlideMD

@main

- Press **E** to edit
- Press **P** to present
- Press **F** for fullscreen
```

## Download

Download the latest release from [GitHub Releases](https://github.com/hesamat/html-presentation/releases/latest). Each release includes:

- `slides.html` — a single self-contained file that works offline in any browser
- `slides.pdf` — a pre-generated PDF of the example deck

## Documentation

| Topic                                                  | Link                                                     |
| ------------------------------------------------------ | -------------------------------------------------------- |
| Authoring guide (syntax, layouts, text blocks, themes) | [docs/authoring.md](docs/authoring.md)                   |
| AI editing (enhance, remix, reimagine, vision)         | [docs/ai-editing.md](docs/ai-editing.md)                 |
| Import & export (PPTX, .textpack, PDF, HTML)           | [docs/import-export.md](docs/import-export.md)           |
| Keyboard shortcuts                                     | [docs/keyboard-shortcuts.md](docs/keyboard-shortcuts.md) |
| Example deck                                           | [docs/example/slides.md](docs/example/slides.md)         |
| AI prompt structure                                    | [docs/prompt-template.md](docs/prompt-template.md)       |
| AI/tool feature boundary                               | [docs/ai-positioning.md](docs/ai-positioning.md)         |
| Contributing                                           | [CONTRIBUTING.md](CONTRIBUTING.md)                       |
| Roadmap                                                | [ROADMAP.md](ROADMAP.md)                                 |

## Browser Support

SlideMD works in all modern browsers. The CLI dev server and File System Access API features (open/save files from disk) require Chromium-based browsers (Chrome, Edge, Brave). Other browsers (Firefox, Safari) can view decks and use keyboard shortcuts but cannot open or save files directly from the filesystem.

## License

MIT — see [LICENSE](LICENSE) for details.
