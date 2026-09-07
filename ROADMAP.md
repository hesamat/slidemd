# SlideMD Roadmap

This page is a short, forward-looking summary of where SlideMD is headed. For
bugs and feature requests — including anything you would like moved up — open a
[GitHub issue](https://github.com/hesamat/slidemd/issues).

## In v1.0

- **Markdown-first authoring** — layouts, themes, slide/area backgrounds, and
  container directives (`text-block`, `table`, …) on a fixed 1920×1080 stage
- **Live split-screen editor** — instant preview, autocomplete, slash commands,
  drag-and-drop for images, code, diagrams, and math, drag-to-resize columns
- **Presenter view** — dual-window presenting with speaker notes, next-slide
  preview, break timer, and slide grid overview
- **PPTX import** — deterministic layout inference with shape and diagram
  rendering, in the app or from the command line (`npm run pptx`)
- **AI editing** — enhance, remix, and reimagine decks via OpenRouter, Ollama,
  or any OpenAI-compatible endpoint; opt-in and sent directly to your endpoint
- **Export** — standalone offline HTML and deterministic PDF
- **Formats** — `.md + images/` for git-friendly diffing, `.textpack` for
  single-file sharing
- **Accessibility** — slide-change announcements, keyboard-first navigation,
  and alt text preserved from PPTX import through export

See the [authoring guide](docs/authoring.md) for the full syntax and the
[README](README.md) for the complete feature list.

## Planned (post-1.0)

- **Classroom live polls** — start a poll (via Slido or Mentimeter)
  mid-lesson from the presenter view. The poll persists as an `activity:`
  slide in the deck, so what happened in the room stays part of the deck and
  remains reusable. No hosting or realtime infrastructure of our own.
- **Cloud mode** — pluggable image storage (GitHub or local folders) and
  smoother open/save workflows, including deck switching without a restart.

Details land in GitHub Issues as each feature firms up; this page stays
high-level on purpose.
