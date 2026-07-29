/**
 * LayoutManager
 *
 * Handles layout picker, layout application, and layout compatibility checks.
 * Extracted from EditController.
 */
import { MarkdownParser } from "../../data/markdown-parser.js";
import { Notification } from "../../renderer/notification.js";
import { LayoutParser } from "../../data/layout-parser.js";
import { LayoutPicker } from "./layout-picker.js";
import { updateLayoutDirective } from "../core/directive-utils.js";

export class LayoutManager {
  /**
   * @param {object} opts
   * @param {() => object|null} opts.getMarkdownEditor
   * @param {(layoutName: string) => void} opts.onAddSlideWithLayout
   */
  constructor({ getMarkdownEditor, onAddSlideWithLayout }) {
    this._getMarkdownEditor = getMarkdownEditor;
    this._onAddSlideWithLayout = onAddSlideWithLayout;
  }

  get markdownEditor() {
    return this._getMarkdownEditor();
  }

  showPicker() {
    LayoutPicker.show((layoutName) => this._onAddSlideWithLayout(layoutName));
  }

  showPickerForCurrentSlide() {
    LayoutPicker.show((layoutName) => this.applyToCurrentSlide(layoutName));
  }

  applyToCurrentSlide(layoutName) {
    if (!this.markdownEditor) return;

    const markdown = this.markdownEditor.getValue();
    let updatedMarkdown = updateLayoutDirective(markdown, layoutName);

    const parser = new MarkdownParser();
    const { areas: currentAreas } = MarkdownParser.parseAreas(updatedMarkdown);
    const resolvedLayout = LayoutParser.parse(LayoutParser.resolvePreset(layoutName), {
      fallbackAreas: Object.keys(currentAreas).length ? Object.keys(currentAreas) : ["main"],
    });
    const requiredAreas = resolvedLayout.orderedAreas || [];

    // Strip unsupported areas and normalize header<->title aliases.
    updatedMarkdown = parser.collapseUnsupportedAreas(updatedMarkdown, requiredAreas);

    // Re-parse after collapsing to get the updated area state.
    const { areas: areasAfterCollapse } = MarkdownParser.parseAreas(updatedMarkdown);

    const areaPlaceholders = {
      secondary: "@secondary",
      media: "@media",
      sidebar: "@sidebar",
      main: "@main",
    };

    const lines = updatedMarkdown.replace(/\r\n?/g, "\n").split("\n");

    for (const area of requiredAreas) {
      if (area === "header" || area === "title" || area === "footer") continue;
      if (areasAfterCollapse[area] || !areaPlaceholders[area]) continue;

      // Physical marker line positions are recomputed each iteration because
      // earlier insertions shift the line numbers of later anchors.
      const markerPositions = {};
      for (const { name, line } of parser.findAreaMarkers(lines.join("\n"))) {
        if (!(name in markerPositions)) markerPositions[name] = line;
      }

      // Find the next existing area marker that comes after this area in the
      // target layout's ordering; insert the placeholder before it so areas
      // stay in the expected order (e.g. @media before @footer). If no later
      // area exists, append to the end of the slide.
      const anchorLine = this._findAnchorLine(requiredAreas, area, markerPositions);

      const block = ["", areaPlaceholders[area], ""];
      if (anchorLine === -1) {
        while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
        lines.push(...block);
      } else {
        const hasPrecedingBlank = anchorLine > 0 && lines[anchorLine - 1].trim() === "";
        lines.splice(anchorLine, 0, ...(hasPrecedingBlank ? block.slice(1) : block));
      }
    }

    updatedMarkdown = lines.join("\n");

    this.markdownEditor.setValue(updatedMarkdown, { suppressOnChange: false });
    this.markdownEditor.focus();
    Notification.success(`Layout changed to "${layoutName}"`);
  }

  /**
   * Find the 0-indexed line of the next existing area marker that appears
   * after `currentArea` in the target layout's `requiredAreas` ordering.
   * @param {string[]} requiredAreas
   * @param {string} currentArea
   * @param {Record<string, number>} markerPositions
   * @returns {number} line index, or -1 if none exists
   */
  _findAnchorLine(requiredAreas, currentArea, markerPositions) {
    const start = requiredAreas.indexOf(currentArea);
    for (let i = start + 1; i < requiredAreas.length; i++) {
      const candidate = requiredAreas[i];
      if (candidate in markerPositions) return markerPositions[candidate];
    }
    return -1;
  }
}
