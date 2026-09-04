// @vitest-environment jsdom
/**
 * ConversionModal state-machine tests.
 *
 * Covers the risky async flows added with the import timeout/retry work:
 *  - a timed-out conversion surfaces an error with a Retry button that stays
 *    disabled while the abandoned extraction is still in flight;
 *  - re-selecting a file hides Import and clears the previous result, so
 *    Import can never resolve with the PREVIOUS file's deck;
 *  - Escape/backdrop cannot abandon a running conversion;
 *  - extraction warnings flow through to the modal result.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConversionModal } from "../editor/conversion-modal.js";
import { PptxExtractor } from "../data/pptx-extractor.js";
import { convertToSlideMd } from "../data/pptx-to-slide-md.js";

vi.mock("../data/pptx-extractor.js", () => ({ PptxExtractor: { extract: vi.fn() } }));
vi.mock("../data/pptx-to-slide-md.js", () => ({ convertToSlideMd: vi.fn(() => "# Hello") }));

const TIMEOUT_MS = 5 * 60 * 1000;

function makePptxFile(name = "deck-a.pptx") {
  return new File(["pk"], name);
}

async function selectFile(name) {
  const input = document.querySelector('.conversion-modal__backdrop [data-field="file"]');
  Object.defineProperty(input, "files", { value: [makePptxFile(name)], configurable: true });
  input.dispatchEvent(new Event("change"));
}

const q = (sel) => document.querySelector(`.conversion-modal__backdrop ${sel}`);

function extractionResult(overrides = {}) {
  return {
    slides: [],
    images: [],
    warnings: {
      warnings: [
        { slideIndex: 0, kind: "diagram-render-failed", message: "kept as a text diagram marker" },
      ],
    },
    ...overrides,
  };
}

describe("ConversionModal import flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    convertToSlideMd.mockReturnValue("# Hello");
  });

  afterEach(() => {
    ConversionModal.close();
    vi.useRealTimers();
  });

  it("passes extraction warnings through to the result", async () => {
    PptxExtractor.extract.mockResolvedValue(extractionResult());
    const showPromise = ConversionModal.show();
    await selectFile();
    await new Promise((r) => setTimeout(r, 500));

    expect(q('[data-action="save"]').hidden).toBe(false);
    q('[data-action="save"]').click();
    const result = await showPromise;

    expect(result.markdown).toBe("# Hello");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].kind).toBe("diagram-render-failed");
  });

  it("hides Import and drops the stale result when a new file is selected", async () => {
    PptxExtractor.extract.mockResolvedValueOnce(extractionResult());
    const showPromise = ConversionModal.show();
    await selectFile("deck-a.pptx");
    await new Promise((r) => setTimeout(r, 500));
    expect(q('[data-action="save"]').hidden).toBe(false);

    // Select file B — conversion restarts with Import hidden and the old
    // result cleared. Clicking Import mid-conversion must do nothing.
    let resolveB;
    PptxExtractor.extract.mockReturnValueOnce(new Promise((r) => (resolveB = r)));
    await selectFile("deck-b.pptx");
    expect(q('[data-action="save"]').hidden).toBe(true);

    q('[data-action="save"]').click();
    await new Promise((r) => setTimeout(r, 20));
    const settled = await Promise.race([showPromise.then(() => true), Promise.resolve(false)]);
    expect(settled).toBe(false);

    resolveB(extractionResult());
    await new Promise((r) => setTimeout(r, 500));
    q('[data-action="save"]').click();
    const result = await showPromise;
    // deck-b's name proves the resolved result is file B's, not A's.
    expect(result.deckName).toBe("deck-b");
  });

  it("reports a timed-out conversion and holds Retry until the extraction settles", async () => {
    vi.useFakeTimers();
    let resolveExtract;
    PptxExtractor.extract.mockReturnValueOnce(new Promise((r) => (resolveExtract = r)));
    const showPromise = ConversionModal.show();
    await selectFile();
    await vi.advanceTimersByTimeAsync(100);

    // Fire the 5-minute conversion timeout while extraction never settles.
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    expect(q(".conversion-modal__error").textContent).toContain("timed out");
    const retry = q('[data-action="retry"]');
    expect(retry.hidden).toBe(false);
    // The abandoned extraction is still running — Retry must wait for it.
    expect(retry.disabled).toBe(true);

    // The zombie extraction finally settles; Retry unlocks.
    resolveExtract(extractionResult());
    await vi.advanceTimersByTimeAsync(0);
    expect(retry.disabled).toBe(false);

    // Retry re-runs the conversion and reaches Import.
    PptxExtractor.extract.mockResolvedValueOnce(extractionResult());
    retry.click();
    await vi.advanceTimersByTimeAsync(400);
    expect(q('[data-action="save"]').hidden).toBe(false);
    q('[data-action="save"]').click();
    const result = await showPromise;
    expect(result.markdown).toBe("# Hello");
  });

  it("ignores Escape while a conversion is running", async () => {
    let resolveExtract;
    PptxExtractor.extract.mockReturnValueOnce(new Promise((r) => (resolveExtract = r)));
    const showPromise = ConversionModal.show();
    await selectFile();
    await new Promise((r) => setTimeout(r, 500));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    // Modal still open, promise unresolved.
    expect(document.querySelector(".conversion-modal__backdrop")).not.toBeNull();
    const settled = await Promise.race([showPromise.then(() => true), Promise.resolve(false)]);
    expect(settled).toBe(false);

    resolveExtract(extractionResult());
    await new Promise((r) => setTimeout(r, 500));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(await showPromise).toBeNull();
  });
});
