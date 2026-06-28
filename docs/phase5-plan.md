# Phase 5: Remove AI Generation + Unify Prompts

## Goal

Remove the entire AI slide generation feature (course profiles, lecture plans, deck generation) and consolidate the prompt documentation in `docs/` into a clean, unified resource. The long-term direction is to replace this with a PPTX-to-SlideMD conversion feature in a future phase.

## Files to Delete

### Source files (10 + 1)

| File                                         | Lines | Reason                                      |
| -------------------------------------------- | ----- | ------------------------------------------- |
| `src/generation/ai-generation-controller.js` | 904   | Main orchestrator — all generation workflow |
| `src/generation/ai-provider-registry.js`     | 351   | AI provider abstraction (GLM, OpenRouter)   |
| `src/generation/ai-config-modal.js`          | 273   | API key/provider config modal               |
| `src/generation/deck-generator.js`           | 918   | Deck generation prompts + logic             |
| `src/generation/lecture-plan-generator.js`   | 589   | Lecture plan prompts + logic                |
| `src/generation/lecture-plan-modal.js`       | 266   | Lecture plan review/edit modal              |
| `src/generation/course-profile-manager.js`   | 623   | Course profile CRUD                         |
| `src/generation/course-profile-modal.js`     | 458   | Course profile UI                           |
| `src/generation/generation-templates.js`     | 378   | Mustache slide templates (never used)       |
| `src/ui/generation-actions.js`               | 80    | Menu button wiring for generation           |

### CSS files (3)

| File                              | Lines |
| --------------------------------- | ----- |
| `styles/ai-config-modal.css`      | 336   |
| `styles/course-profile-modal.css` | 382   |
| `styles/lecture-plan-modal.css`   | 250   |

## Files to Move

| From                                       | To                                     | Reason                              |
| ------------------------------------------ | -------------------------------------- | ----------------------------------- |
| `src/generation/new-presentation-modal.js` | `src/editor/new-presentation-modal.js` | Not AI — manual presentation wizard |

## Files to Modify (6)

1. **`deck.js`** — Remove `initializeDefaultProviders` import + init block
2. **`src/engine/deck-controller.js`** — Remove 3 imports, `initGenerationManager()` method, 2 lines in `init()`, update `NewPresentationModal` import path
3. **`src/core/element-gatherer.js`** — Remove 3 element refs
4. **`index.html`** — Remove 1 divider + 3 menu buttons (~76 lines)
5. **`styles.css`** — Remove 3 `@import` lines for deleted CSS files
6. **`styles/notification.css`** — Remove `.loading-modal__*` classes (lines 235-271)

## Prompt Unification

- Merge `docs/prompt-template.md` (190 lines, general-purpose) and `docs/prompts/lecture-deck-prompt.md` (389 lines, lecture-specific) into a single `docs/prompt-template.md`
- Include the best examples from the inline prompts in `deck-generator.js` (the most refined versions)
- Delete `docs/prompts/` subfolder

## Documentation Updates

| File              | Change                                             |
| ----------------- | -------------------------------------------------- |
| `README.md`       | Remove "AI Generation" section                     |
| `docs/example.md` | Remove "AI Generation" slide                       |
| `AGENTS.md`       | Remove "When Working with AI Generation" section   |
| `package.json`    | Remove "ai-generation" keyword, update description |

## Execution Order

1. Move `new-presentation-modal.js` + update import path
2. Delete generation source files + generation-actions.js
3. Delete CSS files + clean notification.css
4. Modify deck.js, deck-controller.js, element-gatherer.js, index.html, styles.css
5. Update package.json
6. Merge prompt templates
7. Update README.md, docs/example.md, AGENTS.md
8. Run quality gates

## Not Changed

- **Tests**: Zero tests exist for generation modules — no tests to remove
- **CI**: No references to AI generation — no changes needed
- **localStorage**: Dead keys remain in user browsers but cause no harm
