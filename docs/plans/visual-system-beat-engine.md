# Visual System & Beat Engine — Implementation Plan

## Objective

Replace the current linear visual progression approach with a lightweight two-level visual system:

```text
OUTLINE AI
    ↓
visualSystem
    ↓
BREAKDOWN AI
    ↓
visualBeat
    ↓
GENERATE AI
    ↓
existing renderer
```

The **Outline AI** defines a deck-wide visual language.
The **Breakdown AI** assigns each slide a semantic visual role.
The **Generate AI** uses both to compose the actual slide.

The implementation should stay intentionally lightweight. Do **not** build a generalized visual rhythm engine, image-search system, or new rendering subsystem in this PR.

---

# 1. Visual System

Add a `visualSystem` field to the Outline output.

```js
/**
 * @typedef {Object} VisualSystem
 * @property {Object} palette
 * @property {string} palette.base
 * @property {string} palette.surface
 * @property {string} palette.accent
 * @property {string} palette.contrast
 * @property {string} palette.highlight
 * @property {Object} typography
 * @property {string} typography.character
 * @property {string} typography.headline
 * @property {string} typography.body
 * @property {Object} composition
 * @property {('compact'|'medium'|'spacious')} composition.density
 * @property {('restrained'|'generous'|'expansive')} composition.whitespace
 * @property {('left-dominant'|'centered'|'asymmetric')} composition.alignment
 * @property {Object} imagery
 * @property {string} imagery.role
 * @property {string} imagery.mood
 * @property {string} imagery.treatment
 * @property {string[]} motifs
 * @property {string[]} contrastRules
 */
```

Validation is a plain function `validateVisualSystem(obj)` that returns a normalized `VisualSystem` or `null` (triggering fallback). This matches the existing AI-response validation pattern (strip fences → `JSON.parse` → `typeof` checks → throw or fall back). Do **not** introduce Zod — it is a dependency but is never imported in `src/`, and using it for one feature creates a stylistic split.

Keep the schema intentionally small:

- `motifs`: maximum 3
- `contrastRules`: maximum 3
- reasonable string length limits
- palette values must be valid hex colors (`/^#[0-9a-fA-F]{6}$/`)

## Default

Add a deterministic `DEFAULT_VISUAL_SYSTEM`.

The fallback should be a **neutral editorial system**, not a highly specific technology/startup aesthetic.

Example:

```js
const DEFAULT_VISUAL_SYSTEM = {
  palette: {
    base: "#0f172a",
    surface: "#1e293b",
    accent: "#06b6d4",
    contrast: "#f59e0b",
    highlight: "#ffffff",
  },
  typography: {
    character: "clean editorial",
    headline: "bold, high contrast, sans-serif",
    body: "clean, legible sans-serif",
  },
  composition: {
    density: "medium",
    whitespace: "generous",
    alignment: "left-dominant",
  },
  imagery: {
    role: "contextual supporting visual",
    mood: "professional, atmospheric",
    treatment: "subtle overlay or crisp container",
  },
  motifs: ["accent divider lines", "high-contrast focal points"],
  contrastRules: [
    "Use strong contrast for major takeaways",
    "Use visual breaks between major sections",
  ],
};
```

Do not claim that the palette itself is universally WCAG compliant. Actual foreground/background combinations are handled by the existing `theme: dark`/`theme: light` mechanism and generate-prompt guidance — no color-contrast helper is added in this PR (none exists in `src/` today).

---

# 2. Breakdown-Level Visual Beats

Add these fields to each breakdown slide:

```js
/**
 * @typedef {Object} SlideBeat
 * @property {('continuation'|'transition'|'punctuation'|'emotional'|'divider')} visualBeat
 * @property {('low'|'medium'|'high')} energy
 * @property {('subtle'|'moderate'|'strong')} contrast
 * @property {('continue'|'break')} relationship
 * @property {string} [imageQuery]
 */
```

Defaults:

```js
energy = "medium";
contrast = "moderate";
relationship = "continue";
```

The semantic meanings should be clearly documented in the Breakdown prompt:

### continuation

Maintain the established visual language.

### transition

Move the presentation from one visual/narrative chapter to another.

### punctuation

A high-emphasis moment: key statistic, conclusion, quote, revelation, or important takeaway.

### emotional

A visually expressive moment where imagery or atmosphere carries more of the communication.

### divider

A chapter/section marker with minimal content.

`relationship` means whether the slide should visually continue the preceding treatment or deliberately break from it.

---

# 3. Prompt Changes

## Outline Prompt

Update the Outline prompt so the model produces:

```text
narrative outline
+
visualSystem
```

The prompt should explain that the visual system is a **design language**, not a slide-by-slide progression.

It should explicitly encourage:

- recurring motifs
- deliberate contrast
- visual variety
- contextual use of imagery
- meaningful visual breaks

It should explicitly avoid:

> "Slide 1 dark, slide 2 slightly lighter, slide 3 lighter..."

The deck does not need to become progressively lighter or darker.

## Breakdown Prompt

Pass the complete `visualSystem` to Breakdown AI.

For every slide, generate:

```json
{
  "visualBeat": "...",
  "energy": "...",
  "contrast": "...",
  "relationship": "...",
  "imageQuery": "..."
}
```

Guidance:

- `continuation` is the default.
- Use high-impact beats (`punctuation`, `emotional`, `divider`) sparingly.
- Avoid repeating the same high-impact beat on adjacent slides.
- Consider neighboring slides and the overall narrative when assigning beats.
- `punctuation` should usually correspond to genuinely important content.
- `emotional` should usually correspond to content that benefits from imagery or atmosphere.
- `divider` should only be used when a meaningful section boundary exists.
- `relationship: break` should indicate deliberate visual contrast with the preceding slide.

Do **not** add rigid mathematical quotas to the prompt.

The model should optimize for visual rhythm rather than satisfying an arbitrary number of beat occurrences.

### Image queries

The Breakdown prompt should instruct the model to make image queries consistent with `visualSystem.imagery.mood`.

Do not add a regex-based image-query sanitizer in this PR.

Do not force literal repetition of mood words if that makes the query unnatural.

### `imageQuery` disposition in this PR

`imageQuery` is parsed and validated, but **not passed to the generate AI yet**. There is no image-search infrastructure in this PR, and injecting raw query strings into the generate prompt would encourage the AI to fabricate image URLs. The field is forward infrastructure for a later image-search PR. The orchestrator should store it on the virtual slide metadata but omit it from the `<!-- brief: ... -->` serialization.

---

# 4. Minimal Beat Normalization

Add a small deterministic post-processing step after Breakdown AI.

Its purpose is only to catch obvious bad outputs, not to redesign the sequence.

At minimum:

1. If the first slide is `divider` or `punctuation`, change it to `continuation`. (A `transition` on slide 1 has no preceding state to transition from.)
2. If two high-impact beats (`punctuation`, `emotional`, `divider`) occur consecutively without a strong narrative reason, downgrade the second to `continuation`.
3. Preserve all other model decisions.

Do **not** implement:

- mathematical beat quotas
- complex spacing optimization
- chapter-aware beat scheduling
- beat scoring
- sequence optimization
- automatic rewriting of image queries

Keep this utility small and easy to delete/expand later.

---

# 5. Generate Prompt

## Relationship to existing `visualIdentityGuidance`

The project already has a `{{visualIdentityGuidance}}` placeholder system with preserve/discard variants (`visual-identity-guidance.md`, `remix-visual-identity-guidance.md`, `buildRemixVisualIdentityGuidance()`). This is used by remix and polish flows.

- **Reimagine flow:** `visualSystem` **overrides** the generic "Pick ONE coherent visual theme" instruction in `generate-prompt.md`. When a `visualSystem` is present, the generate prompt's generic visual-styling section is replaced by specific `visualSystem` guidance. The `discard` variant of `visualIdentityGuidance` is already the default for reimagine (the outline prompt says "Do not preserve the original theme..."), so this is consistent.
- **Remix/polish flows (non-reimagine):** No `visualSystem` exists (no outline phase). The existing `visualIdentityGuidance` preserve/discard mechanism remains **unchanged**.

## Injection mechanism

Add a new `{{visualSystemBrief}}` placeholder to the generate prompt's user message, populated by `composeMessages`. This follows the existing pattern — every other injected fragment (`creativeGuidance`, `visualIdentityGuidance`, `imagesSection`) works this way.

When `visualSystem` is present, `{{visualSystemBrief}}` expands to a formatted summary of the palette, typography, composition, imagery mood, motifs, and contrast rules. When absent, it expands to an empty string and the existing generic visual-styling guidance applies.

## Per-slide beat serialization

The generate phase works on **markdown text**, not structured per-slide objects. The existing serialization lives in `#breakdownToVirtualSlides` (`remix-reimagine-orchestrator.js`), which produces `<!-- brief: {title} — {intent} (chapter: {context}) -->`.

Extend the brief comment to include the beat:

```html
<!-- brief: {title} — {intent} (chapter: {context}) | beat: punctuation, energy: high, contrast: strong, relationship: break -->
```

This keeps a single comment per slide (the generate prompt already knows to read `<!-- brief: ... -->`) and avoids introducing a second comment type. `imageQuery` is **not** included in the serialization (see §3).

The generate prompt must be updated to tell the AI to read the `| beat: ...` suffix and apply the beat→treatment mapping below.

## Beat → treatment mapping

Pass the Generate AI:

```text
visualSystem (via {{visualSystemBrief}})
+
visualBeat + energy + contrast + relationship (via the brief comment suffix)
```

Explain that the visual system defines the design language and the beat defines the current moment within that language.

| Beat         | Guidance                                                                               |
| ------------ | -------------------------------------------------------------------------------------- |
| continuation | Maintain established composition, motifs, palette and density                          |
| transition   | Visually shift toward the next chapter; reduce content density and emphasize hierarchy |
| punctuation  | Strong focal point, minimal competing content, deliberately contrasting treatment      |
| emotional    | Let imagery/atmosphere dominate; restrained text                                       |
| divider      | Minimal content, clear section marker, strong chapter identity                         |

For `relationship: break`, deliberately allow a noticeable departure from the preceding slide while remaining consistent with the overall visual system.

For `relationship: continue`, preserve visual continuity.

Do **not** create new renderer layout types for these beats.

Use the existing layout primitives.

---

# 6. Theme / Contrast Handling

Reuse the existing `theme: dark`/`theme: light` mechanism.

Do **not** create a new token-resolution subsystem in this PR. No color-contrast helper exists in `src/` today and none should be added.

For strong punctuation beats, the Generate prompt may recommend theme inversion when that creates meaningful contrast.

Example:

```text
dark deck
→ strong punctuation
→ light/highlight background
→ dark text
```

But this should be guidance, not a rigid universal mapping.

The important requirements are:

- maintain legibility
- preserve the visual system's palette
- create deliberate contrast
- use the existing renderer/theme mechanism

---

# 7. Orchestrator Changes

Thread `visualSystem` through:

```text
Outline
  ↓
Breakdown
  ↓
Generate
```

Specifically:

```text
Outline result
  → visualSystem

Breakdown input
  → visualSystem

Breakdown result
  → visualBeat metadata

Generate input
  → visualSystem (via {{visualSystemBrief}})
  → visualBeat metadata (via brief comment suffix)
```

Keep the data intact between stages.

## Fallback behavior

`visualSystem` validation is **best-effort and decoupled from outline validation**.

- The outline parser (`#parseOutlineResponse`) still **throws** if `plan` or `chapters` are missing — this is existing behavior and remains unchanged.
- Only the `visualSystem` field gets a silent fallback.

Validation granularity:

- `palette` (5 valid hex colors) is the only hard requirement.
- If `palette` is missing or any color is invalid → use the **entire** `DEFAULT_VISUAL_SYSTEM`. Do not half-merge (a mismatched palette + default motifs produces incoherent guidance).
- If `palette` is valid but `motifs`/`contrastRules`/`typography`/`composition`/`imagery` are missing or malformed → fill those from `DEFAULT_VISUAL_SYSTEM` and keep the parsed palette.

The presentation pipeline should not fail solely because `visualSystem` could not be parsed.

---

# 8. Modal / UI

## Type change

Extend `ReimagineOutline` (JSDoc typedef in `ai-reimagine-outline-modal.js`) with `visualSystem?: VisualSystem`.

The modal's `close()` callback must pass `outline.visualSystem` through **unchanged** — it is read-only. The user cannot modify it. The existing `close()` at line 257 constructs the return object from `plan` + `chapters`; add `visualSystem: outline.visualSystem ?? null`.

## Display

Add a compact read-only visual-system summary to the existing plan view, as a sibling of the `${P}plan-text` section.

Show useful information such as:

- palette (as color swatches with hex values)
- typography character
- composition style
- imagery mood
- motifs

Do not expose all internal implementation details. Do not show raw JSON.

This is primarily for inspection/debugging and should not become a new editing UI.

---

# 9. Tests

Keep the tests focused on the new contracts and pipeline wiring.

### Schema tests

Test:

- valid visual system
- invalid hex color
- invalid enum
- missing required field
- oversized motifs/rules
- fallback to full `DEFAULT_VISUAL_SYSTEM` when `palette` is invalid
- partial merge when `palette` is valid but other fields are missing
- outline validation still throws when `plan`/`chapters` are missing (existing behavior preserved)

### Beat normalization tests

Test:

- first slide `punctuation` → normalized to `continuation`
- first slide `divider` → normalized to `continuation`
- consecutive high-impact beats are normalized (second → `continuation`)
- normal sequences remain unchanged

### Orchestrator integration test

Use synthetic LLM responses and verify:

```text
Outline
  → visualSystem
  → Breakdown
  → visualBeat
  → Generate
```

without losing or mutating the fields.

Specifically verify:

- `visualSystem` flows from outline → breakdown input → generate input
- per-slide beat metadata appears in the `<!-- brief: ... | beat: ... -->` serialization
- `imageQuery` is stored on virtual slide metadata but **not** present in the serialized brief
- fallback to `DEFAULT_VISUAL_SYSTEM` when outline returns no `visualSystem`

### Modal tests

Test:

- modal displays `visualSystem` summary when present
- modal returns `visualSystem` in the resolved outline (pass-through, unchanged)
- modal handles missing `visualSystem` gracefully (no display section, returns `null`)

### Existing tests

Update mocks/fixtures that assume the previous Outline/Breakdown schemas.

---

# 10. Explicit Non-Goals

Do NOT implement in this PR:

- Unsplash/web image search
- image-search query optimization infrastructure
- passing `imageQuery` to the generate AI (stored only, for future use)
- complex beat scheduling algorithms
- mathematical beat quotas
- chapter-aware visual scheduling
- a generalized design-token engine
- new slide layouts
- beat-specific renderer components
- a visual rhythm scoring system
- a color-contrast helper / WCAG token resolver
- Zod schema validation (use plain JS validators to match existing conventions)

These can be addressed later based on real generated-deck failures.

---

# 11. Implementation Principle

The implementation should follow:

> **LLM proposes; deterministic code validates and catches obvious failures; the existing renderer remains responsible for rendering.**

The goal is to introduce a better **visual language and visual rhythm model**, not to encode graphic design into TypeScript.

Prefer the smallest implementation that demonstrates a clear improvement over the existing linear visual progression.
