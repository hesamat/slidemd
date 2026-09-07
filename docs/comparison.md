# How SlideMD Compares

SlideMD shares territory with several established tools. This page maps the
differences honestly — every tool here is excellent at what it was built
for, and the right choice depends on how you want to work.

> **SlideMD in one sentence:** your decks live in git as plain Markdown, you
> write and fix them in a live editor, present from a second window with
> speaker notes and a timer, and hand students a single self-contained HTML
> file.

## At a glance

|                             | SlideMD                     | PowerPoint   | Reveal.js         | Marp          | Slidev            |
| --------------------------- | --------------------------- | ------------ | ----------------- | ------------- | ----------------- |
| Authoring                   | Markdown, in-browser        | GUI          | HTML + JavaScript | Markdown, CLI | Markdown + Vue    |
| Live edit + instant preview | ✓ split-screen editor       | ✓ (GUI)      | code + reload     | ✓ CLI watch   | code + reload     |
| Presenter view              | ✓ dual-window, notes, timer | ✓            | ✓ speaker view    | —             | ✓ presenter mode  |
| Diffable in git             | ✓ plain Markdown            | —            | ✓                 | ✓             | ✓                 |
| Fixed, deterministic layout | ✓ 1920x1080 stage           | ✓            | responsive        | theme-based   | responsive        |
| PPTX import                 | ✓ built-in                  | n/a          | —                 | —             | —                 |
| Audience-facing export      | single-file HTML + PDF      | many formats | static site       | HTML + PDF    | static site build |
| Cost                        | free, MIT                   | paid (M365)  | free, MIT         | free, MIT     | free, MIT         |

\* SlideMD's exported HTML inlines all vendor code; the only runtime external
requests are Google-hosted fonts (the app's UI fonts, plus metric-compatible
font metrics when rasterizing PPTX diagrams). System fonts take over offline.

## Choosing between them

**Choose SlideMD if your decks live in git.** You write slides as plain
Markdown in one window while the rendered slide updates beside it, present
from a second window (or second screen) with speaker notes, a timer, and a
next-slide preview, and export one self-contained HTML file that runs
offline in any browser. PPTX import and AI post-processing exist to retrofit
existing decks into that workflow.

**Choose PowerPoint if you need pixel-perfect GUI control.** Corporate
template compatibility, co-authoring in Microsoft 365, and editing without
Node.js are real advantages. SlideMD's PPTX import exists precisely because
decks start there — but it is a best-effort conversion, not a pixel-perfect
clone.

**Choose Reveal.js if you want a programmable web presentation framework.**
You get full control by writing HTML and JavaScript. SlideMD generates a
similar keyboard-driven experience from Markdown instead, with a fixed stage
so slides never reflow between screens.

**Choose Marp if you want the fastest Markdown-to-PDF pipeline.** Write
Markdown, run a CLI, present from PDF. SlideMD adds live editing, a real
presenter view, PPTX import, and AI post-processing, at the cost of a larger
tool.

**Choose Slidev if your developer talks benefit from Vue components and
live-coded interactivity.** SlideMD trades that extensibility for a simpler
authoring model and an audience-facing export with no build step.

## What SlideMD gives up

Honesty requires the reverse list. SlideMD is the wrong tool if you need:

- **Slide animations or transitions** — slides are static by design; there
  are no built-in effects or object animations.
- **Cloud collaboration** — one author, one deck. Git is the sharing layer,
  not a live multi-user editor.
- **Editing anywhere** — the editor needs a desktop Chromium-based browser
  and Node.js. (Audience-facing decks open anywhere, including phones.)
- **Other aspect ratios** — the stage is fixed 16:9 (1920x1080); there is no
  4:3 or custom-size mode.
- **Fidelity guarantees on PPTX import** — complex decks lose layout and
  styling detail in conversion.
- **Managed AI** — you bring your own API key and endpoint (OpenRouter,
  Ollama, LM Studio, or any OpenAI-compatible service); there is no hosted
  SlideMD AI service.

## The bottom line

If your decks live in git and you present from a browser, SlideMD covers the
whole loop — author, present, export — with no accounts and no analytics. If
you need animations, co-authoring, non-16:9 canvases, or pixel-identical
PPTX fidelity, one of the tools above will serve you better.
