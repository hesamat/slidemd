// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { AiReimagineOutlineModal } from "../editor/ui/ai-reimagine-outline-modal.js";

const SAMPLE_OUTLINE = {
  plan: "Reframe the deck around outcomes. Use a historical context arc to show how current approaches evolved, then present the solution and close with evidence.",
  chapters: [
    {
      title: "The problem",
      flowTag: "problem",
      summary: "Why current approaches fail.",
      slides: [
        { title: "Hook", intent: "Open with a surprising statistic." },
        { title: "Stakes", intent: "What we lose by ignoring this." },
      ],
    },
    {
      title: "The approach",
      flowTag: "solution",
      summary: "The proposed solution.",
      slides: [{ title: "Approach", intent: "Introduce the solution." }],
    },
  ],
};

describe("AiReimagineOutlineModal", () => {
  it("returns the outline unchanged when continued immediately", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    dialog.querySelector('[data-action="continue"]').click();
    const result = await promise;
    expect(result.plan).toBe(SAMPLE_OUTLINE.plan);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].title).toBe("The problem");
    expect(result.chapters[0].flowTag).toBe("problem");
    expect(result.chapters[0].slides).toHaveLength(2);
    expect(result.chapters[1].title).toBe("The approach");
  });

  it("returns null when cancelled", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    dialog.querySelector('[data-action="cancel"]').click();
    const result = await promise;
    expect(result).toBeNull();
  });

  it("returns null when backdrop is clicked", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const backdrop = document.querySelector(".ai-reimagine-outline-modal__backdrop");
    backdrop.click();
    const result = await promise;
    expect(result).toBeNull();
  });

  it("shows the plan textarea", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    const planTextarea = dialog.querySelector("#ai-reimagine-outline-modal__plan");
    expect(planTextarea.value).toBe(SAMPLE_OUTLINE.plan);
    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it("shows chapters in read-only mode with flow badges", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    const chapterHeaders = dialog.querySelectorAll(".ai-reimagine-outline-modal__chapter-header");
    expect(chapterHeaders).toHaveLength(2);
    const badges = dialog.querySelectorAll(".ai-reimagine-outline-modal__flow-badge");
    expect(badges[0].textContent).toBe("problem");
    expect(badges[1].textContent).toBe("solution");
    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it("expands a chapter to show its slides", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    const firstHeader = dialog.querySelector(".ai-reimagine-outline-modal__chapter-header");
    firstHeader.click();
    const body = dialog.querySelector(".ai-reimagine-outline-modal__chapter-body");
    expect(body.hidden).toBe(false);
    const slides = body.querySelectorAll(".ai-reimagine-outline-modal__slide-readonly");
    expect(slides).toHaveLength(2);
    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it("toggles to edit mode and back", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    const editBtn = dialog.querySelector('[data-action="toggle-edit"]');
    expect(editBtn.textContent).toBe("Edit");
    editBtn.click();
    expect(editBtn.textContent).toBe("Done editing");
    const editHeaders = dialog.querySelectorAll(".ai-reimagine-outline-modal__chapter-edit-header");
    expect(editHeaders).toHaveLength(2);
    editBtn.click();
    expect(editBtn.textContent).toBe("Edit");
    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it("edits the plan in edit mode", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    const planTextarea = dialog.querySelector("#ai-reimagine-outline-modal__plan");
    planTextarea.value = "A completely new plan.";
    dialog.querySelector('[data-action="continue"]').click();
    const result = await promise;
    expect(result.plan).toBe("A completely new plan.");
  });

  it("edits a chapter title in edit mode", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    dialog.querySelector('[data-action="toggle-edit"]').click();
    const titleInput = dialog.querySelector(".ai-reimagine-outline-modal__chapter-title-input");
    titleInput.value = "New Chapter Title";
    titleInput.dispatchEvent(new Event("input"));
    dialog.querySelector('[data-action="continue"]').click();
    const result = await promise;
    expect(result.chapters[0].title).toBe("New Chapter Title");
  });

  it("changes a flow tag in edit mode", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    dialog.querySelector('[data-action="toggle-edit"]').click();
    const tagSelect = dialog.querySelector(".ai-reimagine-outline-modal__flow-tag-select");
    tagSelect.value = "hook";
    tagSelect.dispatchEvent(new Event("change"));
    dialog.querySelector('[data-action="continue"]').click();
    const result = await promise;
    expect(result.chapters[0].flowTag).toBe("hook");
  });

  it("adds a slide to a chapter in edit mode", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    dialog.querySelector('[data-action="toggle-edit"]').click();
    dialog.querySelector('[data-action="add-slide"]').click();
    const slideTitleInputs = dialog.querySelectorAll(
      ".ai-reimagine-outline-modal__slide-title-input",
    );
    const newSlideInput = slideTitleInputs[2]; // 3rd input = new slide in ch0
    newSlideInput.value = "New Slide";
    newSlideInput.dispatchEvent(new Event("input"));
    dialog.querySelector('[data-action="continue"]').click();
    const result = await promise;
    expect(result.chapters[0].slides).toHaveLength(3);
    expect(result.chapters[0].slides[2].title).toBe("New Slide");
  });

  it("removes a chapter in edit mode", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    dialog.querySelector('[data-action="toggle-edit"]').click();
    dialog.querySelector('[data-action="chapter-remove"]').click();
    dialog.querySelector('[data-action="continue"]').click();
    const result = await promise;
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].title).toBe("The approach");
  });

  it("adds a new chapter in edit mode", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    dialog.querySelector('[data-action="toggle-edit"]').click();
    const addChapterBtn = dialog.querySelector(".ai-reimagine-outline-modal__add-chapter-btn");
    addChapterBtn.click();
    const slideTitleInputs = dialog.querySelectorAll(
      ".ai-reimagine-outline-modal__slide-title-input",
    );
    const newChapterSlideInput = slideTitleInputs[slideTitleInputs.length - 1];
    newChapterSlideInput.value = "New Ch Slide";
    newChapterSlideInput.dispatchEvent(new Event("input"));
    dialog.querySelector('[data-action="continue"]').click();
    const result = await promise;
    expect(result.chapters).toHaveLength(3);
    expect(result.chapters[2].slides[0].title).toBe("New Ch Slide");
  });

  it("does not mutate the original outline object", async () => {
    const original = JSON.parse(JSON.stringify(SAMPLE_OUTLINE));
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    dialog.querySelector('[data-action="toggle-edit"]').click();
    dialog.querySelector('[data-action="chapter-remove"]').click();
    dialog.querySelector('[data-action="continue"]').click();
    await promise;
    expect(SAMPLE_OUTLINE).toEqual(original);
  });

  it("shows slide count stats with source count", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE, { sourceCount: 10 });
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    const stats = dialog.querySelectorAll(".ai-reimagine-outline-modal__stat");
    expect(stats.length).toBeGreaterThanOrEqual(2);
    expect(stats[0].textContent).toContain("2 chapters");
    expect(stats[1].textContent).toContain("3 slides");
    expect(stats[2].textContent).toContain("target");
    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });
});
