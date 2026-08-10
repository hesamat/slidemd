import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ImageInteractionHandler } from "../editor/image/image-interaction-handler.js";
import { ImageDragController } from "../editor/image/image-drag-controller.js";
import { ImagePropertiesPanel } from "../editor/image/image-properties-panel.js";

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

describe("ImageInteractionHandler", () => {
  beforeEach(() => {
    ImageInteractionHandler._selectedImg = null;
    ImageInteractionHandler._getMarkdown = null;
    ImageInteractionHandler._setMarkdown = null;
    ImageInteractionHandler._onDelete = null;
    ImageInteractionHandler._overlay = { style: { display: "" }, remove: () => {} };
    ImageInteractionHandler.applySettings = vi.fn();
    // Make the imported getStageScale() return 1 in Node test env
    globalThis.document = { querySelector: () => null };
  });

  afterEach(() => {
    delete globalThis.document;
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

  describe("rotateBy", () => {
    function mockImgWithStyle(index, total, styleOverrides) {
      const img = mockImg(index, total);
      const style = {
        left: "",
        top: "",
        width: "",
        height: "",
        opacity: "",
        borderRadius: "",
        boxShadow: "",
        transform: "",
        zIndex: "",
        ...styleOverrides,
      };
      img.style = style;
      img.getAttribute = () => null;
      return img;
    }

    it("wraps negative rotation into the 0-359 range", () => {
      ImageInteractionHandler._selectedImg = mockImgWithStyle(0, 1, {
        width: "120px",
        height: "80px",
      });

      ImageInteractionHandler.rotateBy(-90);

      expect(ImageInteractionHandler.applySettings).toHaveBeenCalledWith({
        rotation: 270,
        width: 80,
        height: 120,
      });
    });

    it("wraps positive rotation past 360 back to zero", () => {
      ImageInteractionHandler._selectedImg = mockImgWithStyle(0, 1, {
        width: "120px",
        height: "80px",
        transform: "rotate(270deg)",
      });

      ImageInteractionHandler.rotateBy(90);

      expect(ImageInteractionHandler.applySettings).toHaveBeenCalledWith({ rotation: 0 });
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

      // Mock getComputedStyle to return 10px padding on all sides
      const origGetCS = globalThis.getComputedStyle;
      globalThis.getComputedStyle = () => ({
        paddingLeft: "10px",
        paddingRight: "10px",
        paddingTop: "10px",
        paddingBottom: "10px",
      });

      ImageInteractionHandler.fitToWidth();

      globalThis.getComputedStyle = origGetCS;

      // Content box is 1900×1060 after subtracting 20px padding
      // ratio = 300/400 = 0.75 → width = min(1900, 1060*0.75) = 795
      expect(applySettings).toHaveBeenCalledWith({
        width: 795,
        height: 1060,
        left: 0,
        top: 0,
      });
    });
  });

  describe("_reorderImageInMarkdown", () => {
    it("preserves rotation, opacity, borderRadius, boxShadow in the output", () => {
      const md =
        '<img src="images/test.png" alt="test" style="width: 100px" />\n\n<img src="images/other.png" alt="other" />';
      let saved = null;
      const allImgs = [{}, {}];
      const areaImgs = [];
      const area = {
        querySelectorAll: (sel) => (sel === "img" ? areaImgs : []),
        dataset: { areaName: "main" },
      };
      const slide = { querySelectorAll: () => allImgs };

      const style = {
        left: "0px",
        top: "0px",
        width: "100px",
        height: "80px",
        opacity: "0.5",
        borderRadius: "8px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
        transform: "rotate(45deg)",
        zIndex: "5",
      };
      const img = {
        closest: (sel) => {
          if (sel === ".slide__area") return area;
          if (sel === ".slide") return slide;
          return null;
        },
        classList: {
          add() {},
          remove() {},
          contains() {
            return false;
          },
          _classes: new Set(),
        },
        style,
        getAttribute: () => "test",
        dataset: { originalSrc: "images/test.png" },
        offsetWidth: 100,
        offsetHeight: 80,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 80 }),
        isConnected: true,
      };
      allImgs[0] = img;
      areaImgs.push(img);

      ImageInteractionHandler._getMarkdown = () => md;
      ImageInteractionHandler._setMarkdown = (updated) => {
        saved = updated;
      };
      ImageInteractionHandler._selectedImg = img;

      const targetSlide = { querySelectorAll: () => allImgs };
      const targetEl = {
        tagName: "IMG",
        parentNode: { insertBefore() {} },
        closest: (sel) => (sel === ".slide" ? targetSlide : null),
      };

      const origRAF = globalThis.requestAnimationFrame;
      globalThis.requestAnimationFrame = (cb) => {
        cb();
        return 0;
      };

      ImageInteractionHandler._reorderImageInMarkdown(img, targetEl);

      globalThis.requestAnimationFrame = origRAF;

      expect(saved).toBeTruthy();
      expect(saved).toContain("opacity: 0.5");
      expect(saved).toContain("border-radius: 8px");
      expect(saved).toContain("box-shadow");
      expect(saved).toContain("rotate(45deg)");
      expect(saved).toContain("z-index: 5");
    });
  });

  describe("_hideDropGap", () => {
    it("removes the gap element from DOM", () => {
      const gap = { remove: vi.fn() };
      ImageDragController._dropIndicator = gap;

      ImageDragController._hideDropGap();

      expect(gap.remove).toHaveBeenCalledTimes(1);
      expect(ImageDragController._dropIndicator).toBeNull();
    });

    it("does nothing when no gap element exists", () => {
      ImageDragController._dropIndicator = null;
      expect(() => ImageDragController._hideDropGap()).not.toThrow();
    });
  });

  describe("selection and drag lifecycle", () => {
    it("does not convert or reposition a markdown image on selection", () => {
      const img = {
        style: {
          left: "",
          top: "",
          width: "",
          height: "",
          opacity: "",
          borderRadius: "",
          boxShadow: "",
          transform: "",
          zIndex: "",
        },
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
          contains: () => false,
        },
        getAttribute: () => null,
        isConnected: true,
      };
      const setMarkdown = vi.fn();
      const showPanel = vi.spyOn(ImagePropertiesPanel, "show").mockImplementation(() => {});

      ImageInteractionHandler._slideContainer = null;
      ImageInteractionHandler._getMarkdown = () => "![image](image.png)";
      ImageInteractionHandler._setMarkdown = setMarkdown;
      ImageInteractionHandler.select(img);

      expect(img.style.position).toBeUndefined();
      expect(setMarkdown).not.toHaveBeenCalled();
      expect(showPanel).toHaveBeenCalledWith(img, expect.any(Object));
    });

    it("does not sync markdown when interact.js ends a click without movement", () => {
      const syncToMarkdown = vi.fn();
      const img = { isConnected: true };
      ImageDragController._ctx = { getSelectedImg: () => img, syncToMarkdown };
      ImageDragController._container = null;
      ImageDragController._dropIndicator = null;
      ImageDragController._dragMoved = false;

      ImageDragController._onDragEnd({});

      expect(syncToMarkdown).not.toHaveBeenCalled();
      expect(ImageDragController._dragMoved).toBe(false);
    });

    it("does not move the previously selected image when a media-span fill drag is ignored", () => {
      const label = { classList: { contains: (c) => c === "editor-area-label" } };
      const slide = { dataset: { mediaSpan: "right" } };
      const img = {
        style: { position: "" },
        classList: { contains: () => false },
        closest: (sel) => (sel === ".slide__area--media" ? area : null),
      };
      const area = {
        children: [label, img],
        querySelectorAll: () => [img],
        closest: (sel) => (sel === ".slide" ? slide : null),
      };

      const previouslySelected = {
        style: { position: "relative", left: "10px", top: "20px" },
        classList: { contains: () => false },
      };
      const prepareMdImgForDrag = vi.fn();
      const syncToMarkdown = vi.fn();
      ImageDragController._ctx = {
        getSelectedImg: () => previouslySelected,
        select: vi.fn(),
        prepareMdImgForDrag,
        syncToMarkdown,
      };
      ImageDragController._container = null;
      ImageDragController._dropIndicator = null;
      ImageDragController._dragMoved = false;
      ImageDragController._dragPrepared = false;
      ImageDragController._dragIgnored = false;

      ImageDragController._onDragStart({ target: { closest: () => img }, clientX: 0, clientY: 0 });
      ImageDragController._onDragMove({ dx: 50, dy: 0, clientX: 50, clientY: 0 });
      ImageDragController._onDragEnd({ clientX: 50, clientY: 0 });

      expect(prepareMdImgForDrag).not.toHaveBeenCalled();
      expect(syncToMarkdown).not.toHaveBeenCalled();
      expect(previouslySelected.style.left).toBe("10px");
      expect(previouslySelected.style.top).toBe("20px");
      expect(ImageDragController._dragIgnored).toBe(false);
    });
  });
});
