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
      flow: "instructional",
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

  it("hides vision, identity, and flow controls for polish mode", async () => {
    const promise = AiGenerateModal.show(BASIC_MD);
    const dialog = document.querySelector(".ai-generate-modal__dialog");
    const flowField = dialog.querySelector("#ai-generate-modal__flow-field");
    const visionRow = dialog.querySelector("#ai-generate-modal__vision-row");
    const identityRow = dialog.querySelector("#ai-generate-modal__identity-row");
    expect(flowField.style.display).toBe("none");
    expect(visionRow.style.display).toBe("none");
    expect(identityRow.style.display).toBe("none");
    const generateBtn = dialog.querySelector('[data-action="generate"]');
    generateBtn.click();
    await promise;
  });

  it("shows flow, vision, and identity controls for remix", async () => {
    const promise = AiGenerateModal.show(MD_WITH_IMAGE);
    const dialog = document.querySelector(".ai-generate-modal__dialog");
    const modeSelect = dialog.querySelector("#ai-generate-modal__mode");
    modeSelect.value = "remix";
    modeSelect.dispatchEvent(new Event("change"));
    const flowField = dialog.querySelector("#ai-generate-modal__flow-field");
    const visionRow = dialog.querySelector("#ai-generate-modal__vision-row");
    const identityRow = dialog.querySelector("#ai-generate-modal__identity-row");
    const identityToggle = dialog.querySelector("#ai-generate-modal__identity-toggle");
    expect(flowField.style.display).toBe("");
    expect(visionRow.style.display).toBe("");
    expect(identityRow.style.display).toBe("");
    expect(identityToggle.checked).toBe(true);
    const generateBtn = dialog.querySelector('[data-action="generate"]');
    generateBtn.click();
    const result = await promise;
    expect(result.mode).toBe("remix");
    expect(result.preserveVisualIdentity).toBe(true);
  });

  it("shows flow and vision for reimagine, but hides identity", async () => {
    const promise = AiGenerateModal.show(MD_WITH_IMAGE);
    const dialog = document.querySelector(".ai-generate-modal__dialog");
    const modeSelect = dialog.querySelector("#ai-generate-modal__mode");
    modeSelect.value = "reimagine";
    modeSelect.dispatchEvent(new Event("change"));
    const flowField = dialog.querySelector("#ai-generate-modal__flow-field");
    const visionRow = dialog.querySelector("#ai-generate-modal__vision-row");
    const identityRow = dialog.querySelector("#ai-generate-modal__identity-row");
    expect(flowField.style.display).toBe("");
    expect(visionRow.style.display).toBe("");
    expect(identityRow.style.display).toBe("none");
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

  it("returns the selected flow for reimagine", async () => {
    const promise = AiGenerateModal.show(BASIC_MD);
    const dialog = document.querySelector(".ai-generate-modal__dialog");
    const modeSelect = dialog.querySelector("#ai-generate-modal__mode");
    modeSelect.value = "reimagine";
    modeSelect.dispatchEvent(new Event("change"));
    const flowSelect = dialog.querySelector("#ai-generate-modal__flow");
    flowSelect.value = "persuasive";
    flowSelect.dispatchEvent(new Event("change"));
    const flowDesc = dialog.querySelector("#ai-generate-modal__flow-desc");
    expect(flowDesc.textContent.toLowerCase()).toContain("argument-driven");
    dialog.querySelector('[data-action="generate"]').click();
    const result = await promise;
    expect(result.flow).toBe("persuasive");
  });

  it("shows vision control for reimagine mode when the deck has images", async () => {
    const promise = AiGenerateModal.show(MD_WITH_IMAGE);
    const dialog = document.querySelector(".ai-generate-modal__dialog");
    const modeSelect = dialog.querySelector("#ai-generate-modal__mode");
    modeSelect.value = "reimagine";
    modeSelect.dispatchEvent(new Event("change"));
    const visionRow = dialog.querySelector("#ai-generate-modal__vision-row");
    expect(visionRow.style.display).toBe("");
    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });
});
