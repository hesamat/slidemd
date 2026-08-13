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
- Tolerant JSON extraction and a breakdown repair retry for model responses wrapped in prose or fences.
- Outline review with editable plan and chapters.

The main gaps are not missing infrastructure. They are incomplete product wiring and an unclear visual contract:

1. The outline review does not show the visual direction the user is approving.
2. The generated visual system contains palette information, but the current generate guidance explicitly suppresses palette use and keeps the deck neutral.
3. The generate prompt does not provide the full visual-system summary or beat-to-treatment mapping.
4. Presentation voice and speaker notes remain too generic.
5. Image reuse is prompted but not yet verified by the output validator.

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

### A2: Show the creative direction in the review modal

**Files:**

- `src/editor/ui/ai-reimagine-outline-modal.js`
- `styles/ai-reimagine-outline-modal.css`

Add a compact read-only section alongside the plan and chapters showing:

- the visual-system palette as swatches with hex values;
- typography character;
- composition style;
- imagery role and mood;
- one or two motifs or contrast rules;
- first-slide identity and selected reusable images when available.

Use human-facing labels such as **Creative direction** or **Visual direction**. Do not show raw JSON or expose every schema field.

The section must update when the user regenerates the outline with an edited plan and must remain read-only when the user edits chapters.

### A3: Preserve the current review controls

Keep the existing ability to:

- edit the plan;
- rename, reorder, add, and remove chapters;
- edit chapter summaries and flow tags;
- regenerate chapters from an edited plan;
- cancel before breakdown or generation.

Do not make individual slide briefs editable in this phase. The purpose of the modal is to approve the direction, not to duplicate the editor.

---

## Workstream B — Bounded visual-system application

### B1: Use the full visual-system brief during generation

**Files:**

- `src/data/ai/ai-prompt-fragments.js`
- `src/data/ai/ai-prompt-builder.js`
- `src/data/prompts/generate-prompt.md`
- `src/data/prompts/visual-styling-note.md`

When a `visualSystem` is present, generation guidance must include:

- palette roles: base, surface, accent, contrast, and highlight;
- typography character, headline style, and body style;
- density, whitespace, and alignment preferences;
- imagery role, mood, and treatment;
- recurring motifs;
- contrast rules.

The current options-suffix injection mechanism is acceptable. A literal `{{visualSystemBrief}}` placeholder is not required if the resulting prompt is clear and the substitutions remain testable.

### B2: Allow renderer-native styling for Reimagine

For Reimagine generation only:

- allow `theme: dark` and `theme: light` based on the visual direction and slide content;
- allow palette-derived `background:` values using the existing SlideMD syntax;
- use base/surface colors for foundations and accent/contrast/highlight colors for deliberate emphasis;
- prefer existing layouts, images, Mermaid, tables, and hierarchy before relying on arbitrary text-block styling.

Do not require every slide to contain a new `background:` and `theme:` directive. A design system can be expressed through composition, density, imagery, layout, and selective contrast. Do not encourage the AI to use every palette color on every slide.

The generic neutral-only instructions must move into the no-visual-system path or otherwise be made conditional. They must remain unchanged for Polish, Fix, and other non-Reimagine flows.

### B3: Keep the visual contract bounded

Do not implement:

- a palette-to-CSS-token resolver;
- a programmatic post-generation color pass;
- a new contrast or WCAG engine;
- arbitrary CSS or freeform style attributes;
- new renderer layout types;
- automatic theme changes based on opaque heuristics after generation.

The AI is responsible for making the creative styling choices. The existing renderer is responsible for rendering those choices.

### B4: Add narrow visual-system validation

**File:** `src/data/ai/ai-output-validator.js`

Add warning-level checks only for concrete failures:

- invalid slide theme values when a theme directive is emitted;
- malformed or unsupported styling directives;
- a visual-system Reimagine result that contains no explicit theme/background styling anywhere, indicating that the visual direction was completely ignored.

Do not flag an individual slide merely because it lacks `background:` or `theme:`. Do not attempt to infer whether an arbitrary gradient matches the palette. Warnings should drive a repair retry without turning a creative choice into a hard rejection.

---

## Workstream C — Beat-aware composition and density

### C1: Teach Generate how to use beat metadata

**Files:**

- `src/data/prompts/generate-prompt.md`
- `src/data/ai/ai-prompt-fragments.js`

The breakdown already serializes beat metadata into each virtual slide brief. Add explicit treatment guidance:

| Beat           | Generate guidance                                                                |
| -------------- | -------------------------------------------------------------------------------- |
| `continuation` | Maintain the established visual language and normal content density.             |
| `transition`   | Signal a chapter or idea change with reduced density and a changed hierarchy.    |
| `punctuation`  | Give one takeaway a strong focal point with minimal competing content.           |
| `emotional`    | Let imagery or atmosphere carry more of the communication; keep text restrained. |
| `divider`      | Use minimal content and make the chapter boundary unmistakable.                  |

Apply `energy`, `contrast`, and `relationship` as modifiers:

- high energy permits stronger hierarchy and more visual emphasis;
- strong contrast permits a deliberate departure within the visual system;
- `relationship: continue` favors continuity with the preceding slide;
- `relationship: break` permits a noticeable but intentional departure.

Do not add quotas, sequence scoring, mathematical scheduling, or a visual-rhythm optimizer.

### C2: Keep beat normalization small

Retain the existing deterministic normalizer for obvious mistakes such as a high-impact first slide or adjacent high-impact beats. Do not expand it into a design engine.

---

## Workstream D — Presentation-oriented voice

### D1: Improve generate content guidance

**File:** `src/data/prompts/generate-prompt.md`

Add concise guidance to make slides feel spoken and presentable:

- use conversational headlines rather than full-sentence labels;
- prefer short phrases and bullets over encyclopedia-style paragraphs;
- keep one idea per bullet;
- use progressive disclosure: the headline creates interest and the body delivers the point;
- vary sentence openings and structure;
- use concrete examples, analogies, comparisons, and real-world references;
- put supporting detail in speaker notes when it does not belong on the slide.

Keep the existing line budgets and overflow rules. Voice guidance must not become a reason to pack more text onto a slide.

### D2: Deepen flow-aware voice

**File:** `src/data/prompts/flow-guidance.md`

Expand the existing flow variants without making them repetitive:

- **Story:** narrative arc, characters or situations, tension, before/after framing, and payoff;
- **Technical:** precise terminology, progressive complexity, evidence, code or architecture examples;
- **Persuasive:** problem, stakes, evidence, solution, benefits, and a clear call to action;
- **Instructional:** objectives, steps, examples, likely mistakes, tips, and recap.

Flow guidance should affect both wording and slide sequencing. It must not override the user's reviewed chapter structure.

### D3: Make speaker notes sound spoken

**File:** `src/data/prompts/speaker-notes-guidance.md`

When notes are enabled, instruct the AI to:

- write in a conversational speaking voice;
- add transitions, explanations, questions, examples, or misconceptions;
- avoid repeating the visible slide content verbatim;
- keep notes useful for presenting the actual slide.

When notes are not enabled, preserve the existing behavior.

---

## Workstream E — Source-image reuse reliability

### E1: Keep the current source-image inventory

The source-image inventory and `reuse:<path>` pipeline are the correct scope for this iteration:

- only reuse images that actually exist in the source deck;
- preserve exact source paths;
- allow slides to omit images when no source image adds value;
- do not fabricate URLs or search the web.

### E2: Validate requested image placement

**File:** `src/data/ai/ai-output-validator.js`

When a virtual slide brief contains `image: reuse:<path>`, emit a warning if the generated markdown contains no matching image reference. Accept the existing supported image forms, including HTML `<img>` and Markdown image syntax.

Prefer checking the exact requested path rather than accepting any unrelated image. Use the warning to trigger the existing repair loop.

---

## Workstream F — Reliability and regression coverage

Keep the existing tolerant response parsing, output validation, and repair loop. Do not make valid JSON formatting a source of unnecessary failures when the model adds fences or surrounding prose.

Add or update focused tests for:

### Visual-system contract

- valid visual-system generation and normalization;
- invalid palette fallback;
- partial merge with a valid palette;
- full visual-system prompt content;
- conditional neutral versus Reimagine styling guidance;
- no impact on Polish/Fix/Remix prompt behavior.

### Review UI

- visual-system summary appears when present;
- palette values are escaped safely;
- regeneration updates the summary;
- missing visual system is handled without a broken or empty panel;
- resolved outline preserves the visual system unchanged.

### Beat generation

- beat metadata remains in virtual brief serialization;
- each beat maps to the intended density/treatment guidance;
- existing beat normalization behavior remains unchanged.

### Image reuse

- source-image inventory reaches breakdown;
- `reuse:<path>` reaches generation;
- missing requested image produces a warning;
- unrelated images do not satisfy an exact reuse request.

### Voice

- flow variants are included only for the applicable flow;
- speaker-note guidance differs correctly between add and preserve modes;
- prompt snapshots and hygiene tests cover the new language.

### Pipeline resilience

- direct JSON, fenced JSON, prose-wrapped JSON, nested braces, and escaped quotes continue to parse;
- breakdown repair retry remains available after a parse failure;
- existing overflow, layout, and invalid-output repair behavior remains intact.

---

## Workstream G — Flow-aware outline structure

The outline prompt currently offers the same fixed menu of seven storytelling techniques regardless of the chosen flow, and the `flowTag` vocabulary can only express story and persuasion arcs. As a result, an instructional or technical deck is offered narrative techniques that do not fit, and the outline cannot tag instructional or technical structural beats.

Execute-phase flow wording is covered by Workstream D (D2). This workstream addresses the outline and structure phase only. The D2 execute-voice improvements will also benefit Remix's execute phase, which shares the same `flow-guidance.md` variants.

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

1. **Clarify and expose the creative direction** — update outline copy (including flow-aware technique menus and an extended flowTag vocabulary) and add the read-only visual direction summary to the modal.
2. **Activate bounded Reimagine visual styling** — make the visual prompt conditional, pass the full visual system, and allow renderer-native theme/background choices only in Reimagine.
3. **Wire beat-aware generation** — make the existing beat metadata affect density, hierarchy, layout, imagery, and contrast.
4. **Improve presentation voice and speaker notes** — update content guidance and the flow variants.
5. **Add exact image-reuse validation** — complete C7 without expanding into image search.
6. **Update focused tests, snapshots, and hygiene checks.**

The visual direction, beat treatment, and voice changes form the core user-visible improvement. Image validation and additional parser coverage are reliability work that should support, not define, the product experience.

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
- a generalized design-token or CSS-variable engine;
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
