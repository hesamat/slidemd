# How SlideMD Compares

SlideMD shares territory with several established tools. This page is an
honest map of the differences — each tool is excellent at what it was built
for, and the right choice depends on what you are teaching and how you work.

## At a glance

|                             | SlideMD                                                    | PowerPoint      | Reveal.js              | Marp            | Slidev            |
| --------------------------- | ---------------------------------------------------------- | --------------- | ---------------------- | --------------- | ----------------- |
| Authoring                   | Markdown, in-browser                                       | GUI             | HTML/JavaScript        | Markdown, CLI   | Markdown + Vue    |
| Live edit while previewing  | ✓ split-screen editor                                      | ✓ (GUI)         | code + reload          | ✓ CLI watch     | code + reload     |
| Diffable in git             | ✓ plain Markdown                                           | ✗ (binary file) | ✓                      | ✓               | ✓                 |
| Presenter view              | ✓ dual-window, notes, timer                                | ✓               | ✓ speaker view         | ✗               | ✓ presenter mode  |
| Deterministic layout        | ✓ fixed 1920x1080 stage                                    | ✓               | responsive/theme-based | theme-based     | responsive        |
| PPTX import                 | ✓ built-in, rule-based                                     | n/a             | ✗                      | ✗               | ✗                 |
| Offline single-file export  | ✓ (all assets inlined)                                     | ✓               | needs hosting/assets   | ✓ (HTML export) | needs build step  |
| Accounts / cloud            | ✗ none                                                     | Microsoft 365   | ✗                      | ✗               | ✗                 |
| Built-in AI post-processing | ✓ enhance / remix / reimagine                              | add-ons         | ✗                      | ✗               | community plugins |
| Runs without install        | ✓ (exported HTML); editing needs Node + a Chromium browser | ✓               | needs a web server     | needs CLI       | needs Node        |

## The short version

- **Choose PowerPoint** if you need pixel-perfect GUI control, corporate
  template compatibility, or offline editing without Node.js. SlideMD's PPTX
  import exists precisely because decks start there — but the import is a
  best-effort conversion, not a pixel-perfect clone.
- **Choose Reveal.js** if you want full programmatic control of a web
  presentation framework and are comfortable writing HTML/JavaScript.
  SlideMD generates a Reveal-style experience from Markdown instead, with a
  fixed stage so slides never reflow between screens.
- **Choose Marp** if you want the fastest possible Markdown-to-slides CLI
  pipeline and present from PDF. SlideMD adds live editing, a presenter
  view, PPTX import, AI post-processing, and layout directives at the cost
  of a larger tool.
- **Choose Slidev** if you are building developer talks that benefit from
  Vue components and code-interactivity. SlideMD trades that extensibility
  for a simpler authoring model, a fixed layout stage, and zero build step
  for the audience-facing export.

## What SlideMD is optimized for

SlideMD is built for a specific workflow: **teaching from decks that live in
git**. Write and fix slides in plain Markdown in one window while the slide
preview updates in the same window, present from a second window (or second
screen) with notes and a timer, keep everything diffable in git, and export
a single self-contained HTML file students can open offline. PPTX import and
AI post-processing exist to retrofit existing decks into that workflow.
