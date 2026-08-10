import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { KeyboardHandler } from "../engine/keyboard-handler.js";
import { createKeyboardHandler } from "../engine/deck-keyboard.js";
import { buildPaletteCommands } from "../engine/command-registry.js";

function setupDom() {
  const { window } = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  vi.stubGlobal("window", window);
  vi.stubGlobal("document", window.document);
  vi.stubGlobal("navigator", window.navigator);
  return window;
}

function keyEvent(window, key, opts = {}) {
  return new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts });
}

describe("KeyboardHandler Layer 0 (global actions)", () => {
  beforeEach(() => setupDom());
  afterEach(() => vi.unstubAllGlobals());

  function makeHandler(action) {
    return new KeyboardHandler({
      commandPalette: action,
      isEditMode: () => false,
      isEditorWindow: () => true,
      isBreakActive: () => false,
      getMarkdownEditor: () => null,
    });
  }

  it("prevents the default when the global action reports handled", () => {
    const action = vi.fn(() => undefined);
    const handler = makeHandler(action);
    const e = keyEvent(window, "k", { ctrlKey: true });

    handler.handleKeyboard(e);

    expect(action).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it("does not prevent the default when the global action returns false", () => {
    const action = vi.fn(() => false);
    const handler = makeHandler(action);
    const e = keyEvent(window, "k", { ctrlKey: true });

    handler.handleKeyboard(e);

    expect(action).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(false);
  });
});

describe("createKeyboardHandler save action", () => {
  beforeEach(() => setupDom());
  afterEach(() => {
    delete window.__WEBDECK_EDIT_CONTROLLER__;
    delete window.__WEBDECK_EXPORTED__;
    vi.unstubAllGlobals();
  });

  function makeHandler() {
    return createKeyboardHandler({
      getSlideNavigator: () => null,
      getRoleManager: () => ({ isEditorWindow: true, togglePresentWindow: () => {} }),
      getBreakManager: () => null,
      getReloadManager: () => ({ handleReloadDeck: () => {} }),
      getCommandPalette: () => null,
      toggleEditMode: () => {},
      toggleFullscreen: () => {},
      isEditMode: () => false,
    });
  }

  it("saves when an edit controller exists, regardless of edit mode", () => {
    const save = vi.fn();
    window.__WEBDECK_EDIT_CONTROLLER__ = { saveManager: { save } };
    const handler = makeHandler();

    expect(handler.actions.save()).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("declines (returns false) in exported decks with no editor, letting the browser handle Ctrl+S", () => {
    window.__WEBDECK_EXPORTED__ = true;
    const handler = makeHandler();

    expect(handler.actions.save()).toBe(false);
  });

  it("still suppresses Ctrl+S in app windows without an editor (presenter/viewer)", () => {
    const handler = makeHandler();

    expect(handler.actions.save()).toBe(true);
  });
});

describe("command palette save enablement", () => {
  beforeEach(() => setupDom());
  afterEach(() => vi.unstubAllGlobals());

  it("enables Save when an editor window is active, regardless of edit mode", () => {
    const commands = buildPaletteCommands(
      { roleManager: { isEditorWindow: true }, isEditMode: () => false },
      { save: () => {} },
    );
    const save = commands.find((c) => c.id === "save");

    expect(save.isEnabled()).toBe(true);
  });

  it("disables Save in viewer/presenter windows without an editor", () => {
    const commands = buildPaletteCommands(
      { roleManager: { isEditorWindow: false }, isEditMode: () => false },
      { save: () => {} },
    );
    const save = commands.find((c) => c.id === "save");

    expect(save.isEnabled()).toBe(false);
  });
});
