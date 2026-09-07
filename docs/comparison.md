# How SlideMD Compares

SlideMD shares territory with several established tools. This page maps the
differences honestly: what SlideMD does well, where the alternatives win,
and which trade-offs are deliberate.

> **SlideMD in one sentence:** your decks live in git as plain Markdown, you
> write and fix them in a live editor, present from a second window with
> speaker notes and a timer, and hand students a single self-contained HTML
> file.

## What makes SlideMD different

- **The whole loop in one tool.** Author in a live split-screen editor,
  present from a second window with speaker notes, a timer, and a
  next-slide preview, and export a single self-contained HTML file — no
  build step, no hosting, no export pipeline to babysit.
- **What you preview is what the projector shows.** The fixed 1920x1080
  stage renders identically on every machine, so a slide that fits during
  rehearsal fits during the lecture.
- **Your content outlives the tool.** Decks are plain Markdown plus an
  images folder: they diff cleanly in git, open in any editor, and can
  never be held hostage by a dead product or a subscription.
- **An exit path from PowerPoint.** Best-effort PPTX import converts
  existing decks into editable Markdown — layout inference, image
  extraction, diagrams rendered to PNG, and alt text preserved.
- **A real AI editor, on your terms.** SlideMD's AI goes beyond fixing one
  slide at a time: it can polish wording across a whole deck, remix it by
  restructuring slides from an editable plan, or reimagine it entirely from
  a chapter outline you review before generation. Vision-augmented flows
  can see your deck's images, and every result passes through validation —
  with a keep-or-merge choice when the AI races your own edits.
- **AI without the cloud, if you want it.** Bring your own key for
  OpenRouter or any OpenAI-compatible endpoint, or run models fully local
  with Ollama or LM Studio — the AI features work identically against a
  local server, so nothing about your deck ever leaves the machine.
- **Accessibility is built in, not bolted on.** Screen-reader slide
  announcements, keyboard-first navigation, and end-to-end alt-text
  propagation from PPTX import through export.

## At a glance

|                             | SlideMD                                | PowerPoint     | Reveal.js         | Marp          | Slidev            |
| --------------------------- | -------------------------------------- | -------------- | ----------------- | ------------- | ----------------- |
| Authoring                   | Markdown, in-browser                   | GUI            | HTML + JavaScript | Markdown, CLI | Markdown + Vue    |
| Live edit + instant preview | ✓ split-screen editor                  | ✓ (GUI)        | code + reload     | ✓ CLI watch   | code + reload     |
| Presenter view              | ✓ dual-window, notes, timer            | ✓              | ✓ speaker view    | —             | ✓ presenter mode  |
| Diffable in git             | ✓ plain Markdown                       | —              | ✓                 | ✓             | ✓                 |
| Fixed, deterministic layout | ✓ 1920x1080 stage                      | ✓              | responsive        | theme-based   | responsive        |
| PPTX import                 | ✓ built-in                             | n/a            | —                 | —             | —                 |
| Audience-facing export      | single-file HTML + PDF                 | many formats   | static site       | HTML + PDF    | static site build |
| Cloud collaboration         | —                                      | ✓ (M365)       | —                 | —             | —                 |
| Built-in AI editing         | ✓ enhance / polish / remix / reimagine | Copilot add-on | —                 | —             | community plugins |
| Cost                        | free, MIT                              | paid (M365)    | free, MIT         | free, MIT     | free, MIT         |

\* SlideMD's exported HTML inlines all vendor code; the only runtime external
requests are Google-hosted fonts (the app's UI fonts, plus metric-compatible
font metrics when rasterizing PPTX diagrams). System fonts take over offline.

## When another tool is the better fit

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

## Deliberate trade-offs

SlideMD skips a few things on purpose, and knowing that boundary is part of
the design. If one of these is a must-have for you, the tools above are the
better fit:

- **Slide animations and transitions** — slides are static by design; there
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
whole loop — author, present, export — for free, with no accounts and no
analytics. If you need animations, co-authoring, non-16:9 canvases, or
pixel-identical PPTX fidelity, one of the tools above will serve you better.
