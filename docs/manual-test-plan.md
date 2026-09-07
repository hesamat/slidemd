# Manual Test Plan

Step-by-step manual verification for the critical user flows of the v1.0
release. Each step states the exact action
and the expected outcome. This plan is grown incrementally: sections marked
"To be written" are scoped but not yet documented.

Unless noted otherwise, start every flow from a fresh app window with the
example deck loaded (`node tools/dev.mjs docs/example/slides.md`).

## Keyboard shortcuts

Coverage below mirrors the registry in `src/core/keyboard-shortcuts.js`
(single source of truth; rendered by `docs/keyboard-shortcuts.md`, the footer
shortcut buttons, and the Format dropdown hints).

### Navigation (viewer and editor windows)

1. Focus the stage (click an empty part of the slide area) and press `→`, `↓`,
   `Space`, and `PageDown`. Expected: each key advances to the next slide; the
   slide indicator (`n / total`, bottom of stage) increments.
2. Press `←`, `↑`, `PageUp`, and `Backspace`. Expected: each key goes back one
   slide.
3. Press `Home`, then `End`. Expected: jump to the first slide, then the last
   (visible) slide.
4. Press `G`, type `3`, press `Enter`. Expected: the "go to slide" prompt
   accepts the number and lands on slide 3.
5. Reload the page. Expected: the stage restores the last viewed slide.

### View controls (editor window)

6. Press `E`. Expected: edit mode toggles; the editor panel appears/disappears.
7. Press `T`. Expected: the app theme (UI chrome) toggles light/dark.
8. Press `R`. Expected: the deck reloads from its source without losing the
   current slide position.
9. Press `P` while in viewing mode. Expected: a viewer window opens for the
   audience display. Press `P` in edit mode. Expected: nothing happens (this
   shortcut is disabled while editing).
10. Press `B`. Expected: the break overlay toggles (viewing mode only).
11. Press `F` with the stage focused. Expected: the stage goes fullscreen;
    pressing `F` again (or `Escape`) exits.
12. Press `Ctrl+K` (`Cmd+K` on macOS) while a modal is open and while typing in
    the markdown editor. Expected: the command palette opens in both contexts
    (it is a global shortcut); other single-key shortcuts must NOT fire while
    a modal is open or while typing.

### Edit mode — structural

13. Enter edit mode (`E`). Press `Alt+N`. Expected: the layout picker opens for
    a new slide; `Escape` cancels without adding a slide.
14. Press `Alt+D`. Expected: the current slide is duplicated directly after
    itself.
15. Press `Alt+Backspace`. Expected: a confirmation appears; confirming removes
    the slide, cancelling keeps it.
16. Press `Alt+Shift+↑` and `Alt+Shift+↓`. Expected: the current slide swaps
    position with the previous/next slide in the thumbnail rail.
17. Press `Ctrl+Z` (`Cmd+Z`) after an edit. Expected: the edit reverts. Press
    `Ctrl+Shift+Z`, then `Ctrl+Y`. Expected: both redo the reverted edit.

### Edit mode — insert content and styling

18. Press `Alt+I`. Expected: the image picker opens.
19. Press `Alt+T`. Expected: a new text block is inserted into the current
    slide's main area.
20. Press `Alt+L`. Expected: the layout picker opens for the current slide.
21. Press `Alt+A`. Expected: column resize handles appear on the current slide;
    pressing again hides them.
22. Press `Alt+M`. Expected: the Mermaid helper panel toggles.
23. Press `Alt+Shift+T`. Expected: the current slide's `theme:` directive
    toggles between dark and light.
24. Press `Alt+S`. Expected: the slide styles panel toggles.

### Discoverability and conflicts

25. Open the menu, the Format dropdown, and the AI dropdown. Expected: every
    shortcut hint matches `docs/keyboard-shortcuts.md` and the registry (e.g.
    slide theme shows `Alt+Shift+T`, there is no `Alt+B` entry anywhere).
26. Focus the markdown editor and type `e`, `t`, `p`. Expected: characters are
    typed into the editor; no single-key shortcuts fire while typing.
27. With the stage focused, press `Ctrl+F`. Expected: the browser's own find
    bar opens (the app deliberately does not intercept it). Press `/`. Expected:
    the in-app slide search opens instead.

## Accessibility & screen reader

### Slide-change announcements (stage)

1. Start a screen reader (VoiceOver on macOS: `Cmd+F5`; NVDA on Windows:
   `Ctrl+Alt+N`).
2. Load the example deck and focus the stage. Expected: the screen reader is
   not interrupted; the slide indicator is visible.
3. Press `→` to change slides. Expected: the screen reader announces
   "Slide 2 of N: <title>" politely (after current speech, not interrupting).
4. Press `→` quickly several times. Expected: announcements queue politely and
   never crash or duplicate the app state.
5. Press `F` to fullscreen the stage, then navigate. Expected: announcements
   continue while fullscreen (the live region lives inside the fullscreened
   stage).
6. Navigate to a slide without a title (if available). Expected: the
   announcement reads "Slide N of M" without a trailing colon or empty title.

### Slide semantics

7. Inspect each rendered slide with the screen reader's element reader
   (VoiceOver: `VO+Right`). Expected: slides expose
   `aria-roledescription="slide"` and an `aria-label` "Slide N of M: <title>";
   hidden slides are not announced during normal navigation.
8. Tab through the page. Expected: focus order is sensible (menu, editor, then
   stage controls), no focus is trapped, and the visually-hidden live region is
   not a tab stop.

### Alt text propagation (PPTX import)

9. Import a `.pptx` where the author set alt text on a picture (Format
   Picture → Alt Text in PowerPoint). Expected: the generated markdown `<img>`
   carries the author alt text (not "Slide image N").
10. Check the rendered slide and the HTML export (`Menu → Export HTML`).
    Expected: the `alt` attribute survives rendering and export unchanged.
11. Import a `.pptx` with a diagram. Expected: the diagram image's alt text
    contains the original shape labels.

### Notifications and modals

12. Trigger a toast (e.g. save with no destination). Expected: the toast is
    announced (its container is `aria-live="polite"`).
13. Open any modal. Expected: `Escape` closes it and focus returns to the page;
    keyboard shortcuts do not leak through the modal (except global ones like
    `Ctrl+K`).

## Presenter view

1. Press `P` in viewing mode. Expected: a viewer window opens; the presenter
   panel shows elapsed time, clock, break controls, next-slide preview, and
   speaker notes.
2. Navigate in the editor window. Expected: the viewer window follows the same
   slide without manual refresh.
3. Type speaker notes into the notes area of slide 1. Expected: notes appear in
   the presenter panel for slide 1 only.
4. Set the break length dropdown to 5 minutes and press `B`. Expected: the
   break overlay shows the return time; `B` again (or the overlay's end
   control) ends the break.
5. Drag the viewer window to a second display (if available). Expected: the
   window placement persists; on a single display the placement prompt does not
   block presenting.
6. Deck-folder images across windows (Chromium only): open a deck from disk
   via **Open File** (a deck with an `images/` folder), then press `P`.
   Expected: images render in both the editor and the viewer window. Insert a
   new image in the editor and save with `Ctrl+S`, then reload the viewer
   window (`Ctrl+R`). Expected: the viewer still renders all deck images,
   including the newly added one.

## Command palette & full-text search

1. Press `Ctrl+K` (`Cmd+K`). Expected: the command palette opens with a search
   input focused.
2. Type "theme" and press `Enter`. Expected: the matching command executes.
3. Press `/` (or `Ctrl+Shift+F`). Expected: the slide search modal opens.
4. Type a term that exists in the deck. Expected: results list slides with
   matches and snippet context.
5. Press `↓`/`↑` to move through results, `Enter` to jump. Expected: the app
   navigates to the selected slide and highlights the match.
6. Press `Escape`. Expected: the search modal closes; focus returns to the
   stage.

## Undo/redo

1. Edit slide text, press `Ctrl+Z`. Expected: the text reverts in the editor
   and the preview.
2. Press `Ctrl+Z` repeatedly past several edits. Expected: changes revert in
   reverse order without deleting slides unexpectedly.
3. Press `Ctrl+Shift+Z` / `Ctrl+Y`. Expected: edits are re-applied.
4. Undo after a structural change (slide delete via `Alt+Backspace` confirm).
   Expected: the slide is restored.
5. Undo immediately after a save. Expected: the just-saved text is reverted,
   not an earlier unrelated change.

## To be written

The remaining v1.0 flows still need their step-by-step procedures
documented. Scope notes:

- **AI whole-deck operations (Polish, Remix, Reimagine)** — verify each
  operation preserves slide count/order where promised, shows progress and
  cancel affordances, and produces editable markdown.
- **PPTX import with real files** — conversion modal options, content images,
  backgrounds, theme mapping, degradation warnings for unsupported shapes.
- **HTML/PDF export** — exported HTML opens standalone and offline; PDF page
  sizing, backgrounds, fonts, and math/diagram fidelity.
- **Text blocks** — directive attributes (columns, presets, markdown),
  properties panel round-trip, drag repositioning.
- **Image drag** — insert, drag between areas, resize, background handling.
- **Conflict resolution** — concurrent edits via the store broadcast, dirty
  baseline behavior after save.
- **Auto-save** — dirty flag transitions, source baseline updates, fallback
  when localStorage is unavailable.
