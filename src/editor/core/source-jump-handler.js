/**
 * SourceJumpHandler
 *
 * Click-to-jump: clicking a text element in the slide preview jumps the
 * CodeMirror cursor to the corresponding markdown source line.
 *
 * Extracted from EditController._initSourceJumpHandler().
 */

import { MarkdownParser } from "../../data/markdown-parser.js";

export class SourceJumpHandler {
  /** @param {import('./edit-controller.js').EditController} ctrl */
  constructor(ctrl) {
    this.ctrl = ctrl;
  }

  init() {
    const slidesContainer = this.ctrl.elements.slidesContainer;
    if (!slidesContainer) return;

    slidesContainer.addEventListener("click", (e) => {
      if (!this.ctrl.isEditMode) return;
      if (
        e.target.closest(
          ".editor-area-label, .editor-slide-warning, .image-overlay, .image-properties-panel, .grid-resize-handle",
        )
      )
        return;
      if (e.target.closest("img")) return;

      const areaEl = e.target.closest(".slide__area");
      if (!areaEl) return;

      const blockEl = e.target.closest("[data-source-line]");
      if (!blockEl) return;

      const areaName = areaEl.dataset.areaName || "main";
      const sourceLine = parseInt(blockEl.dataset.sourceLine, 10);
      if (isNaN(sourceLine)) return;

      const editorMarkdown = this.ctrl.markdownEditor?.getValue() ?? "";
      const lines = editorMarkdown.split("\n");

      const parser = new MarkdownParser();
      const areaOffsets = parser.computeAreaOffsets(editorMarkdown);
      let areaStart = areaOffsets[areaName];
      if (areaStart === undefined) {
        if (areaName === "title" && areaOffsets.header !== undefined) {
          areaStart = areaOffsets.header;
        } else if (areaName === "header" && areaOffsets.title !== undefined) {
          areaStart = areaOffsets.title;
        }
      }
      if (areaStart === undefined) areaStart = 0;

      let targetLine = areaStart + sourceLine;
      targetLine = Math.max(0, Math.min(targetLine, lines.length - 1));

      let pos = 0;
      for (let i = 0; i < targetLine; i++) {
        pos += lines[i].length + 1;
      }
      pos = Math.min(pos, editorMarkdown.length);

      this.ctrl.markdownEditor.setValueWithCursor(editorMarkdown, pos, {
        suppressOnChange: true,
        scrollIntoView: true,
      });
      this.ctrl.markdownEditor.highlightLine(targetLine);
    });
  }
}
