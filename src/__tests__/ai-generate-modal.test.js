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

  it("shows Copy/Download prompt buttons when onExport is provided", async () => {
    const onExport = () => {};
    const promise = AiGenerateModal.show(BASIC_MD, { onExport });
    const dialog = document.querySelector(".ai-generate-modal__dialog");
    expect(dialog.querySelector('[data-action="copy-prompt"]')).not.toBeNull();
    expect(dialog.querySelector('[data-action="download-prompt"]')).not.toBeNull();
    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it("does not show export buttons when onExport is absent", async () => {
    const promise = AiGenerateModal.show(BASIC_MD);
    const dialog = document.querySelector(".ai-generate-modal__dialog");
    expect(dialog.querySelector('[data-action="copy-prompt"]')).toBeNull();
    expect(dialog.querySelector('[data-action="download-prompt"]')).toBeNull();
    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it("invokes onExport with current options and resolves null on copy", async () => {
    let captured = null;
    const onExport = (options, kind) => {
      captured = { options, kind };
    };
    const promise = AiGenerateModal.show(BASIC_MD, { onExport });
    const dialog = document.querySelector(".ai-generate-modal__dialog");
    const modeSelect = dialog.querySelector("#ai-generate-modal__mode");
    modeSelect.value = "remix";
    modeSelect.dispatchEvent(new Event("change"));
    dialog.querySelector('[data-action="copy-prompt"]').click();
    const result = await promise;
    expect(result).toBeNull();
    expect(captured.kind).toBe("copy");
    expect(captured.options.mode).toBe("remix");
    expect(captured.options.flow).toBe("instructional");
  });

  it("invokes onExport with kind=download on download click", async () => {
    let captured = null;
    const onExport = (options, kind) => {
      captured = { options, kind };
    };
    const promise = AiGenerateModal.show(BASIC_MD, { onExport });
    const dialog = document.querySelector(".ai-generate-modal__dialog");
    dialog.querySelector('[data-action="download-prompt"]').click();
    await promise;
    expect(captured.kind).toBe("download");
    expect(captured.options.mode).toBe("polish");
  });

  it("shows an inline error and stays open when onExport throws", async () => {
    const onExport = () => {
      throw new Error("boom");
    };
    const promise = AiGenerateModal.show(BASIC_MD, { onExport });
    const dialog = document.querySelector(".ai-generate-modal__dialog");
    dialog.querySelector('[data-action="copy-prompt"]').click();
    // Allow the microtask queue to flush so the async handler runs.
    await new Promise((r) => setTimeout(r, 0));
    const err = dialog.querySelector(".ai-generate-modal__export-error");
    expect(err).not.toBeNull();
    expect(err.textContent).toContain("boom");
    // Modal should still be open (promise not resolved).
    expect(dialog.isConnected).toBe(true);
    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it("import purpose hides export/generate buttons and renames primary to Next", async () => {
    const onExport = () => {};
    const promise = AiGenerateModal.show(BASIC_MD, {
      purpose: "import",
      onExport,
    });
    const dialog = document.querySelector(".ai-generate-modal__dialog");
    expect(dialog.querySelector('[data-action="copy-prompt"]')).toBeNull();
    expect(dialog.querySelector('[data-action="download-prompt"]')).toBeNull();
    expect(dialog.querySelector('[data-action="generate"]')).toBeNull();
    const nextBtn = dialog.querySelector('[data-action="next"]');
    expect(nextBtn).not.toBeNull();
    expect(nextBtn.textContent).toBe("Next");
    // Cost rows hidden in import mode.
    expect(dialog.querySelector("#ai-generate-modal__model-row")).toBeNull();
    nextBtn.click();
    const result = await promise;
    expect(result).toEqual({
      mode: "polish",
      flow: "instructional",
      addSpeakerNotes: false,
      includeImages: false,
      preserveVisualIdentity: true,
    });
  });
});
