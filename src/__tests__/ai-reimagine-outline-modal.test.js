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
  it("returns the outline unchanged when generated immediately", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    dialog.querySelector('[data-action="generate"]').click();
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

  it("shows the plan as read-only text", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    const planText = dialog.querySelector(".ai-reimagine-outline-modal__plan-text");
    expect(planText.textContent).toBe(SAMPLE_OUTLINE.plan);
    // No textarea for the plan
    expect(dialog.querySelector("#ai-reimagine-outline-modal__plan")).toBeNull();
    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it("shows chapters with flow badges", async () => {
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
    const chevron = dialog.querySelector(".ai-reimagine-outline-modal__chapter-chevron");
    chevron.click();
    const body = dialog.querySelector(".ai-reimagine-outline-modal__chapter-body");
    expect(body.hidden).toBe(false);
    const slides = body.querySelectorAll(".ai-reimagine-outline-modal__slide-readonly");
    expect(slides).toHaveLength(2);
    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it("edits a chapter title inline", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    const titleInput = dialog.querySelector(".ai-reimagine-outline-modal__chapter-title-input");
    titleInput.value = "New Chapter Title";
    titleInput.dispatchEvent(new Event("input"));
    dialog.querySelector('[data-action="generate"]').click();
    const result = await promise;
    expect(result.chapters[0].title).toBe("New Chapter Title");
  });

  it("removes a chapter", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    dialog.querySelector('[data-action="chapter-remove"]').click();
    dialog.querySelector('[data-action="generate"]').click();
    const result = await promise;
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].title).toBe("The approach");
  });

  it("adds a new chapter", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    const addChapterBtn = dialog.querySelector(".ai-reimagine-outline-modal__add-chapter-btn");
    addChapterBtn.click();
    const titleInputs = dialog.querySelectorAll(".ai-reimagine-outline-modal__chapter-title-input");
    const newChapterInput = titleInputs[titleInputs.length - 1];
    newChapterInput.value = "New Chapter";
    newChapterInput.dispatchEvent(new Event("input"));
    dialog.querySelector('[data-action="generate"]').click();
    const result = await promise;
    expect(result.chapters).toHaveLength(3);
    expect(result.chapters[2].title).toBe("New Chapter");
  });

  it("does not mutate the original outline object", async () => {
    const original = JSON.parse(JSON.stringify(SAMPLE_OUTLINE));
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    dialog.querySelector('[data-action="chapter-remove"]').click();
    dialog.querySelector('[data-action="generate"]').click();
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

  it("reorders chapters with up/down buttons", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    const downBtn = dialog.querySelector('[data-action="chapter-down"]');
    downBtn.click();
    dialog.querySelector('[data-action="generate"]').click();
    const result = await promise;
    expect(result.chapters[0].title).toBe("The approach");
    expect(result.chapters[1].title).toBe("The problem");
  });

  it("escapes a malicious flow tag instead of injecting markup", async () => {
    const outline = {
      plan: "Plan.",
      chapters: [
        {
          title: "Chapter",
          flowTag: '"><img src=x onerror=alert(1)>',
          summary: "Summary.",
          slides: [{ title: "S", intent: "I" }],
        },
      ],
    };
    const promise = AiReimagineOutlineModal.show(outline);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    const badge = dialog.querySelector(".ai-reimagine-outline-modal__flow-badge");
    expect(dialog.querySelector("img")).toBeNull();
    expect(badge.textContent).toBe('"><img src=x onerror=alert(1)>');
    expect(badge.className).toBe(
      "ai-reimagine-outline-modal__flow-badge ai-reimagine-outline-modal__flow-badge--imgsrcxonerroralert1",
    );
    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it("filters out empty chapters on generate", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    // Clear the title of the first chapter
    const titleInput = dialog.querySelector(".ai-reimagine-outline-modal__chapter-title-input");
    titleInput.value = "";
    titleInput.dispatchEvent(new Event("input"));
    dialog.querySelector('[data-action="generate"]').click();
    const result = await promise;
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].title).toBe("The approach");
  });
});
