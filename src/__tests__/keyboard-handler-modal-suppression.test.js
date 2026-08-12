// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { KeyboardHandler } from "../engine/keyboard-handler.js";
import { _resetModalState, modalOpened, modalClosed } from "../core/modal-state.js";

function createHandler() {
  const calls = [];
  const handler = new KeyboardHandler({
    next: () => calls.push("next"),
    prev: () => calls.push("prev"),
    first: () => calls.push("first"),
    last: () => calls.push("last"),
    goto: () => calls.push("goto"),
    search: () => calls.push("search"),
    edit: () => calls.push("edit"),
    theme: () => calls.push("theme"),
    fullscreen: () => calls.push("fullscreen"),
    reload: () => calls.push("reload"),
    commandPalette: () => calls.push("commandPalette"),
    isEditMode: () => false,
    isEditorWindow: () => true,
  });
  return { handler, calls };
}

function keyEvent(key, opts = {}) {
  return new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ctrlKey: !!opts.ctrl,
    metaKey: !!opts.meta,
    altKey: !!opts.alt,
    shiftKey: !!opts.shift,
  });
}

describe("KeyboardHandler modal suppression", () => {
  beforeEach(() => {
    _resetModalState();
  });

  it("fires next action on ArrowDown when no modal is open", () => {
    const { handler, calls } = createHandler();
    const e = keyEvent("ArrowDown");
    handler.handleKeyboard(e);
    expect(calls).toEqual(["next"]);
  });

  it("suppresses all shortcuts when a modal is open", () => {
    const { handler, calls } = createHandler();
    modalOpened();
    const e = keyEvent("ArrowDown");
    handler.handleKeyboard(e);
    expect(calls).toEqual([]);
    expect(e.defaultPrevented).toBe(false);
  });

  it("suppresses global Ctrl+K when a modal is open", () => {
    const { handler, calls } = createHandler();
    modalOpened();
    const isMac = false;
    const e = keyEvent("k", { ctrl: !isMac, meta: isMac });
    handler.handleKeyboard(e);
    expect(calls).toEqual([]);
  });

  it("resumes shortcuts after the modal closes", () => {
    const { handler, calls } = createHandler();
    modalOpened();
    handler.handleKeyboard(keyEvent("ArrowDown"));
    modalClosed();
    handler.handleKeyboard(keyEvent("ArrowDown"));
    expect(calls).toEqual(["next"]);
  });

  it("suppresses plain-key shortcuts while nested modals are open", () => {
    const { handler, calls } = createHandler();
    modalOpened();
    modalOpened();
    handler.handleKeyboard(keyEvent("ArrowDown"));
    expect(calls).toEqual([]);
    modalClosed();
    handler.handleKeyboard(keyEvent("ArrowDown"));
    expect(calls).toEqual([]);
    modalClosed();
    handler.handleKeyboard(keyEvent("ArrowDown"));
    expect(calls).toEqual(["next"]);
  });
});
