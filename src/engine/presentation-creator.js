/**
 * Presentation Creator
 *
 * Handles the "New Presentation" workflow: modal selection,
 * markdown generation, deck replacement.
 */
import { NewPresentationModal } from "../editor/new-presentation-modal.js";
import { ImagePicker } from "../editor/image/image-picker.js";
import { MarkdownParser } from "../data/markdown-parser.js";
import { AssetLoader } from "../core/asset-loader.js";
import { Notification } from "../renderer/notification.js";

export class PresentationCreator {
  /**
   * @param {object} opts
   * @param {object} opts.reloadManager - Deck reload manager
   */
  constructor({ reloadManager }) {
    this._reloadManager = reloadManager;
  }

  async create() {
    NewPresentationModal.setOnPickImage((onSelect) => {
      ImagePicker.show(
        (path) => {
          onSelect(path, "");
        },
        { pathOnly: true },
      );
    });
    const options = await NewPresentationModal.show();
    if (!options) return;

    const { background, theme, titleStyle, areaStyle, template } = options;

    let markdown = template.markdown;

    // Apply background, theme, header-style, and area-style to all slides
    // Title slides (layout: title-slide) get background/theme/header-style but NOT area-style
    markdown = markdown.replace(/^(layout: .+)$/gm, (match) => {
      let result = match;
      const isTitleSlide = match.includes("title-slide");
      if (background) result += `\nbackground: ${background}`;
      if (theme) result += `\ntheme: ${theme}`;
      if (titleStyle && titleStyle !== "short") result += `\nheader-style: ${titleStyle}`;
      if (areaStyle && !isTitleSlide) result += `\narea-style: ${areaStyle}`;
      return result;
    });

    // Store markdown in localStorage so edit mode can work
    localStorage.setItem("webdeck_local_file", markdown);
    localStorage.setItem("webdeck_local_file_type", "md");
    localStorage.setItem("webdeck_local_file_name", "New Presentation");
    localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());

    // Tell the CLI server to forget the old deck (clears stale image references)
    await fetch("/api/deck/reset", { method: "POST" }).catch(() => {});

    // Parse markdown into deck data
    await AssetLoader.ensureMarkdownItLoaded();
    const deckData = new MarkdownParser().parseDeckMarkdown(markdown);

    // Replace the current deck
    if (this._reloadManager?.replaceDeck) {
      await this._reloadManager.replaceDeck(deckData, { startAtFirstSlide: true });
    }

    // Update editor if open
    const editor = document.getElementById("markdownEditor");
    if (editor?.CodeMirror) {
      editor.CodeMirror.setValue(markdown);
    }

    Notification.info("New presentation created");
  }
}
