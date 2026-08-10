import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
    vi.spyOn(Notification, "prompt").mockResolvedValue({ ok: true, value: "deck.md" });

    const saved = await sm._saveMarkdownWithImages("# Hello", "deck.md");

    expect(saved).toBe(true);
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
      createWritable: vi.fn(async () => ({ write: vi.fn(), close: vi.fn() })),
    };
    const picker = vi.fn();
    // Stub the final window first so the registry map and the picker live on
    // the same object.
    vi.stubGlobal("window", { showSaveFilePicker: picker });
    DeckLoader.fileHandleRegistry.set("deck", handle);
    const prompt = vi.spyOn(Notification, "prompt");

    const saved = await sm._saveMarkdownWithImages("# Hello", "deck.md");

    expect(saved).toBe(true);
    expect(handle.createWritable).toHaveBeenCalledTimes(1);
    expect(picker).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
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

  it("removes stale images during a silent directory re-save", async () => {
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

    await sm._writeDeckToDir(dir, "deck.md", "# deck\n\n![keep](images/keep.png)", [
      "images/keep.png",
    ]);

    expect(removed).toEqual(["old.png"]);
  });
});
