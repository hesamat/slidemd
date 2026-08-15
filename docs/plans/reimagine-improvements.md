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

## Shipped work

The following are done and should not be revisited in this phase:

- P0 overflow protection: prompt caps, output validation, and repair handling.
- Outline output with a `visualSystem` (`visualDirection` freeform text) and deterministic fallback validation.
- `visualSystem` threading from outline through breakdown to generate.
- Breakdown-level visual beats: `continuation`, `transition`, `punctuation`, `emotional`, and `divider`.
- Beat normalization to catch obvious first-slide and consecutive high-impact beats.
- Source-image extraction, kept-image selection, and `reuse:<path>` image references.
- Generate-side instructions for placing kept images.
- Output-validator checks for `reuse:<path>` and fabricated image sources (Phase 14.7).
- Tolerant JSON extraction and a breakdown repair retry for model responses wrapped in prose or fences.
- Outline review with editable plan, chapters, and `visualDirection`.
- `applyVisualSystemIdentity` post-processing: infers `theme:` from `background:`, replaces invalid/blank values with fallbacks, drops stray AI comments.
- Background value validation: `COLOR_TOKEN_RE` accepts only hex, `rgb()`, `rgba()`, `hsl()`, `hsla()`, and gradients — named CSS colors are rejected.
- Image-only backgrounds are kept as-is; fallback colors are no longer appended to image backgrounds.
- The generate and breakdown prompts list only the 5 valid beat types (phantom `example`/`practice` beats removed).
- The visual-styling prompt instructs the AI not to combine a color with an image in a single `background:` directive and not to use CSS named colors.
- Beat-to-treatment mapping in the generate prompt: each beat has concrete layout and background guidance.
- Presentation voice: flow-aware prose, conversational headlines, progressive disclosure, concrete examples, and useful speaker notes.
- Image reuse validation: warn and repair when a `reuse:<path>` brief does not result in the requested source image being placed.

---

## Remaining work

### 1. Flow-specific technique menus

**File:** `src/data/prompts/reimagine-outline-prompt.md`

The outline prompt currently offers the same fixed menu of seven storytelling techniques regardless of the chosen flow. Replace it with a per-flow subset so the AI is steered toward structures that fit the chosen flow:

- **Instructional** — objectives → step-by-step → examples/demos → check for understanding → recap; layered reveal; cause → effect for "why" sections.
- **Story** — hook → tension → resolution; historical context arc; past → present → future.
- **Technical** — context → concept → evidence → implications; assertion-evidence; compare → contrast; layered reveal for building complexity.
- **Persuasive** — problem → solution → benefits; compare → contrast; cause → effect; hook → tension → resolution closing with a call to action.

Keep allowing the AI to combine techniques. The flow should bias the menu, not hard-lock it.

### 2. Extend the flowTag vocabulary

**Files:** `src/data/prompts/reimagine-outline-prompt.md`, `src/data/ai/remix-reimagine-orchestrator.js`, `src/data/prompts/reimagine-breakdown-prompt.md`

The `flowTag` enum is currently story/persuasion only (`hook`, `context`, `problem`, `tension`, `solution`, `evidence`, `comparison`, `example`, `transition`, `climax`, `cta`). Add instructional and technical structural tags so the outline can express their structure:

- instructional: `objectives`, `steps`, `example`, `practice`, `recap`;
- technical: `assertion`, `evidence`, `implication`.

Map the new tags through the breakdown phase so they carry into slide briefs and beat and density guidance (for example, `objectives` and `recap` favor a clear focal point; `assertion` and `evidence` pair naturally across adjacent slides; `steps` favor continuation beats with consistent density). Keep the existing story and persuasion tags. Validate new tags leniently — unknown tags fall back to a neutral beat — so older outlines and partial model output do not break.

### 3. Thread flowTag into the breakdown prompt

**File:** `src/data/prompts/reimagine-breakdown-prompt.md`

The orchestrator carries `flowTag` from the outline to breakdown slide briefs, but the breakdown prompt never mentions `flowTag`. It is stored on the chapter object but not shown to the breakdown AI. Add the `flowTag` to the breakdown prompt's chapter context so the breakdown AI can use it when assigning beats and density.

### 4. Visual-system validation (deferred from earlier slice)

**File:** `src/data/ai/ai-output-validator.js`

Add warning-level checks only for concrete failures:

- invalid slide theme values when a theme directive is emitted;
- malformed or unsupported styling directives;
- a visual-system Reimagine result that contains no explicit theme/background styling anywhere, indicating that the visual direction was completely ignored.

Do not flag an individual slide merely because it lacks `background:` or `theme:`. Do not attempt to infer whether an arbitrary gradient matches the palette. Warnings should drive a repair retry without turning a creative choice into a hard rejection.

### 5. End-to-end pipeline tests

Add focused tests for the remaining flow-aware outline work:

- flow-specific technique menus appear in the outline prompt;
- new `flowTag` values reach the breakdown output and slide briefs;
- unknown `flowTag` values fall back to a neutral beat without failing;
- the `visualDirection` appears in the breakdown prompt and generate options suffix;
- beats survive from breakdown to slide briefs;
- the orchestrator threads `visualSystem` through all phases.

---

## Design principles

### 1. Reimagine starts with an editorial thesis

A compelling result needs a reason to be different. The outline should communicate the new point of view, not only list chapters.

The existing `plan` field serves as this creative direction. Do not add a second overlapping concept unless implementation proves that the current field cannot express it.

### 2. The user reviews the direction, not raw AI output

The review stage is the control point between probabilistic planning and expensive generation. The user can edit the plan, chapters, and `visualDirection` before generation.

### 3. The visual system is a design language, not a token engine

The AI emits existing SlideMD directives and primitives. The renderer remains responsible for parsing and rendering them. No programmatic palette post-pass, CSS-variable system, WCAG token resolver, or new layout type is needed.

### 4. Reimagine styling is scoped to Reimagine

Only Reimagine activates the fresh visual-system styling contract. The shared generate prompt uses conditional guidance so enabling palette-aware Reimagine does not cause other flows to start inventing themes or colors.

### 5. Deterministic code catches concrete failures

Validation should catch syntax, layout, overflow, missing requested assets, and obvious contract failures. It should not attempt to judge whether a deck is beautiful or optimize a beat sequence mathematically.

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

## Implementation principle

The implementation principle remains:

> **LLM proposes; deterministic code validates obvious failures; the existing renderer renders; the user remains in control of the creative direction.**
