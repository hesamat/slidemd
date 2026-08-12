// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { modalOpened, modalClosed, isModalOpen, _resetModalState } from "../core/modal-state.js";

describe("modal-state", () => {
  beforeEach(() => {
    _resetModalState();
  });

  it("starts with no modals open", () => {
    expect(isModalOpen()).toBe(false);
    expect(document.body.hasAttribute("data-modal-open")).toBe(false);
  });

  it("sets data-modal-open on body when a modal opens", () => {
    modalOpened();
    expect(isModalOpen()).toBe(true);
    expect(document.body.hasAttribute("data-modal-open")).toBe(true);
  });

  it("removes data-modal-open when the last modal closes", () => {
    modalOpened();
    modalClosed();
    expect(isModalOpen()).toBe(false);
    expect(document.body.hasAttribute("data-modal-open")).toBe(false);
  });

  it("handles nested modals with a counter", () => {
    modalOpened();
    modalOpened();
    expect(isModalOpen()).toBe(true);
    expect(document.body.hasAttribute("data-modal-open")).toBe(true);
    // Close one — still open
    modalClosed();
    expect(isModalOpen()).toBe(true);
    expect(document.body.hasAttribute("data-modal-open")).toBe(true);
    // Close the last
    modalClosed();
    expect(isModalOpen()).toBe(false);
    expect(document.body.hasAttribute("data-modal-open")).toBe(false);
  });

  it("does not go negative when closing more than opening", () => {
    modalClosed();
    expect(isModalOpen()).toBe(false);
    expect(document.body.hasAttribute("data-modal-open")).toBe(false);
    modalClosed();
    expect(isModalOpen()).toBe(false);
  });

  it("removes data-modal-open attribute entirely (not just set to false)", () => {
    modalOpened();
    modalClosed();
    expect(document.body.hasAttribute("data-modal-open")).toBe(false);
    // hasAttribute returns false only if the attribute is absent
    expect(document.body.getAttribute("data-modal-open")).toBeNull();
  });
});
