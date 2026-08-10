import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { SaveManager, removeStaleImages } from "../editor/ui/save-manager.js";
import { Notification } from "../renderer/notification.js";
import { DeckLoader } from "../data/deck-loader.js";
import { DeckImagesResolver } from "../editor/image/deck-images-resolver.js";
import { DirectoryHandleStore } from "../core/directory-handle-store.js";

function makeImageDir(entries) {
  const removed = [];
  return {
    removed,
    handle: {
      entries: async function* () {
        for (const entry of entries) yield entry;
      },
      removeEntry: vi.fn(async (name) => {
        removed.push(name);
      }),
    },
  };
}

describe("removeStaleImages", () => {
  it("removes only the old deck's images that the new deck no longer uses", async () => {
    const { handle, removed } = makeImageDir([
      ["a.png", { kind: "file" }],
      ["b.png", { kind: "file" }],
      ["c.jpg", { kind: "file" }],
    ]);
    const oldImageNames = new Set(["a.png", "b.png", "c.jpg"]);

    await removeStaleImages(handle, ["images/b.png"], oldImageNames);

    expect(removed).toEqual(["a.png", "c.jpg"]);
  });

  it("never removes images the old deck did not reference (other decks' files)", async () => {
    const { handle, removed } = makeImageDir([
      ["a.png", { kind: "file" }],
      ["other-deck.png", { kind: "file" }],
    ]);

    await removeStaleImages(handle, ["images/a.png"], new Set(["a.png"]));

    expect(removed).toEqual([]);
  });

  it("ignores non-image files and directories", async () => {
    const { handle, removed } = makeImageDir([
      ["notes.txt", { kind: "file" }],
      ["sub", { kind: "directory" }],
      ["old.png", { kind: "file" }],
    ]);

    await removeStaleImages(handle, ["images/new.png"], new Set(["old.png", "notes.txt"]));

    expect(removed).toEqual(["old.png"]);
  });
});

function createSaveManager() {
  return new SaveManager({
    getDeck: () => ({ slides: [] }),
    getDeckStore: () => null,
    getUnsavedMarkdown: () => new Map(),
    getHasUnsavedChanges: () => false,
    setHasUnsavedChanges: () => {},
  });
}

describe("SaveManager working-state overlay", () => {
  it("stores, checks, and clears an overlay", () => {
    const sm = createSaveManager();
    expect(sm.hasUnsavedOverlay(0)).toBe(false);

    sm.setUnsavedEditorOverlay(0, "# Overlay");
    expect(sm.hasUnsavedOverlay(0)).toBe(true);

    sm.clearUnsavedEditorOverlay(0);
    expect(sm.hasUnsavedOverlay(0)).toBe(false);
  });

  it("getFullSlide returns the stored slide when no overlay is present", () => {
    const sm = createSaveManager();
    const slide = { index: 0, markdown: "# Stored", areas: { main: "<p>Stored</p>" } };
    expect(sm.getFullSlide(0, slide)).toBe(slide);
  });

  it("getFullSlide replaces markdown and keeps the same slide shape", () => {
    const sm = createSaveManager();
    const slide = { index: 0, markdown: "# Stored", areas: { main: "<p>Stored</p>" } };
    sm.setUnsavedEditorOverlay(0, "# Overlay");

    const full = sm.getFullSlide(0, slide);
    expect(full).not.toBe(slide);
    expect(full.index).toBe(0);
    expect(full.markdown).toBe("# Overlay");
    expect(full.areas).toEqual({ main: "<p>Stored</p>" });
  });

  it("getFullSlides maps overlays across the deck", () => {
    const sm = createSaveManager();
    sm.setUnsavedEditorOverlay(1, "## B edited");
    const slides = [
      { index: 0, markdown: "# A", areas: {} },
      { index: 1, markdown: "# B", areas: {} },
    ];

    const full = sm.getFullSlides(slides);
    expect(full[0].markdown).toBe("# A");
    expect(full[1].markdown).toBe("## B edited");
  });

  it("getFullMarkdown joins overlay markdown with slide separators", () => {
    const sm = createSaveManager();
    sm.setUnsavedEditorOverlay(1, "## B edited");
    const slides = [
      { index: 0, markdown: "# A", areas: {} },
      { index: 1, markdown: "# B", areas: {} },
    ];

    expect(sm.getFullMarkdown(slides)).toBe("# A\n\n---\n\n## B edited");
  });
});

describe("SaveManager save() dedup and file-name prompt", () => {
  beforeEach(() => {
    // DeckLoader.fileHandleRegistry and the save flow read window/localStorage.
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => {
    DeckLoader.fileHandleRegistry.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("dedupes concurrent save() calls while a save is in flight", async () => {
    const sm = createSaveManager();
    const doSave = vi.spyOn(sm, "_doMarkdownSave").mockResolvedValue(true);
    vi.spyOn(sm, "_prepareSave").mockResolvedValue({ fullMarkdown: "# x" });
    vi.spyOn(sm, "_markSaved").mockImplementation(() => {});

    const first = sm.save();
    const second = sm.save();
    expect(second).toBe(first);
    await Promise.all([first, second]);

    expect(doSave).toHaveBeenCalledTimes(1);
  });

  it("throws AbortError when the file-name prompt is cancelled", async () => {
    const sm = createSaveManager();
    vi.spyOn(Notification, "prompt").mockResolvedValue({ ok: false, value: "" });

    await expect(sm._promptFileName("deck.md")).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("sanitizes the chosen name and appends .md when missing", async () => {
    const sm = createSaveManager();
    vi.spyOn(Notification, "prompt").mockResolvedValue({ ok: true, value: "  My Deck  " });

    await expect(sm._promptFileName("deck.md")).resolves.toBe("My Deck.md");
  });

  it("registers the native file handle and stores the actual written name", async () => {
    const sm = createSaveManager();
    const handle = {
      name: "Renamed.md",
      createWritable: async () => ({ write: vi.fn(), close: vi.fn() }),
    };
    const picker = vi.fn().mockResolvedValue(handle);
    vi.stubGlobal("window", { showSaveFilePicker: picker });
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    const prompt = vi.spyOn(Notification, "prompt");

    const saved = await sm._saveMarkdownWithImages("# Hello", "deck.md");

    expect(saved).toBe(true);
    // The native picker names the file itself — no duplicate app prompt.
    expect(prompt).not.toHaveBeenCalled();
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: "deck.md" }));
    expect(DeckLoader.fileHandleRegistry.get("Renamed.md")).toBe(handle);
    expect(DeckLoader.fileHandleRegistry.get("Renamed")).toBe(handle);
    expect(localStorage.setItem).toHaveBeenCalledWith("webdeck_local_file_name", "Renamed");
    expect(localStorage.setItem).toHaveBeenCalledWith("webdeck_opened_from_picker", "1");
  });

  it("re-saves silently through the registered file handle", async () => {
    const sm = createSaveManager();
    const handle = {
      name: "deck.md",
      getFile: async () => ({ text: async () => "# Hello" }),
      createWritable: vi.fn(async () => ({ write: vi.fn(), close: vi.fn() })),
    };
    const picker = vi.fn();
    // Stub the final window first so the registry map and the picker live on
    // the same object.
    vi.stubGlobal("window", { showSaveFilePicker: picker });
    DeckLoader.fileHandleRegistry.set("deck", handle);
    const prompt = vi.spyOn(Notification, "prompt");
    vi.stubGlobal("localStorage", {
      // The deck's source baseline — must match the handle's file content.
      getItem: vi.fn(() => "# Hello"),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });

    const saved = await sm._saveMarkdownWithImages("# Hello", "deck.md");

    expect(saved).toBe(true);
    expect(handle.createWritable).toHaveBeenCalledTimes(1);
    expect(picker).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
  });

  it("does not silently overwrite a registered handle that belongs to a different file", async () => {
    const sm = createSaveManager();
    const handle = {
      name: "notes.md",
      getFile: async () => ({ text: async () => "unrelated content" }),
      createWritable: vi.fn(async () => ({ write: vi.fn(), close: vi.fn() })),
    };
    DeckLoader.fileHandleRegistry.set("notes", handle);
    const picker = vi.fn().mockResolvedValue({
      name: "notes.md",
      createWritable: async () => ({ write: vi.fn(), close: vi.fn() }),
    });
    vi.stubGlobal("window", { showSaveFilePicker: picker });
    vi.stubGlobal("localStorage", {
      // The current deck's baseline differs from the registered file's
      // content, so the stale handle must not be written through.
      getItem: vi.fn(() => "# my deck"),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });

    const saved = await sm._saveMarkdownWithImages("# my deck", "notes.md");

    expect(saved).toBe(true);
    expect(handle.createWritable).not.toHaveBeenCalled();
    expect(picker).toHaveBeenCalled();
  });

  it("does not overwrite the previous file when a new name was chosen", async () => {
    const sm = createSaveManager();
    const oldHandle = {
      name: "deck.md",
      createWritable: vi.fn(async () => ({ write: vi.fn(), close: vi.fn() })),
    };
    DeckLoader.fileHandleRegistry.set("deck", oldHandle);
    const picker = vi.fn().mockResolvedValue({
      name: "New Name.md",
      createWritable: async () => ({ write: vi.fn(), close: vi.fn() }),
    });
    vi.stubGlobal("window", {
      showDirectoryPicker: vi.fn(async () => {
        throw new Error("picker failed");
      }),
      showSaveFilePicker: picker,
    });
    const prompt = vi.spyOn(Notification, "prompt").mockResolvedValue({
      ok: true,
      value: "New Name.md",
    });
    vi.spyOn(DirectoryHandleStore, "load").mockResolvedValue({ handle: null });
    vi.spyOn(Notification, "showModal").mockResolvedValue("md");

    const saved = await sm._saveMarkdownWithImages("# x\n\n![a](images/a.png)", "deck.md");

    expect(saved).toBe(true);
    // The chosen name wins over the old silent handle.
    expect(oldHandle.createWritable).not.toHaveBeenCalled();
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: "New Name.md" }));
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("rejects an in-memory folder that does not contain the deck file", async () => {
    const sm = createSaveManager();
    const dir = {
      queryPermission: async () => "granted",
      getFileHandle: vi.fn(async () => {
        throw new DOMException("not found", "NotFoundError");
      }),
    };
    vi.spyOn(DeckImagesResolver, "getDirectoryHandle").mockReturnValue(dir);
    vi.spyOn(DirectoryHandleStore, "load").mockResolvedValue({ handle: null });

    const result = await sm._restoreDeckDir("deck.md");

    expect(result).toBeNull();
    expect(dir.getFileHandle).toHaveBeenCalledWith("deck.md");
  });

  it("requests readwrite permission for a stored folder handle after a reload", async () => {
    const sm = createSaveManager();
    const requestPermission = vi.fn().mockResolvedValue("granted");
    const stored = {
      queryPermission: vi.fn(async () => "prompt"),
      requestPermission,
      getFileHandle: vi.fn(async () => ({})),
    };
    vi.spyOn(DeckImagesResolver, "getDirectoryHandle").mockReturnValue(null);
    vi.spyOn(DirectoryHandleStore, "load").mockResolvedValue({ handle: stored });

    const result = await sm._restoreDeckDir("deck.md");

    expect(requestPermission).toHaveBeenCalledWith({ mode: "readwrite" });
    expect(result).toBe(stored);
  });

  it("treats a stored folder handle without queryPermission as usable", async () => {
    const sm = createSaveManager();
    const stored = {
      getFileHandle: vi.fn(async () => ({})),
    };
    vi.spyOn(DeckImagesResolver, "getDirectoryHandle").mockReturnValue(null);
    vi.spyOn(DirectoryHandleStore, "load").mockResolvedValue({ handle: stored });

    const result = await sm._restoreDeckDir("deck.md");

    expect(result).toBe(stored);
    expect(stored.getFileHandle).toHaveBeenCalledWith("deck.md");
  });

  it("falls back to the picker flow when readwrite permission is refused", async () => {
    const sm = createSaveManager();
    const stored = {
      queryPermission: vi.fn(async () => "prompt"),
      requestPermission: vi.fn(async () => "denied"),
    };
    vi.spyOn(DeckImagesResolver, "getDirectoryHandle").mockReturnValue(null);
    vi.spyOn(DirectoryHandleStore, "load").mockResolvedValue({ handle: stored });

    await expect(sm._restoreDeckDir("deck.md")).resolves.toBeNull();
  });

  it("rejects a stored folder that does not contain the deck file", async () => {
    const sm = createSaveManager();
    const stored = {
      queryPermission: vi.fn(async () => "granted"),
      requestPermission: vi.fn(),
      getFileHandle: vi.fn(async () => {
        throw new DOMException("not found", "NotFoundError");
      }),
    };
    vi.spyOn(DeckImagesResolver, "getDirectoryHandle").mockReturnValue(null);
    vi.spyOn(DirectoryHandleStore, "load").mockResolvedValue({ handle: stored });

    const result = await sm._restoreDeckDir("deck.md");

    expect(result).toBeNull();
    expect(stored.getFileHandle).toHaveBeenCalledWith("deck.md");
  });

  it("names the fallback blob download with the name chosen in the dialog", async () => {
    const sm = createSaveManager();
    const { window: domWindow } = new JSDOM("<!doctype html><html><body></body></html>");
    vi.stubGlobal("document", domWindow.document);
    vi.stubGlobal("window", {
      showSaveFilePicker: vi.fn(async () => {
        throw new Error("picker failed");
      }),
    });
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(Notification, "prompt").mockResolvedValue({ ok: true, value: "My Deck.md" });
    const appendSpy = vi.spyOn(domWindow.document.body, "appendChild");

    const saved = await sm._saveMarkdownWithImages("# Hello", "deck.md");

    expect(saved).toBe(true);
    const anchor = appendSpy.mock.calls.map(([el]) => el).find((el) => el.tagName === "A");
    expect(anchor.download).toBe("My Deck.md");
  });

  it("records the session and still succeeds when the images sidecar cannot be written", async () => {
    const sm = createSaveManager();
    const dir = {
      getFileHandle: vi.fn(async () => ({
        createWritable: async () => ({ write: vi.fn(), close: vi.fn() }),
      })),
      getDirectoryHandle: vi.fn(async () => {
        throw new Error("a plain file named images exists");
      }),
    };
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    const saveSpy = vi.spyOn(DirectoryHandleStore, "save").mockResolvedValue(undefined);
    const warning = vi.spyOn(Notification, "warning").mockImplementation(() => {});

    await expect(sm._writeDeckToDir(dir, "deck.md", "# deck", [])).resolves.toBeUndefined();

    // The .md is on disk, so the session must be recorded before the
    // sidecar failure is reported — a reload must find the new folder.
    expect(saveSpy).toHaveBeenCalledWith(dir, "parent", "deck.md");
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining("deck.md was saved, but images could not be saved"),
      6000,
    );
  });

  it("keeps stale images and warns during a silent directory re-save", async () => {
    const sm = createSaveManager();
    const removed = [];
    const sidecar = {
      removeEntry: vi.fn(async (name) => {
        removed.push(name);
      }),
      entries: async function* () {
        yield ["old.png", { kind: "file" }];
        yield ["keep.png", { kind: "file" }];
      },
      getFileHandle: vi.fn(async () => ({
        createWritable: async () => ({ write: vi.fn(), close: vi.fn() }),
      })),
    };
    const oldFile = {
      getFile: async () => ({
        text: async () => "![old](images/old.png)\n![keep](images/keep.png)",
      }),
    };
    const mdHandle = {
      createWritable: async () => ({ write: vi.fn(), close: vi.fn() }),
    };
    const dir = {
      getFileHandle: vi.fn(async (name, opts) => {
        if (name === "deck.md" && !opts?.create) return oldFile;
        return mdHandle;
      }),
      getDirectoryHandle: vi.fn(async () => sidecar),
    };
    vi.spyOn(DeckImagesResolver, "getImageFile").mockResolvedValue(new Blob(["x"]));
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    vi.spyOn(DirectoryHandleStore, "save").mockResolvedValue(undefined);
    const warning = vi.spyOn(Notification, "warning").mockImplementation(() => {});

    await sm._writeDeckToDir(dir, "deck.md", "# deck\n\n![keep](images/keep.png)", [
      "images/keep.png",
    ]);

    // The unconfirmed silent re-save must never delete files the deck no
    // longer references — it only warns, so an undo cannot lose data.
    expect(removed).toEqual([]);
    expect(sidecar.removeEntry).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining("1 image(s) from the previous version"),
      6000,
    );
  });

  it("keeps the dirty state when edits arrive while the save was in flight", async () => {
    const unsaved = new Map();
    let dirty = false;
    const sm = new SaveManager({
      getDeck: () => ({ slides: [] }),
      getDeckStore: () => ({ getSlides: () => ["# A"] }),
      getUnsavedMarkdown: () => unsaved,
      getHasUnsavedChanges: () => dirty,
      setHasUnsavedChanges: (v) => {
        dirty = v;
      },
      onSaveStateReset: () => {},
    });

    // Nothing changed while the save was in flight — marked clean.
    sm._markSaved("# A");
    expect(dirty).toBe(false);

    // An edit lands while the save dialogs are open (the edit path marks
    // the deck dirty)…
    unsaved.set(0, "# A edited");
    dirty = true;
    sm._markSaved("# A");
    // …so the save that just completed must not clear the dirty state.
    expect(dirty).toBe(true);
    expect(unsaved.has(0)).toBe(true);

    // A follow-up save of the newer content clears it.
    sm._markSaved("# A edited");
    expect(dirty).toBe(false);
    expect(unsaved.size).toBe(0);
  });
});
