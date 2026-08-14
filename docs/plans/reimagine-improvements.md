# Reimagine Mode — Improvement Plan

## Product contract

Reimagine should make an existing deck feel newly authored, not merely rewritten or reskinned.

> **Surprise the user in its thinking, reassure them in its structure, and make the result coherent in its execution.**

Given an existing deck and an optional presentation flow, Reimagine should produce a fresh presentation on the same subject with:

- a new editorial angle and narrative arc;
- new examples, analogies, explanations, and slide structure where useful;
- deliberate visual rhythm and presentation-oriented prose;
- a visual direction that is distinct from the source deck but bounded by the renderer's existing capabilities.

Reimagine must preserve:

- the user's core intent and factual accuracy;
- essential first-slide identity information such as a course code, event, author, or term;
- the user's ability to review and change the creative direction before slide generation.

Reimagine may change:

- slide order, grouping, and count;
- chapter structure and examples;
- layouts, imagery treatment, themes, and backgrounds;
- speaker notes and presentation voice.

The target slide count remains approximately 70–120% of the source deck. The result is always applied through the existing validated and undoable AI pipeline.

This plan is about making Reimagine feel like a guided editorial art director. It is not a plan for a generalized design-token system, a web image-search product, or a new renderer.

---

## Current state

The following foundations already exist and should be treated as shipped rather than planned work:

- P0 overflow protection: prompt caps, output validation, and repair handling.
- Outline output with a `visualSystem` and deterministic fallback validation.
- `visualSystem` threading from outline through breakdown to generate.
- Breakdown-level visual beats: `continuation`, `transition`, `punctuation`, `emotional`, and `divider`.
- Beat normalization to catch obvious first-slide and consecutive high-impact beats.
- Source-image extraction, kept-image selection, and `reuse:<path>` image references.
- Generate-side instructions for placing kept images.
- Output-validator checks for `reuse:<path>` and fabricated image sources (Phase 14.7).
- Tolerant JSON extraction and a breakdown repair retry for model responses wrapped in prose or fences.
- Outline review with editable plan and chapters.
- A minimal **3-color visual system** (`base` dark, `accent` pop, `highlight` light) that is editable in the review modal, persisted in the deck, and applied through `theme:`/`background:`/text-block color directives.

The main gaps are not missing infrastructure. They are incomplete product wiring and an unclear voice/beat contract:

1. The generate prompt does not map visual beats to density, hierarchy, and treatment.
2. Presentation voice and speaker notes remain too generic.
3. The outline does not yet steer structure by flow (fixed technique menu, limited flowTag vocabulary).

---

## Design principles

### 1. Reimagine starts with an editorial thesis

A compelling result needs a reason to be different. The outline should communicate the new point of view, not only list chapters.

Examples of useful editorial theses:

- Reframe a reference guide as a journey from misconception to realization.
- Turn a technical explanation into a problem-solving story.
- Open with a historical failure, build tension around its consequences, and reveal the modern approach.
- Organize the material around decisions the audience must make.

The existing `plan` field should serve as this creative direction. Avoid adding a second overlapping concept unless implementation proves that the current field cannot express it.

### 2. The user reviews the direction, not raw AI output

The review stage is the control point between probabilistic planning and expensive generation. It should expose the creative decisions that matter without becoming a full design editor.

The user should be able to understand:

- what the new deck is trying to say;
- how the narrative will progress;
- what visual character the deck will have;
- what source identity or assets will be preserved;
- what will intentionally change.

The visual system remains read-only in this phase. If the direction is wrong, the user can edit the plan and regenerate the outline rather than manually editing a palette schema.

### 3. The visual system is a design language, not a token engine

The AI may propose a palette, typography character, composition, imagery treatment, motifs, and contrast rules. These guide generation; they do not create a new rendering subsystem.

The AI emits existing SlideMD directives and primitives. The renderer remains responsible for parsing and rendering them. No programmatic palette post-pass, CSS-variable system, WCAG token resolver, or new layout type is needed.

### 4. Reimagine styling is scoped to Reimagine

Polish and single-slide Enhance/Fix are conservative by design. Remix should continue to preserve visual identity when requested.

Only Reimagine should activate the fresh visual-system styling contract. The shared generate prompt must use conditional guidance so enabling palette-aware Reimagine does not cause other flows to start inventing themes or colors.

### 5. Deterministic code catches concrete failures

Validation should catch syntax, layout, overflow, missing requested assets, and obvious contract failures. It should not attempt to judge whether a deck is beautiful or optimize a beat sequence mathematically.

---

## Workstream A — Creative direction and outline review

### A1: Make the outline an actionable creative brief

**Files:**

- `src/data/prompts/reimagine-outline-prompt.md`
- `src/data/ai/remix-reimagine-orchestrator.js`

The outline prompt should require the `plan` to state:

- the deck's core message;
- the fresh editorial angle;
- the intended narrative structure;
- the implied audience or desired outcome when it can be inferred from the source.

The prompt should continue to preserve factual accuracy and first-slide identity while allowing the AI to rethink structure, examples, and visuals.

Do not add a large new schema solely to represent an audience or goal. Prefer expressing those assumptions in the existing plan unless the user flow later demonstrates that a separate editable field is necessary.

---

## Workstream B — Bounded visual-system application

### B3: Keep the visual contract bounded

Do not implement:

- a palette-to-CSS-token resolver;
- a programmatic post-generation color pass;
- a new contrast or WCAG engine;
- arbitrary CSS or freeform style attributes;
- new renderer layout types;
- automatic theme changes based on opaque heuristics after generation.

The 3-color palette is applied through the existing `theme:`, `background:`, and optional `::: text-block { color="..." backgroundColor="..." }` directives. The AI makes the creative styling choices; the existing renderer parses and renders them.

### B4: Add narrow visual-system validation

**File:** `src/data/ai/ai-output-validator.js`

Add warning-level checks only for concrete failures:

- invalid slide theme values when a theme directive is emitted;
- malformed or unsupported styling directives;
- a visual-system Reimagine result that contains no explicit theme/background styling anywhere, indicating that the visual direction was completely ignored.

Do not flag an individual slide merely because it lacks `background:` or `theme:`. Do not attempt to infer whether an arbitrary gradient matches the palette. Warnings should drive a repair retry without turning a creative choice into a hard rejection.

---

## Workstream E — Source-image reuse reliability

The source-image inventory and `reuse:<path>` pipeline are already implemented and validated (Phase 14.7). Do not expand into web image search or automatic image-query generation in this phase.

---

## Workstream F — Reliability and regression coverage

Keep the existing tolerant response parsing, output validation, and repair loop. Do not make valid JSON formatting a source of unnecessary failures when the model adds fences or surrounding prose.

The visual-system contract, review UI, image-reuse validation, pipeline-resilience, beat-treatment, and voice tests are already in place. Add or update focused tests for the remaining flow-aware outline work:

### Flow-aware outline

- flow-specific technique menus appear in the outline prompt;
- new `flowTag` values reach the breakdown output and slide briefs;
- unknown `flowTag` values fall back to a neutral beat without failing.

---

## Workstream G — Flow-aware outline structure

The outline prompt currently offers the same fixed menu of seven storytelling techniques regardless of the chosen flow, and the `flowTag` vocabulary can only express story and persuasion arcs. As a result, an instructional or technical deck is offered narrative techniques that do not fit, and the outline cannot tag instructional or technical structural beats.

Execute-phase flow wording is covered by the updated `flow-guidance.md` variants. This workstream addresses the outline and structure phase only.

### G1: Flow-specific technique menus

**File:** `src/data/prompts/reimagine-outline-prompt.md`

Replace the fixed seven-item technique list with a per-flow subset so the AI is steered toward structures that fit the chosen flow:

- **Instructional** — objectives → step-by-step → examples/demos → check for understanding → recap; layered reveal; cause → effect for "why" sections.
- **Story** — hook → tension → resolution; historical context arc; past → present → future.
- **Technical** — context → concept → evidence → implications; assertion-evidence; compare → contrast; layered reveal for building complexity.
- **Persuasive** — problem → solution → benefits; compare → contrast; cause → effect; hook → tension → resolution closing with a call to action.

Keep allowing the AI to combine techniques. The flow should bias the menu, not hard-lock it.

### G2: Extend the flowTag vocabulary

**Files:** `src/data/prompts/reimagine-outline-prompt.md`, `src/data/ai/remix-reimagine-orchestrator.js`, `src/data/prompts/reimagine-breakdown-prompt.md`

Add instructional and technical structural tags so the outline can express their structure:

- instructional: `objectives`, `steps`, `example`, `practice`, `recap`;
- technical: `assertion`, `evidence`, `implication`.

Map the new tags through the breakdown phase so they carry into slide briefs and beat and density guidance (for example, `objectives` and `recap` favor a clear focal point; `assertion` and `evidence` pair naturally across adjacent slides; `steps` favor continuation beats with consistent density). Keep the existing story and persuasion tags. Validate new tags leniently — unknown tags fall back to a neutral beat — so older outlines and partial model output do not break.

---

## Implementation order

This is the **small-scope Phase 14.8** order. The 3-color palette and its renderer application are already shipped; the validator work is intentionally out of scope for this slice.

1. **Clarify and expand the creative direction** — update outline copy with flow-aware technique menus and an extended flowTag vocabulary.
2. **Update focused tests, snapshots, and hygiene checks.**

The visual direction, beat treatment, and voice changes form the core user-visible improvement. Image validation and additional parser coverage are reliability work already shipped in earlier phases.

---

## Acceptance criteria

Reimagine is successful when:

- the user can understand and approve the new editorial and visual direction before generation;
- the generated deck is meaningfully different in thesis, structure, and slide rhythm—not just wording;
- Reimagine can use a bounded, renderer-native visual treatment without changing other AI modes;
- visual beats produce visibly different density and hierarchy;
- headlines, bullets, and speaker notes sound presentation-ready;
- kept source images are placed when requested and never fabricated;
- output remains valid, within density limits, repairable, and undoable;
- no new renderer subsystem, web image-search system, or LLM-as-judge is required.

---

## Explicit non-goals

Do not implement in this iteration:

- Unsplash, Pexels, or other web image search;
- automatic image-query generation for assets not present in the source deck;
- a generalized design-token engine;
- programmatic palette application after generation;
- WCAG token resolution or automatic contrast correction;
- new slide layouts or beat-specific renderer components;
- mathematical beat quotas or sequence optimization;
- LLM-as-judge scoring of creative quality;
- full per-slide editing inside the outline modal;
- changes to the conservative Polish or Fix styling contracts.

---

## Relationship to the visual-system beat-engine plan

`docs/plans/visual-system-beat-engine.md` remains the lower-level reference for the existing visual-system schema, beat metadata, normalization, and outline → breakdown → generate plumbing.

This plan is the product-facing direction for completing that work. Where the two documents differ, this plan takes precedence on the following points:

- visual styling is active for Reimagine only, not globally;
- the user must be able to inspect the visual direction before generation;
- missing `background:` or `theme:` on an individual slide is not automatically a failure;
- the existing `reuse:<path>` pipeline is part of the current Reimagine flow and should be validated rather than removed;
- the current options-suffix injection is acceptable; implementation should not be changed solely to create a literal placeholder.

The implementation principle remains:

> **LLM proposes; deterministic code validates obvious failures; the existing renderer renders; the user remains in control of the creative direction.**
