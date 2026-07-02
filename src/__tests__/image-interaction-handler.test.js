import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ImageInteractionHandler } from "../editor/image/image-interaction-handler.js";

/**
 * Create a mock img element with a mock slide parent.
 * @param {number} index - Index among sibling img elements in the slide
 * @param {number} total - Total number of img elements in the slide
 */
function mockImg(index, total) {
  const allImgs = Array.from({ length: total }, () => ({}));
  const slide = {
    querySelectorAll: () => allImgs,
  };
  const img = {
    closest: (sel) => (sel === ".slide" ? slide : null),
    classList: {
      _classes: new Set(),
      add(c) {
        this._classes.add(c);
      },
      remove(c) {
        this._classes.delete(c);
      },
      contains(c) {
        return this._classes.has(c);
      },
    },
  };
  allImgs[index] = img;
  return img;
}

function mockFitImage({
  areaWidth = 1920,
  areaHeight = 1080,
  imgLeft = 120,
  imgTop = 80,
  imgWidth = 400,
  imgHeight = 600,
  naturalWidth = 400,
  naturalHeight = 600,
} = {}) {
  const area = {
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: areaWidth,
      height: areaHeight,
    }),
  };
  const img = {
    closest: (sel) => (sel === ".slide__area" ? area : null),
    getBoundingClientRect: () => ({
      left: imgLeft,
      top: imgTop,
      width: imgWidth,
      height: imgHeight,
    }),
    naturalWidth,
    naturalHeight,
    style: {},
  };
  return img;
}

describe("ImageInteractionHandler", () => {
  beforeEach(() => {
    ImageInteractionHandler._selectedImg = null;
    ImageInteractionHandler._getMarkdown = null;
    ImageInteractionHandler._setMarkdown = null;
    ImageInteractionHandler._onDelete = null;
    ImageInteractionHandler._overlay = { style: { display: "" }, remove: () => {} };
    ImageInteractionHandler.applySettings = vi.fn();
    ImageInteractionHandler._getStageScale = () => 1;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("deleteSelected", () => {
    it("removes an HTML img tag from the markdown", () => {
      const md =
        '## Title\n\n<img src="images/test.png" alt="test" style="width: 100px" />\n\nMore text';
      let saved = null;

      ImageInteractionHandler._getMarkdown = () => md;
      ImageInteractionHandler._setMarkdown = (updated) => {
        saved = updated;
      };
      ImageInteractionHandler._selectedImg = mockImg(0, 1);

      ImageInteractionHandler.deleteSelected();

      expect(saved).toBeTruthy();
      expect(saved).not.toContain("<img");
      expect(saved).toContain("## Title");
      expect(saved).toContain("More text");
    });

    it("removes a markdown image syntax from the markdown", () => {
      const md = "## Title\n\n![diagram](images/diagram.png)\n\nMore text";
      let saved = null;

      ImageInteractionHandler._getMarkdown = () => md;
      ImageInteractionHandler._setMarkdown = (updated) => {
        saved = updated;
      };
      ImageInteractionHandler._selectedImg = mockImg(0, 1);

      ImageInteractionHandler.deleteSelected();

      expect(saved).toBeTruthy();
      expect(saved).not.toContain("![diagram]");
      expect(saved).toContain("## Title");
      expect(saved).toContain("More text");
    });

    it("removes the correct image when multiple exist", () => {
      const md =
        '<img src="images/first.png" alt="first" />\n\nText\n\n<img src="images/second.png" alt="second" />';
      let saved = null;

      ImageInteractionHandler._getMarkdown = () => md;
      ImageInteractionHandler._setMarkdown = (updated) => {
        saved = updated;
      };
      // Select the second image (index 1 of 2)
      ImageInteractionHandler._selectedImg = mockImg(1, 2);

      ImageInteractionHandler.deleteSelected();

      expect(saved).toBeTruthy();
      expect(saved).toContain("first.png");
      expect(saved).not.toContain("second.png");
    });

    it("calls onDelete callback when set", () => {
      const md = '<img src="images/test.png" alt="test" />';
      const onDelete = vi.fn();

      ImageInteractionHandler._getMarkdown = () => md;
      ImageInteractionHandler._onDelete = onDelete;
      ImageInteractionHandler._selectedImg = mockImg(0, 1);

      ImageInteractionHandler.deleteSelected();

      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(onDelete.mock.calls[0][0]).not.toContain("<img");
    });

    it("does nothing when no image is selected", () => {
      const md = '<img src="images/test.png" alt="test" />';
      let called = false;

      ImageInteractionHandler._getMarkdown = () => md;
      ImageInteractionHandler._setMarkdown = () => {
        called = true;
      };
      ImageInteractionHandler._selectedImg = null;

      ImageInteractionHandler.deleteSelected();

      expect(called).toBe(false);
    });

    it("does nothing when markdown is empty", () => {
      let called = false;

      ImageInteractionHandler._getMarkdown = () => "";
      ImageInteractionHandler._setMarkdown = () => {
        called = true;
      };
      ImageInteractionHandler._selectedImg = mockImg(0, 1);

      ImageInteractionHandler.deleteSelected();

      expect(called).toBe(false);
    });

    it("does nothing when image index is out of range", () => {
      const md = '<img src="images/test.png" alt="test" />';
      let called = false;

      ImageInteractionHandler._getMarkdown = () => md;
      ImageInteractionHandler._setMarkdown = () => {
        called = true;
      };
      // Slide has 3 images, selected is index 2, but markdown only has 1
      ImageInteractionHandler._selectedImg = mockImg(2, 3);

      ImageInteractionHandler.deleteSelected();

      expect(called).toBe(false);
    });

    it("cleans up surrounding whitespace after deletion", () => {
      const md = '## Title\n\n<img src="images/test.png" alt="test" />\n\nMore text';
      let saved = null;

      ImageInteractionHandler._getMarkdown = () => md;
      ImageInteractionHandler._setMarkdown = (updated) => {
        saved = updated;
      };
      ImageInteractionHandler._selectedImg = mockImg(0, 1);

      ImageInteractionHandler.deleteSelected();

      // Should not have excessive blank lines
      expect(saved).not.toMatch(/\n{3,}/);
      expect(saved.trim()).toBe("## Title\n\nMore text");
    });
  });

  describe("fitToWidth", () => {
    it("clamps portrait images to the slide height while keeping aspect ratio", () => {
      const area = {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080 }),
      };
      const img = {
        closest: (sel) => (sel === ".slide__area" ? area : null),
        getBoundingClientRect: () => ({ left: 100, top: 200, width: 300, height: 400 }),
        naturalWidth: 300,
        naturalHeight: 400,
        style: { left: "100px", top: "200px" },
      };
      const applySettings = vi
        .spyOn(ImageInteractionHandler, "applySettings")
        .mockImplementation(() => {});
      ImageInteractionHandler._selectedImg = img;
      ImageInteractionHandler._getStageScale = () => 1;

      ImageInteractionHandler.fitToWidth();

      expect(applySettings).toHaveBeenCalledWith({
        width: 810,
        height: 1080,
        left: 0,
        top: 0,
      });
    });
  });
});
