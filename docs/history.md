# How SlideMD Was Built

SlideMD's pre-1.0 development ran about ten weeks, from the first release on
June 26 to launch prep in September 2026. It produced 23 releases and an
internal phase roadmap that was rewritten whenever the product found a better
shape.

This page keeps what that roadmap taught us. The first half is the story; the
second half is what we learned about growing a codebase. The full dev log
lives in git history (`git log --follow -- ROADMAP.md`). The current plan is
in [ROADMAP.md](../ROADMAP.md).

## The compressed timeline

- **Day 1 (Jun 26).** First release (v0.1.0). The roadmap was created the
  same day, already marking Phases 1–2 done, PR numbers cited. It was
  revised ten more times before midnight: phases renumbered, a New
  Presentation phase added, npm distribution dropped for GitHub Releases,
  and "Cloud Mode" sketched as Phase 6.
- **Jun 26–28.** Phases 1–6 shipped across v0.1.0–v0.3.0: lint, format,
  tests, and CI; esbuild bundling with offline-first inlined assets;
  distribution; and the editor's first end-to-end workflow.
- **Jun 28–Jul 1.** Positioning wobble. AI generation was cut from
  Phase 5. The early "no AI required" framing was dropped too. Phase 7 was
  renamed "AI Presentation Conversion".
- **Jul 25.** CLI dev server with `.md + images/` as the primary deck format
  and live reload — the commit that made plain Markdown the product.
- **Jul 30.** The Markdown-first pivot (#158), the largest roadmap rewrite.
  One planned phase became eight: Markdown-first foundation, content AST and
  renderer, AI operations, state and history, design system, presenter, and
  a pushed-back Cloud Mode. ODF/officeparser import planning was folded in
  the next day, then dropped entirely a few weeks later.
- **Aug 4–12.** The AI/state track. The AI operations foundation and the
  canonical `DeckStore` with undoable patches landed the same day, followed
  by the orchestrator, single-slide AI editing, conflict resolution, and
  global undo. The phases were reordered mid-flight so the store existed
  before the AI that writes through it.
- **Aug 9–19.** Quality waves, carved out as sub-phases 14.5–14.9: Remix and
  Reimagine quality, visual identity, PPTX layout accuracy, shape and
  diagram rendering as images, and the table directive.
- **Aug 22–26.** v0.14.0, presenter panel polish, copyable code blocks in
  HTML exports, and AI actions in the command palette.
- **Sep 3–6.** Import trust and diagnostics, the PPTX import CLI,
  accessibility hardening, the rename to `hesamat/slidemd`, and the
  public-launch docs refresh.

## Three pivots

1. **Anti-AI → AI-centric.** The first roadmap cut AI generation from
   Phase 5 and briefly framed the tool as needing no AI at all. Within a
   week that framing was gone. By August, AI enhancement, remix, and
   reimagine were core features, with the store and orchestrator built
   around them.
2. **AI conversion → deterministic rules.** Phase 7 was renamed "AI
   Presentation Conversion" in June, then shipped in July as rule-based
   layout inference: deterministic, offline, no API keys. AI became optional
   post-processing on top of the import, not the import itself.
3. **The Markdown-first pivot.** The roadmap's biggest rewrite (#158).
   Instead of chasing broader office-document support, Markdown became the
   source of truth: `.md + images/` decks you can diff, PPTX as an import
   path, and every later phase built on that base.

## How the plan actually evolved

- The roadmap was a **dev log that occasionally planned ahead**, not the
  reverse. It launched with completed phases in it, and amendments often
  landed after the work — "Add Phase 14.11 to the roadmap" came weeks after
  that work started.
- **Emerging scope got its own numbers** instead of silently expanding a
  phase: 7.5, 13.1–13.2, 14.1–14.11.
- **Order was negotiable; dependencies were not.** Once planning showed that
  single-slide AI edits need undoable patches, `DeckStore` moved ahead of
  the orchestrator that writes through it.
- **Rescopes were written down with reasons.** "Design System & Theme
  Registry" became "Editor Diagnostics & Polish" after a review found no
  demonstrated need for the module layer. The presenter phase was cut back
  to what shipped.
- **Cloud Mode was "next" three times** — Phase 6 on day one, re-planned as
  Phase 16, parked as Phase 19 — and never once was first. Long-lived
  ambitions can be real; they still don't jump the queue.

## Ideas we dropped (and why)

| Idea                                        | Why it was dropped                                          |
| ------------------------------------------- | ----------------------------------------------------------- |
| `DesignSystem` JS module                    | No user-facing delta; CSS variables are the token system.   |
| `ThemeRegistry` + custom themes             | No demonstrated user need; light/dark + accent covers it.   |
| `@import` for themes / partial slides       | Multi-deck composition; high parser blast radius.           |
| Motion / transition tokens                  | No transition system to tokenize.                           |
| Brand defaults                              | The New Presentation modal covers per-deck choices.         |
| Separate PowerPoint-style presenter window  | Existing editor + viewer is lower-risk; panels reusable.    |
| `PrintAdapter` class                        | No user-facing delta; defer unless bugs appear.             |
| Laser pointer / drawing overlay             | High blast radius, low demand.                              |
| "Summarize for executive" AI intent         | Niche, no demonstrated demand.                              |
| "Convert bullets to metric cards" AI intent | Very specific, no demonstrated demand.                      |
| `PresenterModel` class                      | State already works across existing managers.               |
| ODF/officeparser import                     | Superseded by the Markdown-first pivot; PPTX covers demand. |
| Speaker notes in PDF, per-slide PNG export  | Deferred from the presenter phase; revisit post-1.0.        |

## Engineering lessons from a growing codebase

The roadmap's checkboxes aged badly. These patterns held up. They are the
reason this page exists.

### Architecture under growth

- **Put the store in before the features that write through it.**
  Single-slide AI edits only became safe once every deck mutation went
  through `DeckStore`, which records snapshot-based undo. Retrofitting undo
  is far more expensive than starting from a store, so the store phase was
  pulled ahead of the AI orchestrator.
- **Transitional shims need a scheduled removal.** When the canonical
  `DeckStore` arrived, every editor sub-module still read and wrote deck
  state directly, and rewiring all of them in one change was too risky. So
  Phase 12 kept the editor's own copy of the deck and synchronized the two
  copies at safe moments: slide switch, save, AI apply. That mirror carried
  the project until Phase 14.2 finished the rewiring and deleted it. Two
  copies of the same state will eventually disagree, so the shim was only
  safe because its removal was written into the plan from day one.
- **Keep a deterministic core; guard the probabilistic edges.** PPTX layout
  inference shipped as rules rather than an AI call: deterministic, offline,
  no keys, unit-testable. AI became an optional layer whose output is
  validated against schemas and sent through a repair loop when validation
  fails. Cheap-to-verify logic stayed deterministic; generative logic got a
  fence.
- **Every new input path widens the trust boundary.** Slide markdown, then
  PPTX files, then AI output — each needed its own sanitization or
  validation story: a DOMPurify perimeter for anything rendered, schemas for
  anything generated. The perimeter was defined early (renderer hardening
  was Phase 10, before the AI track), and every later feature extended it
  instead of bypassing it.
- **One source of truth per decision, enforced by tooling.** Keyboard
  shortcuts live in a single registry that renders the docs and the UI
  hints. PPTX test fixtures are regenerated by a script, never hand-edited.
  AI prompts come from one fragment catalog, pinned by snapshot tests. As
  surfaces multiplied — editor, presenter, viewer windows, HTML export, PDF
  — this stopped being tidiness and became the only way to keep them
  consistent.

### Planning and scope under growth

- **Dependency order beats plan order.** Reordering the AI/state phases was
  one commit. Building the orchestrator first and retrofitting undoable
  patches would have taken weeks. When the plan and the dependency graph
  disagree, fix the plan.
- **Deferred refactors need their own phase, or they never happen.** The
  EditController decomposition and the orchestrator split were carried over
  from phase to phase — and only happened because 14.5 was an explicitly
  scoped debt-paydown phase: structural cleanup, e2e and PPTX integration
  tests, lint coverage for build scripts. "We'll refactor later" needs a
  later with a name.
- **Amend the plan in public.** Sub-phase numbers (7.5, 13.1–13.2,
  14.1–14.11) look messy in hindsight. The alternative was silently
  stretching "Phase 14" across a month. The numbering was honest bookkeeping
  at the time.
- **Rescopes and drops are decisions too.** Every rescope got a written
  reason, and every dropped idea in the table above kept its "why". The
  reasons outlived the plan; the checkboxes did not.

### Pace and blast radius

- **Pace is not constant as a codebase grows.** Phases 1–6 shipped in three
  days while the codebase was small. By August, one phase had sprawled into
  nine numbered sub-phases across a month. The work didn't slow down; the
  blast radius grew with the feature count.
- **End-stage velocity is bought with day-one infrastructure.** Phase 1 was
  deliberately boring — lint, format, tests, CI, and the release process
  before any features. That is why 23 releases could ship in eight weeks
  with CI on every PR and no broken main. The safety net makes the tightrope
  walkable.
- **Cross-surface consistency is an architecture problem, not a discipline
  problem.** Editor, presenter, viewer windows, and exports stay in sync
  because of the store-and-broadcast design, not because anyone remembers to
  sync them. If correctness depends on people remembering, it eventually
  depends on someone forgetting.
- **Rename late, rename outside-in.** The rename to SlideMD touched the
  repo, docs, and user-visible strings while leaving internal identifiers
  (storage keys, window globals, channel names) untouched. Zero migration
  for existing users, minimal blast radius, one ADR to explain why.

Twenty-three small shippable releases beat one big launch — each one real
enough to run the day it shipped.
