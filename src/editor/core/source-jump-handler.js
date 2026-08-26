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
import { findMarkdownPosition } from "./markdown-utils.js";

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

        const textBlockEl = e.target.closest(".text-block");
        let blockEl = null;
        if (textBlockEl) {
          // The text-block div carries the directive's source line; the
          // nested <p>/<li>/<ol> elements have inner token lines that would
          // jump to the wrong place.
          blockEl = textBlockEl;
        } else {
          // Pick the outermost ancestor with data-source-line so clicking
          // inside a nested block (e.g. a list <li>) jumps to the top-level
          // fence/image/paragraph line instead of the inner token line.
          let current = e.target;
          while (current && current !== areaEl) {
            if (current.dataset?.sourceLine != null) {
              blockEl = current;
            }
            current = current.parentElement;
          }
        }
        if (!blockEl) return;

        const areaName = areaEl.dataset.areaName || "main";

        const markdownEditor = this._getMarkdownEditor();
        const editorMarkdown = markdownEditor?.getValue() ?? "";
        if (!editorMarkdown) return;
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

        let targetLine;
        let pos;

        if (textBlockEl) {
          // The text-block div carries the directive's source line.
          const sourceLine = parseInt(textBlockEl.dataset.sourceLine, 10);
          if (isNaN(sourceLine)) return;
          targetLine = areaStart + sourceLine;
          targetLine = Math.max(0, Math.min(targetLine, lines.length - 1));
          pos = 0;
          for (let i = 0; i < targetLine; i++) {
            pos += lines[i].length + 1;
          }
        } else {
          // For headings, paragraphs and other non-text-block content, the
          // data-source-line from the rendered HTML is often shifted because
          // text-block/table directives are replaced with multi-line HTML
          // before markdown-it renders the area. Find the source by matching
          // the element's text against the area markdown instead.
          const foundPos = findMarkdownPosition(editorMarkdown, blockEl, {
            preferSourceLine: false,
          });
          if (foundPos >= 0) {
            pos = foundPos;
            targetLine = editorMarkdown.slice(0, pos).split("\n").length - 1;
          } else {
            // Fallback for elements with no usable text (e.g. <img>).
            const sourceLine = parseInt(blockEl.dataset.sourceLine, 10);
            if (isNaN(sourceLine)) return;
            targetLine = areaStart + sourceLine;
            targetLine = Math.max(0, Math.min(targetLine, lines.length - 1));
            pos = 0;
            for (let i = 0; i < targetLine; i++) {
              pos += lines[i].length + 1;
            }
          }
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
