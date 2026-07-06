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
    const { areas: currentAreas } = parser.parseAreas(updatedMarkdown);
    const resolvedLayout = LayoutParser.parse(LayoutParser.resolvePreset(layoutName), {
      fallbackAreas: Object.keys(currentAreas).length ? Object.keys(currentAreas) : ["main"],
    });
    const requiredAreas = resolvedLayout.orderedAreas || [];

    // Strip unsupported areas and normalize header<->title aliases.
    updatedMarkdown = parser.collapseUnsupportedAreas(updatedMarkdown, requiredAreas);

    // Re-parse after collapsing to get the updated area state.
    const { areas: areasAfterCollapse } = parser.parseAreas(updatedMarkdown);

    let appendedContent = "";
    const areaPlaceholders = {
      secondary: "\n@secondary\n\n### Column Three\n\nContent for third column\n",
      media: "\n@media\n\n### Column Two\n\nContent for second column\n",
      sidebar: "\n@sidebar\n\n### Sidebar\n\nSidebar content\n",
      main: "\n@main\n\n### Main Content\n\nContent here\n",
    };

    for (const area of requiredAreas) {
      if (area === "header" || area === "title" || area === "footer") continue;

      if (!areasAfterCollapse[area] && areaPlaceholders[area]) {
        appendedContent += areaPlaceholders[area];
      }
    }

    if (appendedContent) {
      updatedMarkdown = updatedMarkdown.trim() + "\n" + appendedContent;
    }

    this.markdownEditor.setValue(updatedMarkdown, { suppressOnChange: false });
    this.markdownEditor.focus();
    Notification.success(`Layout changed to "${layoutName}"`);
  }
}
