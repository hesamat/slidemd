import { describe, it, expect, vi } from "vitest";
import { MarkdownEditor } from "../editor/core/markdown-editor.js";
import { EditController } from "../editor/core/edit-controller.js";

describe("Per-slide editor undo history", () => {
  describe("MarkdownEditor slide state cache", () => {
    it("saveSlideState stores the current EditorState for a slide index", () => {
      const fakeState = { doc: { toString: () => "# A" } };
      const editor = {
        view: { state: fakeState },
        _slideStateCache: new Map(),
        _cacheMaxEntries: 50,
        _cacheCleared: false,
        _deckRevision: 0,
      };

      MarkdownEditor.prototype.saveSlideState.call(editor, 0);
      expect(editor._slideStateCache.get(0).state).toBe(fakeState);
    });

    it("saveSlideState ignores negative indices", () => {
      const editor = {
        view: { state: {} },
        _slideStateCache: new Map(),
        _cacheMaxEntries: 50,
        _cacheCleared: false,
        _deckRevision: 0,
      };

      MarkdownEditor.prototype.saveSlideState.call(editor, -1);
      expect(editor._slideStateCache.size).toBe(0);
    });

    it("loadSlideState restores a cached state when the document matches", () => {
      const cachedState = { doc: { toString: () => "# A" } };
      const setState = vi.fn();
      const editor = {
        view: { setState },
        value: "",
        _slideStateCache: new Map([[0, { state: cachedState, revision: 0 }]]),
        _cacheCleared: false,
        _deckRevision: 0,
      };

      const restored = MarkdownEditor.prototype.loadSlideState.call(editor, 0, "# A");
      expect(restored).toBe(true);
      expect(setState).toHaveBeenCalledWith(cachedState);
    });

    it("loadSlideState creates a fresh state when no cache exists", () => {
      const setState = vi.fn();
      const editor = {
        view: { setState },
        value: "",
        _slideStateCache: new Map(),
        extensions: [],
        _cacheCleared: false,
        _deckRevision: 0,
      };

      const restored = MarkdownEditor.prototype.loadSlideState.call(editor, 1, "# B");
      expect(restored).toBe(false);
      expect(setState).toHaveBeenCalledTimes(1);
    });

    it("loadSlideState drops cached state when doc differs", () => {
      const cachedState = { doc: { toString: () => "# old", length: 5 } };
      const setState = vi.fn();
      const editor = {
        view: { setState },
        value: "",
        _slideStateCache: new Map([[0, { state: cachedState, revision: 0 }]]),
        _cacheCleared: false,
        _deckRevision: 0,
        extensions: [],
      };

      const restored = MarkdownEditor.prototype.loadSlideState.call(editor, 0, "# new");
      // Should return false (fresh state, not cached restore).
      expect(restored).toBe(false);
      // Should create a fresh state, not restore the stale cached one.
      expect(setState).toHaveBeenCalledTimes(1);
      // Stale cache entry should be evicted.
      expect(editor._slideStateCache.has(0)).toBe(false);
    });

    it("saveSlideState is skipped once after clearSlideStateCache", () => {
      const fakeState = { doc: { toString: () => "# A" } };
      const editor = {
        view: { state: fakeState },
        _slideStateCache: new Map(),
        _cacheMaxEntries: 50,
        _cacheCleared: false,
        _deckRevision: 0,
      };

      MarkdownEditor.prototype.clearSlideStateCache.call(editor);
      expect(editor._cacheCleared).toBe(true);
      expect(editor._deckRevision).toBe(1);

      // First saveSlideState should be skipped (stale state) and reset flag.
      MarkdownEditor.prototype.saveSlideState.call(editor, 0);
      expect(editor._slideStateCache.size).toBe(0);
      expect(editor._cacheCleared).toBe(false);

      // Second saveSlideState should work normally.
      MarkdownEditor.prototype.saveSlideState.call(editor, 0);
      expect(editor._slideStateCache.size).toBe(1);
    });

    it("cache evicts oldest entry when over cap (true LRU)", () => {
      const fakeState = { doc: { toString: () => "" } };
      const editor = {
        view: { state: fakeState },
        _slideStateCache: new Map(),
        _cacheMaxEntries: 3,
        _cacheCleared: false,
        _deckRevision: 0,
      };

      // Insert 0, 1, 2
      for (let i = 0; i < 3; i++) {
        MarkdownEditor.prototype.saveSlideState.call(editor, i);
      }
      // Re-save slide 0 — should move it to the end (most recently used).
      MarkdownEditor.prototype.saveSlideState.call(editor, 0);
      // Insert slide 3 — should evict slide 1 (now the oldest), not slide 0.
      MarkdownEditor.prototype.saveSlideState.call(editor, 3);

      expect(editor._slideStateCache.size).toBe(3);
      expect(editor._slideStateCache.has(0)).toBe(true);
      expect(editor._slideStateCache.has(1)).toBe(false);
      expect(editor._slideStateCache.has(3)).toBe(true);
    });

    it("clearSlideStateCache removes all entries and bumps revision", () => {
      const editor = {
        _slideStateCache: new Map([
          [0, { state: {}, revision: 0 }],
          [1, { state: {}, revision: 0 }],
        ]),
        _cacheCleared: false,
        _deckRevision: 0,
      };

      MarkdownEditor.prototype.clearSlideStateCache.call(editor);
      expect(editor._slideStateCache.size).toBe(0);
      expect(editor._deckRevision).toBe(1);
    });

    it("loadSlideState rejects cached entry with stale revision", () => {
      const cachedState = { doc: { toString: () => "# A" } };
      const setState = vi.fn();
      const editor = {
        view: { setState },
        value: "",
        _slideStateCache: new Map([[0, { state: cachedState, revision: 0 }]]),
        _cacheCleared: false,
        _deckRevision: 1, // Revision bumped after structural change
        extensions: [],
      };

      // Same doc text but wrong revision — should not restore.
      const restored = MarkdownEditor.prototype.loadSlideState.call(editor, 0, "# A");
      expect(restored).toBe(false);
      expect(editor._slideStateCache.has(0)).toBe(false);
    });
  });

  describe("EditController.loadSlideIntoEditor", () => {
    it("saves outgoing slide state before switching to a different slide", () => {
      const saveSlideState = vi.fn();
      const loadSlideState = vi.fn();
      const getValue = vi.fn(() => "# old");
      const deck = { id: 1 };
      const fake = {
        isEditMode: true,
        currentSlideIndex: 1,
        deck,
        _lastEditorSlideIndex: 0,
        _lastEditorDeck: deck,
        deckStore: { getSlides: () => ["# A", "# B"] },
        unsavedMarkdown: new Map(),
        _captureEditorMarkdown: vi.fn(),
        markdownEditor: {
          getValue,
          setValue: vi.fn(),
          saveSlideState,
          loadSlideState,
          hasClearedCache: vi.fn(() => false),
          clearSlideStateCache: vi.fn(),
        },
        saveManager: { updateButton: vi.fn() },
        areaGuides: { refresh: vi.fn() },
      };

      EditController.prototype.loadSlideIntoEditor.call(fake);

      // Should save the outgoing slide (index 0) before loading the new one.
      expect(saveSlideState).toHaveBeenCalledWith(0);
      // Should load the new slide's state from cache (or create fresh).
      expect(loadSlideState).toHaveBeenCalledWith(1, "# B");
    });

    it("uses setValue (not cache) when staying on the same slide", () => {
      const saveSlideState = vi.fn();
      const loadSlideState = vi.fn();
      const setValue = vi.fn();
      const getValue = vi.fn(() => "# old");
      const deck = { id: 1 };
      const fake = {
        isEditMode: true,
        currentSlideIndex: 0,
        deck,
        _lastEditorSlideIndex: 0,
        _lastEditorDeck: deck,
        deckStore: { getSlides: () => ["# A"] },
        unsavedMarkdown: new Map(),
        _captureEditorMarkdown: vi.fn(),
        markdownEditor: {
          getValue,
          setValue,
          saveSlideState,
          loadSlideState,
          hasClearedCache: vi.fn(() => false),
          clearSlideStateCache: vi.fn(),
        },
        saveManager: { updateButton: vi.fn() },
        areaGuides: { refresh: vi.fn() },
      };

      EditController.prototype.loadSlideIntoEditor.call(fake);

      // Same slide — should use setValue, not the cache.
      expect(saveSlideState).not.toHaveBeenCalled();
      expect(loadSlideState).not.toHaveBeenCalled();
      expect(setValue).toHaveBeenCalledWith("# A", { suppressOnChange: true });
    });

    it("short-circuits when markdown is unchanged on the same slide", () => {
      const setValue = vi.fn();
      const getValue = vi.fn(() => "# A");
      const deck = { id: 1 };
      const fake = {
        isEditMode: true,
        currentSlideIndex: 0,
        deck,
        _lastEditorSlideIndex: 0,
        _lastEditorDeck: deck,
        deckStore: { getSlides: () => ["# A"] },
        unsavedMarkdown: new Map(),
        _captureEditorMarkdown: vi.fn(),
        markdownEditor: {
          getValue,
          setValue,
          saveSlideState: vi.fn(),
          loadSlideState: vi.fn(),
          hasClearedCache: vi.fn(() => false),
          clearSlideStateCache: vi.fn(),
        },
        saveManager: { updateButton: vi.fn() },
        areaGuides: { refresh: vi.fn() },
      };

      EditController.prototype.loadSlideIntoEditor.call(fake);
      expect(setValue).not.toHaveBeenCalled();
    });
  });
});
