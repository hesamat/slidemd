// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { AiImportModal } from "../editor/ui/ai-import-modal.js";

function openModal(validate) {
  const promise = AiImportModal.show({ validate });
  const dialog = document.querySelector(".ai-import-modal__dialog");
  return { promise, dialog };
}

describe("AiImportModal", () => {
  it("returns null when cancelled", async () => {
    const { promise, dialog } = openModal(() => ({ ok: true, errors: [], warnings: [] }));
    dialog.querySelector('[data-action="cancel"]').click();
    const result = await promise;
    expect(result).toBeNull();
  });

  it("returns null when backdrop is clicked", async () => {
    const { promise } = openModal(() => ({ ok: true, errors: [], warnings: [] }));
    const backdrop = document.querySelector(".ai-import-modal__backdrop");
    backdrop.click();
    const result = await promise;
    expect(result).toBeNull();
  });

  it("throws when validate callback is missing", () => {
    expect(() => AiImportModal.show({})).toThrow();
  });

  it("Apply is disabled until validation passes", async () => {
    const validate = () => ({ ok: false, errors: [{ message: "bad" }], warnings: [] });
    const { promise, dialog } = openModal(validate);
    const applyBtn = dialog.querySelector('[data-action="apply"]');
    expect(applyBtn.disabled).toBe(true);
    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it("enables Apply and returns pasted text after successful validation", async () => {
    const validate = (text) => ({ ok: text.includes("layout"), errors: [], warnings: [] });
    const { promise, dialog } = openModal(validate);
    const textarea = dialog.querySelector("textarea");
    textarea.value = "layout: header-content\n@header\n# Hi";
    dialog.querySelector('[data-action="validate"]').click();
    await new Promise((r) => setTimeout(r, 0));
    const applyBtn = dialog.querySelector('[data-action="apply"]');
    expect(applyBtn.disabled).toBe(false);
    applyBtn.click();
    const result = await promise;
    expect(result).toContain("layout: header-content");
  });

  it("shows errors in the status area and blocks Apply", async () => {
    const validate = () => ({
      ok: false,
      errors: [{ slide: 0, message: "missing layout" }],
      warnings: [],
    });
    const { promise, dialog } = openModal(validate);
    const textarea = dialog.querySelector("textarea");
    textarea.value = "some text";
    dialog.querySelector('[data-action="validate"]').click();
    await new Promise((r) => setTimeout(r, 0));
    const status = dialog.querySelector(".ai-import-modal__status");
    expect(status.textContent).toContain("missing layout");
    expect(dialog.querySelector('[data-action="apply"]').disabled).toBe(true);
    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it("requires two Validate clicks to acknowledge warnings and enable Apply", async () => {
    const validate = () => ({
      ok: false,
      errors: [],
      warnings: [{ message: "slide count differs" }],
    });
    const { promise, dialog } = openModal(validate);
    const textarea = dialog.querySelector("textarea");
    textarea.value = "some text";
    dialog.querySelector('[data-action="validate"]').click();
    await new Promise((r) => setTimeout(r, 0));
    // First click: warnings shown, Apply still disabled.
    expect(dialog.querySelector('[data-action="apply"]').disabled).toBe(true);
    // Second click: acknowledged, Apply enabled with "Apply anyway".
    dialog.querySelector('[data-action="validate"]').click();
    await new Promise((r) => setTimeout(r, 0));
    const applyBtn = dialog.querySelector('[data-action="apply"]');
    expect(applyBtn.disabled).toBe(false);
    expect(applyBtn.textContent).toBe("Apply anyway");
    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it("editing the textarea resets validation state", async () => {
    const validate = () => ({ ok: true, errors: [], warnings: [] });
    const { promise, dialog } = openModal(validate);
    const textarea = dialog.querySelector("textarea");
    textarea.value = "layout: x";
    dialog.querySelector('[data-action="validate"]').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(dialog.querySelector('[data-action="apply"]').disabled).toBe(false);
    textarea.value = "layout: y";
    textarea.dispatchEvent(new Event("input"));
    expect(dialog.querySelector('[data-action="apply"]').disabled).toBe(true);
    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it("supports async validate", async () => {
    const validate = async (text) => {
      await new Promise((r) => setTimeout(r, 0));
      return { ok: text.length > 0, errors: [], warnings: [] };
    };
    const { promise, dialog } = openModal(validate);
    const textarea = dialog.querySelector("textarea");
    textarea.value = "layout: x";
    dialog.querySelector('[data-action="validate"]').click();
    await new Promise((r) => setTimeout(r, 10));
    expect(dialog.querySelector('[data-action="apply"]').disabled).toBe(false);
    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });
});
