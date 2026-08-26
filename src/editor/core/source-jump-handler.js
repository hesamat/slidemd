/**
 * SourceJumpHandler
 *
 * Click-to-jump: clicking a text element in the slide preview jumps the
 * CodeMirror cursor to the corresponding markdown source line.
 * Uses AbortController for clean teardown.
 *
 * Extracted from EditController._initSourceJumpHandler().
 */

import { MarkdownParser } from "../../data/markdown-parser.js";

export class SourceJumpHandler {
  /**
   * @param {object} opts
   * @param {() => HTMLElement|null} opts.getSlidesContainer
   * @param {() => boolean} opts.getIsEditMode
   * @param {() => object|null} opts.getMarkdownEditor
   */
  constructor({ getSlidesContainer, getIsEditMode, getMarkdownEditor }) {
    this._getSlidesContainer = getSlidesContainer;
    this._getIsEditMode = getIsEditMode;
    this._getMarkdownEditor = getMarkdownEditor;
    this._abortController = null;
  }

  init() {
    const slidesContainer = this._getSlidesContainer();
    if (!slidesContainer) return;

    this._abortController = new AbortController();
    const { signal } = this._abortController;

    slidesContainer.addEventListener(
      "click",
      (e) => {
        if (!this._getIsEditMode()) return;
        if (
          e.target.closest(
            ".editor-area-label, .editor-slide-warning, .image-overlay, .image-properties-panel, .grid-resize-handle",
          )
        )
          return;
        if (e.target.closest("img")) return;

        const areaEl = e.target.closest(".slide__area");
        if (!areaEl) return;

        // Pick the outermost ancestor with data-source-line so clicking
        // inside a rendered text block (e.g. a <li> or <p>) jumps to the
        // directive/fence/paragraph line instead of the inner token line.
        let blockEl = null;
        let current = e.target;
        while (current && current !== areaEl) {
          if (current.dataset?.sourceLine != null) {
            blockEl = current;
          }
          current = current.parentElement;
        }
        if (!blockEl) return;

        const areaName = areaEl.dataset.areaName || "main";
        const sourceLine = parseInt(blockEl.dataset.sourceLine, 10);
        if (isNaN(sourceLine)) return;

        const markdownEditor = this._getMarkdownEditor();
        const editorMarkdown = markdownEditor?.getValue() ?? "";
        const lines = editorMarkdown.split("\n");

        const parser = new MarkdownParser();
        const areaOffsets = parser.computeAreaOffsets(editorMarkdown);
        let areaStart = areaOffsets[areaName];
        if (areaStart === undefined) {
          // @title / @header alias handling
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

        markdownEditor.setValueWithCursor(editorMarkdown, pos, {
          suppressOnChange: true,
          scrollIntoView: true,
          focus: false,
          recordHistory: false,
        });
        markdownEditor.highlightLine(targetLine);
      },
      { signal },
    );
  }

  destroy() {
    this._abortController?.abort();
    this._abortController = null;
  }
}
