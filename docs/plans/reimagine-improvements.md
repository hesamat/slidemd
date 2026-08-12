# Reimagine Mode — Improvement Plan

## Background

The reimagine mode (outline -> breakdown -> generate) was introduced in 0.9.1.
Real-world testing revealed four issues, prioritized as:

- **P0 (shipped in 0.9.2):** Heavily overflowing slides — the generate prompt
  encouraged density without caps, and the validator had no content-volume
  checks. Fixed with per-area line budgets in `generate-prompt.md` and a
  `SLIDE_CONTENT_OVERFLOW` error in `AiOutputValidator`.
- **P1 (deferred):** Black-and-white visual system — multiple prompt locations
  explicitly instructed the AI to discard colorful palettes and use neutral
  styling, producing decks with no visual variety.
- **P2 (deferred):** Lack of images — the breakdown prompt allowed
  `imageQuery: "reuse:<path>"` but did not require it, and the generate prompt
  only honored `reuse:<path>`, so decks were generated without images unless
  explicitly assigned.
- **P3 (deferred):** Dry and robotic voice — the generate prompt's content
  guidance was overly prescriptive, producing flat encyclopedic prose instead
  of engaging presentation language.

This document captures the plan for P1-P3.

---

## P1: Visual System & Beat Engine

**Full plan:** [`docs/plans/visual-system-beat-engine.md`](visual-system-beat-engine.md)

### Summary

Introduce a two-level visual model:

1. **Outline AI** defines a deck-wide `visualSystem` (palette, typography,
   composition, imagery mood, motifs, contrast rules).
2. **Breakdown AI** assigns each slide a `visualBeat` (continuation, transition,
   punctuation, emotional, divider) with energy/contrast/relationship metadata.
3. **Generate AI** uses both to compose the actual slide.

### Key changes

- Add `visualSystem` field to the outline output schema with a
  `validateVisualSystem()` function and a `DEFAULT_VISUAL_SYSTEM` fallback.
- Add `visualBeat` / `energy` / `contrast` / `relationship` fields to each
  breakdown slide.
- Add `{{visualSystemBrief}}` placeholder to the generate prompt; replace the
  generic "pick one coherent visual theme" instruction when a visual system is
  present.
- Serialize beat metadata into the `<!-- brief: ... | beat: ... -->` comment.
- Add minimal beat normalization (first slide can't be high-impact;
  consecutive high-impact beats are downgraded).
- Add a read-only visual-system summary to the reimagine outline modal.
- Remove the prompt instructions that force neutral/black-and-white styling.

### Non-goals

- No Unsplash/web image search.
- No new renderer layout types.
- No color-contrast helper / WCAG token resolver.
- No complex beat scheduling algorithms.

---

## P2: Image Reuse & Placement

### Problem

The breakdown prompt allows `imageQuery: "reuse:<path>"` but does not require
or encourage it. The generate prompt only honors `reuse:<path>` and ignores all
other queries. As a result, reimagine decks are typically generated without any
images even when the source deck has relevant ones.

### Plan

1. **Breakdown prompt**: instruct the AI to assign `imageQuery: "reuse:<path>"`
   to slides where the source deck has a relevant image. Add a source-image
   inventory to the breakdown input so the AI knows what images exist and
   their paths.
2. **Generate prompt**: when a `reuse:<path>` query is present in the brief,
   explicitly instruct the AI to place the image using `![alt](path)` in the
   appropriate area (usually `@media`).
3. **Orchestrator**: pass the source deck's image inventory (paths + alt text)
   to the breakdown phase as part of the virtual deck context.
4. **Validation**: add a validator check that warns (not errors) when a slide
   has a `reuse:<path>` image query but no `<img>` or `![...](...)` in the
   generated markdown. This drives a repair retry.

### Non-goals

- No web image search (Unsplash, Pexels, etc.) — deferred to a future phase.
- No automatic image query generation for non-reuse queries.
- No image cropping or composition AI.

---

## P3: Voice & Content Quality

### Problem

The generate prompt's content guidance produces flat, encyclopedic prose.
Slides read like textbook paragraphs rather than presentation talking points.

### Plan

1. **Generate prompt revision**: replace prescriptive content rules with
   presentation-oriented guidance:
   - Use conversational headlines (not full sentences, not label-only).
   - Prefer bullet points and short phrases over paragraphs.
   - One idea per bullet; no compound bullets.
   - Use progressive disclosure: headline teases, body delivers.
   - Vary sentence structure; avoid starting every bullet with a verb.
2. **Flow-aware voice**: the existing `flow` option (story / technical /
   persuasive / instructional) should influence the voice:
   - **Story**: narrative arcs, anecdotes, before/after framing.
   - **Technical**: precise terminology, code examples, architecture diagrams.
   - **Persuasive**: problem-solution, evidence, calls to action.
   - **Instructional**: step-by-step, examples, tips/warnings.
3. **Beat-aware content density**: tie content volume to the visual beat:
   - `punctuation` slides: 1-3 key points, large type, minimal text.
   - `emotional` slides: 1-2 lines, image-dominant.
   - `divider` slides: title + optional subtitle only.
   - `continuation` slides: normal density (within line budget).
   - `transition` slides: slightly reduced density to signal a shift.
4. **Speaker notes**: when `addSpeakerNotes` is enabled, instruct the AI to
   write notes in a conversational speaking voice, not as a restatement of the
   slide content.

### Non-goals

- No automated A/B testing of voice quality.
- No per-slide tone detection or adjustment.
- No LLM-as-judge scoring in the validation loop.

---

## Implementation Order

1. **P1 (visual system & beats)** — the largest change; unblocks P2 and P3
   because the beat metadata drives image placement and content density.
2. **P2 (image reuse)** — depends on the breakdown-to-generate image query
   pipeline from P1.
3. **P3 (voice)** — depends on beat-aware content density from P1; can be
   done independently of P2 if needed.

Each item should ship as a separate PR to keep the review surface manageable.
