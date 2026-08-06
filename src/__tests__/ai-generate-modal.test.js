// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { AiGenerateModal } from "../editor/ui/ai-generate-modal.js";

const BASIC_MD = `layout: header-content
@header
## Slide 1

@main
- Point 1

---

layout: header-content
@header
## Slide 2

@main
- Point 2`;

const MD_WITH_IMAGE = `layout: header-content
@header
## Slide 1

@media
<img src="images/pic.png">`;

describe("AiGenerateModal", () => {
  it("returns mode=polish with default options when accepted immediately", async () => {
    const promise = AiGenerateModal.show(BASIC_MD);
    const dialog = document.querySelector(".ai-generate-modal__dialog");
    const generateBtn = dialog.querySelector('[data-action="generate"]');
    generateBtn.click();
    const result = await promise;
    expect(result).toEqual({
      mode: "polish",
      tone: "default",
      addSpeakerNotes: false,
      includeImages: false,
      preserveVisualIdentity: true,
    });
  });

  it("returns addSpeakerNotes=true when the notes checkbox is checked", async () => {
    const promise = AiGenerateModal.show(BASIC_MD);
    const dialog = document.querySelector(".ai-generate-modal__dialog");
    const notesToggle = dialog.querySelector("#ai-generate-modal__notes-toggle");
    notesToggle.checked = true;
    const generateBtn = dialog.querySelector('[data-action="generate"]');
    generateBtn.click();
    const result = await promise;
    expect(result.addSpeakerNotes).toBe(true);
  });

  it("hides vision and identity controls for polish mode", async () => {
    const promise = AiGenerateModal.show(BASIC_MD);
    const dialog = document.querySelector(".ai-generate-modal__dialog");
    const visionRow = dialog.querySelector("#ai-generate-modal__vision-row");
    const identityRow = dialog.querySelector("#ai-generate-modal__identity-row");
    expect(visionRow.style.display).toBe("none");
    expect(identityRow.style.display).toBe("none");
    const generateBtn = dialog.querySelector('[data-action="generate"]');
    generateBtn.click();
    await promise;
  });

  it("shows vision and identity controls for remix", async () => {
    const promise = AiGenerateModal.show(MD_WITH_IMAGE);
    const dialog = document.querySelector(".ai-generate-modal__dialog");
    const modeSelect = dialog.querySelector("#ai-generate-modal__mode");
    modeSelect.value = "remix";
    modeSelect.dispatchEvent(new Event("change"));
    const visionRow = dialog.querySelector("#ai-generate-modal__vision-row");
    const identityRow = dialog.querySelector("#ai-generate-modal__identity-row");
    const identityToggle = dialog.querySelector("#ai-generate-modal__identity-toggle");
    expect(visionRow.style.display).toBe("");
    expect(identityRow.style.display).toBe("");
    expect(identityToggle.checked).toBe(true);
    const generateBtn = dialog.querySelector('[data-action="generate"]');
    generateBtn.click();
    const result = await promise;
    expect(result.mode).toBe("remix");
    expect(result.preserveVisualIdentity).toBe(true);
  });

  it("unchecks preserve visual identity by default for reimagine", async () => {
    const promise = AiGenerateModal.show(BASIC_MD);
    const dialog = document.querySelector(".ai-generate-modal__dialog");
    const modeSelect = dialog.querySelector("#ai-generate-modal__mode");
    modeSelect.value = "reimagine";
    modeSelect.dispatchEvent(new Event("change"));
    const identityToggle = dialog.querySelector("#ai-generate-modal__identity-toggle");
    expect(identityToggle.checked).toBe(false);
    const generateBtn = dialog.querySelector('[data-action="generate"]');
    generateBtn.click();
    const result = await promise;
    expect(result.mode).toBe("reimagine");
    expect(result.preserveVisualIdentity).toBe(false);
  });

  it("returns null when cancelled", async () => {
    const promise = AiGenerateModal.show(BASIC_MD);
    const dialog = document.querySelector(".ai-generate-modal__dialog");
    const cancelBtn = dialog.querySelector('[data-action="cancel"]');
    cancelBtn.click();
    const result = await promise;
    expect(result).toBeNull();
  });
});
