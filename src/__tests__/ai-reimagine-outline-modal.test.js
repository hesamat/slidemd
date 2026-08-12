// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest";
import { AiReimagineOutlineModal } from "../editor/ui/ai-reimagine-outline-modal.js";

const SAMPLE_OUTLINE = {
  plan: "Reframe the deck around outcomes. Use a historical context arc to show how current approaches evolved, then present the solution and close with evidence.",
  chapters: [
    {
      title: "The problem",
      flowTag: "problem",
      summary: "Why current approaches fail. Explain the core limitation and why it matters now.",
      suggestedSlideCount: 2,
    },
    {
      title: "The approach",
      flowTag: "solution",
      summary: "The proposed solution. Introduce the approach and how it addresses the gap.",
      suggestedSlideCount: 1,
    },
  ],
  visualSystem: {
    palette: {
      base: "#0f172a",
      surface: "#1e293b",
      accent: "#06b6d4",
      contrast: "#f59e0b",
      highlight: "#ffffff",
    },
    typography: {
      character: "bold editorial",
      headline: "large, compact, high contrast",
      body: "clean, restrained",
    },
    composition: { density: "medium", whitespace: "generous", alignment: "left-dominant" },
    imagery: {
      role: "emotional punctuation",
      mood: "moody, atmospheric",
      treatment: "full-bleed",
    },
    motifs: ["accent divider lines", "oversized chapter numbers"],
    contrastRules: ["Use stark white for takeaways"],
  },
};

describe("AiReimagineOutlineModal", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  it("returns the outline unchanged when generated immediately", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    dialog.querySelector('[data-action="generate"]').click();
    const result = await promise;
    expect(result.plan).toBe(SAMPLE_OUTLINE.plan);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].title).toBe("The problem");
    expect(result.chapters[0].flowTag).toBe("problem");
    expect(result.chapters[0].suggestedSlideCount).toBe(2);
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

  it("shows the plan as an editable textarea", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    const planInput = dialog.querySelector(".ai-reimagine-outline-modal__plan-input");
    expect(planInput.tagName).toBe("TEXTAREA");
    expect(planInput.value).toBe(SAMPLE_OUTLINE.plan);
    // No read-only plan text element
    expect(dialog.querySelector(".ai-reimagine-outline-modal__plan-text")).toBeNull();
    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it("shows chapters with flow-tag selects", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    const chapterHeaders = dialog.querySelectorAll(".ai-reimagine-outline-modal__chapter-header");
    expect(chapterHeaders).toHaveLength(2);
    const selects = dialog.querySelectorAll(".ai-reimagine-outline-modal__flow-tag-select");
    expect(selects).toHaveLength(2);
    expect(selects[0].value).toBe("problem");
    expect(selects[0].textContent).toContain("Problem — identify the gap");
    expect(selects[1].value).toBe("solution");
    expect(selects[1].textContent).toContain("Solution — present the approach");
    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it("does not render individual slides or slide-count badges", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    expect(dialog.querySelector(".ai-reimagine-outline-modal__slide-readonly")).toBeNull();
    expect(dialog.querySelector(".ai-reimagine-outline-modal__chapter-count")).toBeNull();
    expect(dialog.querySelector(".ai-reimagine-outline-modal__flow-badge")).toBeNull();
    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it("shows summary as a textarea (multi-line)", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    const summaryInputs = dialog.querySelectorAll(
      ".ai-reimagine-outline-modal__chapter-summary-input",
    );
    expect(summaryInputs).toHaveLength(2);
    expect(summaryInputs[0].tagName).toBe("TEXTAREA");
    expect(summaryInputs[0].value).toContain("Why current approaches fail");
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

  it("edits a chapter flow tag via select", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    const select = dialog.querySelector(".ai-reimagine-outline-modal__flow-tag-select");
    select.value = "solution";
    select.dispatchEvent(new Event("change"));
    dialog.querySelector('[data-action="generate"]').click();
    const result = await promise;
    expect(result.chapters[0].flowTag).toBe("solution");
  });

  it("edits a chapter summary inline", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    const summaryInput = dialog.querySelector(".ai-reimagine-outline-modal__chapter-summary-input");
    summaryInput.value = "New summary text.";
    summaryInput.dispatchEvent(new Event("input"));
    dialog.querySelector('[data-action="generate"]').click();
    const result = await promise;
    expect(result.chapters[0].summary).toBe("New summary text.");
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

  it("shows stats with source count", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE, { sourceCount: 10 });
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    const stats = dialog.querySelectorAll(".ai-reimagine-outline-modal__stat");
    expect(stats.length).toBeGreaterThanOrEqual(2);
    expect(stats[0].textContent).toContain("2 chapters");
    expect(stats[1].textContent).toContain("3 slides planned");
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

  it("keeps a chapter with a summary even when its title is blank", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    const titleInput = dialog.querySelector(".ai-reimagine-outline-modal__chapter-title-input");
    titleInput.value = "";
    titleInput.dispatchEvent(new Event("input"));
    dialog.querySelector('[data-action="generate"]').click();
    const result = await promise;
    // Both chapters are kept — the unnamed one gets a fallback title
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].title).toBe("Untitled chapter");
    expect(result.chapters[1].title).toBe("The approach");
  });

  it("filters out a truly empty chapter (no title and no summary)", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    // Add a new chapter (empty title, empty summary) and generate
    dialog.querySelector(".ai-reimagine-outline-modal__add-chapter-btn").click();
    dialog.querySelector('[data-action="generate"]').click();
    const result = await promise;
    // The empty added chapter is filtered out
    expect(result.chapters).toHaveLength(2);
  });

  it("re-renders stats after removing a chapter", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE, { sourceCount: 10 });
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    // Remove the first chapter (had suggestedSlideCount: 2)
    dialog.querySelector('[data-action="chapter-remove"]').click();
    const stats = dialog.querySelectorAll(".ai-reimagine-outline-modal__stat");
    expect(stats[0].textContent).toContain("1 chapter");
    expect(stats[1].textContent).toContain("1 slide planned");
    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it("does not close on Escape while an input is focused", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    const titleInput = dialog.querySelector(".ai-reimagine-outline-modal__chapter-title-input");
    titleInput.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    // Modal should still be open
    expect(document.querySelector(".ai-reimagine-outline-modal__dialog")).not.toBeNull();
    // Now Escape with no input focused should close
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    const result = await promise;
    expect(result).toBeNull();
  });

  it("sets initial focus on the first chapter title input", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    const firstTitleInput = dialog.querySelector(
      ".ai-reimagine-outline-modal__chapter-title-input",
    );
    expect(document.activeElement).toBe(firstTitleInput);
    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it("passes visualSystem through unchanged on generate", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    dialog.querySelector('[data-action="generate"]').click();
    const result = await promise;
    expect(result.visualSystem).not.toBeNull();
    expect(result.visualSystem.palette.base).toBe("#0f172a");
    expect(result.visualSystem.palette.accent).toBe("#06b6d4");
    expect(result.visualSystem.typography.character).toBe("bold editorial");
    expect(result.visualSystem.motifs).toEqual([
      "accent divider lines",
      "oversized chapter numbers",
    ]);
  });

  it("does not render a visual system section or palette dropdown", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    expect(dialog.querySelector(".ai-reimagine-outline-modal__visual-system")).toBeNull();
    expect(dialog.querySelector(".ai-reimagine-outline-modal__palette-select")).toBeNull();
    expect(dialog.querySelector(".ai-reimagine-outline-modal__swatch")).toBeNull();
    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it("renders plan as an editable textarea", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    const planInput = dialog.querySelector(".ai-reimagine-outline-modal__plan-input");
    expect(planInput).not.toBeNull();
    expect(planInput.tagName).toBe("TEXTAREA");
    expect(planInput.value).toBe(SAMPLE_OUTLINE.plan);
    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it("returns the edited plan text on generate", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    const planInput = dialog.querySelector(".ai-reimagine-outline-modal__plan-input");
    planInput.value = "A completely new plan written by the user.";
    dialog.querySelector('[data-action="generate"]').click();
    const result = await promise;
    expect(result.plan).toBe("A completely new plan written by the user.");
  });

  it("falls back to the original plan when textarea is empty", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    const planInput = dialog.querySelector(".ai-reimagine-outline-modal__plan-input");
    planInput.value = "   ";
    dialog.querySelector('[data-action="generate"]').click();
    const result = await promise;
    expect(result.plan).toBe(SAMPLE_OUTLINE.plan);
  });

  it("does not show regenerate button when onRegenerate is not provided", async () => {
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE);
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    expect(dialog.querySelector("#ai-reimagine-outline-modal__regenerate-btn")).toBeNull();
    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it("shows regenerate button when onRegenerate is provided", async () => {
    const onRegenerate = vi.fn();
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE, { onRegenerate });
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    const btn = dialog.querySelector("#ai-reimagine-outline-modal__regenerate-btn");
    expect(btn).not.toBeNull();
    expect(btn.textContent).toContain("Regenerate chapters");
    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it("calls onRegenerate with the edited plan and replaces chapters", async () => {
    const newOutline = {
      plan: "New plan from AI.",
      chapters: [
        {
          title: "New chapter A",
          flowTag: "hook",
          summary: "New summary A.",
          suggestedSlideCount: 3,
        },
        {
          title: "New chapter B",
          flowTag: "solution",
          summary: "New summary B.",
          suggestedSlideCount: 2,
        },
      ],
      visualSystem: SAMPLE_OUTLINE.visualSystem,
    };
    const onRegenerate = vi.fn().mockResolvedValue(newOutline);
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE, { onRegenerate });
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");

    // Edit the plan
    const planInput = dialog.querySelector(".ai-reimagine-outline-modal__plan-input");
    planInput.value = "A revised plan direction.";

    // Click regenerate
    const btn = dialog.querySelector("#ai-reimagine-outline-modal__regenerate-btn");
    btn.click();

    // Wait for the regenerate promise to resolve
    await vi.waitFor(() => expect(onRegenerate).toHaveBeenCalledWith("A revised plan direction."));

    // Wait for the chapters to be replaced
    await vi.waitFor(() => {
      const titles = dialog.querySelectorAll(".ai-reimagine-outline-modal__chapter-title-input");
      expect(titles).toHaveLength(2);
    });

    // Check the new chapter titles
    const titles = dialog.querySelectorAll(".ai-reimagine-outline-modal__chapter-title-input");
    expect(titles[0].value).toBe("New chapter A");
    expect(titles[1].value).toBe("New chapter B");

    // Plan should be updated to the AI's new plan
    expect(planInput.value).toBe("New plan from AI.");

    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it("shows error message when regeneration fails", async () => {
    const onRegenerate = vi.fn().mockRejectedValue(new Error("AI service unavailable"));
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE, { onRegenerate });
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    const btn = dialog.querySelector("#ai-reimagine-outline-modal__regenerate-btn");
    btn.click();

    await vi.waitFor(() => {
      const errorEl = dialog.querySelector(".ai-reimagine-outline-modal__error");
      expect(errorEl.textContent).toContain("AI service unavailable");
    });

    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });

  it("shows error when regenerating with an empty plan", async () => {
    const onRegenerate = vi.fn();
    const promise = AiReimagineOutlineModal.show(SAMPLE_OUTLINE, { onRegenerate });
    const dialog = document.querySelector(".ai-reimagine-outline-modal__dialog");
    const planInput = dialog.querySelector(".ai-reimagine-outline-modal__plan-input");
    planInput.value = "   ";
    const btn = dialog.querySelector("#ai-reimagine-outline-modal__regenerate-btn");
    btn.click();

    const errorEl = dialog.querySelector(".ai-reimagine-outline-modal__error");
    expect(errorEl.textContent).toContain("Enter a plan");
    expect(onRegenerate).not.toHaveBeenCalled();

    dialog.querySelector('[data-action="cancel"]').click();
    await promise;
  });
});
