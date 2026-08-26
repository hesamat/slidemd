/**
 * TextBlockHandler
 *
 * Handles insertion, drag-and-drop repositioning, inline editing, and the
 * floating properties panel for free-form text blocks in slide content.
 *
 * Text blocks are stored as raw HTML <div class="text-block" ...> snippets
 * inside the slide markdown.  They are rendered as part of the area HTML,
 * positioned absolutely relative to their containing .slide__area, and
 * updated by writing the modified HTML back to the markdown source.
 */

import interact from "interactjs";
import { ImagePropertiesPanel } from "../image/image-properties-panel.js";
import { ImageInteractionHandler } from "../image/image-interaction-handler.js";
import {
  buildTextBlockDirective,
  parseTextBlockDirectives,
  updateTextBlockDirective,
  removeTextBlockDirective,
  replaceLegacyTextBlock,
  removeLegacyTextBlock,
  TEXT_BLOCK_TAIL_SIDES,
} from "../../core/text-block-directive.js";
import { iconString } from "../../core/icon.js";
import { getStageScale } from "../../core/utils.js";

const DEFAULT_W = 320;
const DEFAULT_H = 80;

// Alignments the preset CSS mirrors onto data-align (bubble tail side and
// cross-axis pin). Anything else leaves data-align untouched.
const TEXT_ALIGNS = new Set(["left", "center", "right"]);

const CLEAR_ICON = iconString("close", { size: "xl" });

/**
 * Read current settings from a text-block DOM element.
 */
function readTextBlockSettings(el) {
  const style = el.style;
  const transform = style.transform || "";
  const rotMatch = transform.match(/rotate\(([-\d.]+)deg\)/i);
  return {
    id: el.dataset.id || "",
    float: el.classList.contains("text-block--float"),
    left: parseFloat(style.left) || 0,
    top: parseFloat(style.top) || 0,
    fontSize: parseFloat(style.fontSize) || 30,
    color: style.color || "",
    backgroundColor: style.backgroundColor || "transparent",
    textAlign: style.textAlign || "left",
    opacity: Number(style.opacity) || 1,
    zIndex: parseInt(style.zIndex, 10) || 0,
    rotation: parseFloat(rotMatch?.[1] || "0"),
    columnCount: parseInt(style.columnCount, 10) || 0,
    markdown: el.classList.contains("text-block--markdown"),
    fontWeight: style.fontWeight || "",
    fontStyle: style.fontStyle || "",
    textDecoration: style.textDecoration || "",
    preset: el.dataset.preset || "",
    tail: el.dataset.tail || "",
    borderColor: style.getPropertyValue("--bubble-border-color").trim(),
  };
}

export class TextBlockHandler {
  static _initialized = false;
  static _container = null;
  static _selected = null;
  static _getMarkdown = null;
  static _setMarkdown = null;
  static _onDelete = null;
  static _getMarkdownEditor = null;
  static _getCurrentSlideIndex = null;
  static _getSlideElementByIndex = null;
  static _getAreaOffsets = null;
  static _idCounter = 0;
  static _panel = null;
  static _panelSide = null;
  static _abortController = null;
  static _onPreviewReady = null;
  static _pendingContent = null;

  /**
   * @param {object} opts
   * @param {() => string} opts.getMarkdown
   * @param {(md: string) => void} opts.setMarkdown
   * @param {(md: string) => void} [opts.onDelete]
   * @param {() => object|null} opts.getMarkdownEditor
   * @param {() => number} opts.getCurrentSlideIndex
   * @param {(index: number) => HTMLElement|null} opts.getSlideElementByIndex
   * @param {(markdown: string) => Record<string, number>} [opts.getAreaOffsets]
   *   Returns the 0-indexed editor line where each area's content starts.
   * @param {(callback: (slideEl: HTMLElement) => void) => void} [opts.onPreviewReady]
   *   Register a one-shot callback to run after the next preview re-render.
   */
  static init({
    getMarkdown,
    setMarkdown,
    onDelete,
    getMarkdownEditor,
    getCurrentSlideIndex,
    getSlideElementByIndex,
    getAreaOffsets,
    onPreviewReady,
  }) {
    if (this._initialized) return;
    this._initialized = true;
    this._getMarkdown = getMarkdown;
    this._setMarkdown = setMarkdown;
    this._onDelete = onDelete;
    this._getMarkdownEditor = getMarkdownEditor;
    this._getCurrentSlideIndex = getCurrentSlideIndex;
    this._getSlideElementByIndex = getSlideElementByIndex;
    this._getAreaOffsets = getAreaOffsets || null;
    this._onPreviewReady = onPreviewReady || null;

    document.addEventListener("mousedown", (e) => {
      if (!this._selected) return;
      if (e.target.closest(".text-block") === this._selected) return;
      if (e.target.closest(".text-properties-panel")) return;
      if (this._selected.isContentEditable) return;
      this.deselect();
    });
  }

  /**
   * Insert a default text block centered in the main area.
   */
  static insertTextBlock() {
    const editor = this._getMarkdownEditor?.();
    if (!editor) return;

    const slideEl = this._getSlideElementByIndex(this._getCurrentSlideIndex());
    const mainArea = slideEl?.querySelector(".slide__area--main");
    const scale = getStageScale();
    let left = 200;
    let top = 200;

    if (mainArea) {
      const rect = mainArea.getBoundingClientRect();
      const width = rect.width / scale || 800;
      const height = rect.height / scale || 400;
      left = Math.round((width - DEFAULT_W) / 2);
      top = Math.round((height - DEFAULT_H) / 2);
    }

    const id = this._nextId();
    const settings = {
      id,
      float: false,
      left,
      top,
      fontSize: 30,
      color: "",
      backgroundColor: "transparent",
      textAlign: "left",
      opacity: 1,
      zIndex: 0,
      rotation: 0,
      columnCount: 0,
    };
    const directive = buildTextBlockDirective(settings, "Text");
    this._insertHtmlSnippet(directive, settings.float);

    // Auto-open the properties panel once the preview re-renders the new block.
    // If an in-flight render from an earlier keystroke completes first (before
    // the new block exists), re-register so the callback fires on the render
    // that actually contains the block. Give up if the user navigates away
    // from the insertion slide or after a few retries to avoid a permanently
    // pending callback that pops the panel open out of context later.
    const insertionSlide = this._getCurrentSlideIndex?.() ?? 0;
    let retries = 0;
    const MAX_RETRIES = 3;
    const onReady = (slideEl) => {
      // Bail if the user exited edit mode or navigated away.
      if (!this._container) return;
      const currentSlide = this._getCurrentSlideIndex?.() ?? 0;
      if (currentSlide !== insertionSlide) return;
      const block = slideEl?.querySelector(`.text-block[data-id="${id}"]`);
      if (!block) {
        if (retries >= MAX_RETRIES) return;
        retries += 1;
        this._onPreviewReady?.(onReady);
        return;
      }
      // Deselect any selected image so only one element appears selected.
      ImageInteractionHandler.deselect();
      this.select(block);
      block.classList.add("text-block--just-inserted");
      const removeHighlight = () => block.classList.remove("text-block--just-inserted");
      block.addEventListener(
        "animationend",
        (e) => {
          if (e.target === block) removeHighlight();
        },
        { once: true },
      );
      // Fallback in case animationend never fires (e.g. animations disabled).
      setTimeout(removeHighlight, 2800);
      this._showPanel({ below: true });
    };
    this._onPreviewReady?.(onReady);
  }

  /**
   * Next free text-block id. Ids are required so panel edits can target the
   * exact directive in the markdown; they're kept short (`tb-1`, `tb-2`, …)
   * and collision-checked against the current document so they stay readable
   * in the editor source.
   */
  static _nextId() {
    const md = this._getMarkdown?.() || "";
    const taken = new Set(
      parseTextBlockDirectives(md)
        .map((b) => b.settings.id)
        .filter(Boolean),
    );
    let n = this._idCounter + 1;
    while (taken.has(`tb-${n}`)) n += 1;
    this._idCounter = n;
    return `tb-${n}`;
  }

  /**
   * Insert an HTML snippet into the current slide. Non-floating text is placed
   * after the @main area marker when available so it belongs to a column; float
   * text is appended at the end of the slide as an overlay.
   */
  static _insertHtmlSnippet(snippet, float) {
    const editor = this._getMarkdownEditor();
    const current = editor.getValue();
    const idx = this._getCurrentSlideIndex?.() ?? 0;
    const separator = "\n\n---\n\n";
    const slides = current.split(separator);

    const safeIdx = Math.min(Math.max(idx, 0), slides.length - 1);
    let slideStart = 0;
    for (let i = 0; i < safeIdx; i++) {
      slideStart += slides[i].length + separator.length;
    }

    const slide = slides[safeIdx];
    let insertPos;
    let pad;

    if (!float) {
      const mainMatch = slide.match(/^@main\b/m);
      if (mainMatch) {
        const mainIdx = slide.indexOf(mainMatch[0]);
        const lineEnd = slide.indexOf("\n", mainIdx) + 1;
        insertPos = slideStart + (lineEnd || slide.length);
        pad = "\n";
      } else {
        insertPos = slideStart + slide.length;
        pad = "\n\n";
      }
    } else {
      insertPos = slideStart + slide.length;
      const prev = current[insertPos - 1] || "";
      const next = current[insertPos] || "";
      pad = prev === "\n" || next === "\n" ? "\n" : "\n\n";
    }

    editor.replaceRange(insertPos, insertPos, `${pad}${snippet}\n\n`);
    editor.focus();
  }

  /**
   * Activate drag, right-click, and inline-edit listeners for text blocks in
   * the given slide grid container.
   */
  static activate(container) {
    this.deactivate();
    this._container = container;
    this._abortController = new AbortController();
    const { signal } = this._abortController;

    this._interactable = interact(".text-block--float", { context: container });
    this._interactable.draggable({
      listeners: {
        start: (e) => this._onDragStart(e),
        move: (e) => this._onDragMove(e),
        end: (e) => this._onDragEnd(e),
      },
    });

    container.addEventListener(
      "contextmenu",
      (e) => {
        const block = e.target.closest(".text-block");
        if (!block) return;
        e.preventDefault();
        e.stopPropagation();
        this.select(block);
        this._showPanel();
      },
      { signal },
    );

    container.addEventListener(
      "dblclick",
      (e) => {
        const block = e.target.closest(".text-block");
        if (!block || this.isMultiColumn(block)) return;
        e.stopPropagation();
        this._enterInlineEdit(block);
      },
      { signal },
    );

    container.addEventListener(
      "blur",
      (e) => {
        const block = e.target.closest(".text-block");
        if (!block || this.isMultiColumn(block)) return;
        this._finishInlineEdit(block);
      },
      { signal, capture: true },
    );
  }

  static deactivate() {
    this._interactable?.unset();
    this._interactable = null;
    this._container = null;
    this._abortController?.abort();
    this._abortController = null;
    this.deselect();
  }

  static select(el) {
    if (this._selected && this._selected !== el) this.deselect();
    if (!el.isConnected) return;
    this._pendingContent = null;
    this._selected = el;
    el.classList.add("text-block--selected");
    el.setAttribute("contenteditable", "false");
  }

  static deselect() {
    this._pendingContent = null;
    if (this._selected) {
      if (this._selected.isConnected) {
        this._selected.classList.remove("text-block--selected");
        if (this._selected.isContentEditable) this._finishInlineEdit(this._selected);
      }
      this._selected = null;
    }
    this._hidePanel();
  }

  /**
   * Rendered-markdown text blocks (multi-column or explicitly marked as
   * markdown) show rendered HTML in the DOM rather than their markdown
   * source. They must not be inline-edited (dblclick) because innerText
   * would destroy markdown syntax, and panel content edits must be staged
   * as markdown source rather than read from the DOM. Selection, panel
   * open, and drag are still allowed.
   */
  static isMultiColumn(el) {
    if (!el) return false;
    return (
      el.classList.contains("text-block--multi-column") ||
      el.classList.contains("text-block--markdown")
    );
  }

  static _ensureId(el) {
    if (!el || el.dataset.id) return;
    const md = this._getMarkdown?.() || "";
    const blocks = parseTextBlockDirectives(md);
    let match = null;

    // Rendered (markdown / multi-column) blocks display rendered output in
    // the DOM, so innerText no longer matches the directive's markdown source.
    // Match by the area-relative source-line attribute instead.
    const sourceLineAttr = el.dataset.sourceLine;
    if (sourceLineAttr != null) {
      const areaEl = el.closest(".slide__area");
      const areaName = areaEl?.dataset?.areaName || "main";
      const areaStart = this._getAreaOffsets?.(md)?.[areaName] ?? 0;
      const targetLine = areaStart + parseInt(sourceLineAttr, 10);
      match = blocks.find((b) => {
        if (b.settings.id) return false;
        const line = md.slice(0, b.start).split("\n").length - 1;
        return line === targetLine;
      });
    }

    // Fall back to content matching for plain (non-rendered) blocks where
    // innerText and directive source are the same.
    if (!match) {
      const content = el.innerText?.trim() || "";
      match = blocks.find((b) => !b.settings.id && b.content.trim() === content);
    }
    if (!match) return;

    // Splice by the matched block's own offsets; looking the block up by an
    // empty id would rewrite whichever id-less block comes first in the slide.
    const id = this._nextId();
    const directive = buildTextBlockDirective({ ...match.settings, id }, match.content);
    const updated = md.slice(0, match.start) + directive + md.slice(match.end);
    el.dataset.id = id;
    this._setMarkdown?.(updated);
  }

  static _onDragStart(e) {
    const el = e.target?.closest?.(".text-block");
    if (!el) return;
    if (el.isContentEditable) {
      e.interaction?.stop?.();
      return;
    }
    this.select(el);
    this._ensureId(el);
    ImagePropertiesPanel.hide();
  }

  static _onDragMove(e) {
    const el = e.target?.closest?.(".text-block");
    if (!el || el !== this._selected) return;
    const scale = getStageScale();
    const dx = e.dx / scale;
    const dy = e.dy / scale;
    const left = (parseFloat(el.style.left) || 0) + dx;
    const top = (parseFloat(el.style.top) || 0) + dy;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  static _onDragEnd() {
    if (!this._selected) return;
    this._syncToMarkdown();
  }

  static _enterInlineEdit(el) {
    this._ensureId(el);
    el.classList.remove("text-block--selected");
    el.setAttribute("contenteditable", "true");
    el.focus();
  }

  static _finishInlineEdit(el) {
    if (!el.isContentEditable) return;
    el.setAttribute("contenteditable", "false");
    if (this._selected === el) el.classList.add("text-block--selected");
    this._syncToMarkdown();
  }

  /**
   * The parsed directive backing the selected block, or null (e.g. legacy
   * inline-HTML blocks).
   */
  static _findDirective(el) {
    const md = this._getMarkdown?.() || "";
    return parseTextBlockDirectives(md).find((b) => b.settings.id === el.dataset.id) ?? null;
  }

  /**
   * The markdown-source content of the block's directive, or null when the
   * directive can't be found.
   */
  static _directiveContent(el) {
    return this._findDirective(el)?.content ?? null;
  }

  /**
   * True when the block's content is markdown-rendered rather than inline
   * plain text. Checked against the directive, not the live class: a panel
   * checkbox toggles the class before the sync runs, but the directive still
   * describes the pre-toggle rendering whose markdown source must survive
   * the round-trip (innerText of rendered output would destroy syntax).
   */
  static _isRenderedBlock(el) {
    const block = this._findDirective(el);
    if (block) return Boolean(block.settings.markdown || block.settings.columnCount);
    return this.isMultiColumn(el);
  }

  /**
   * Content to persist for the selected block. Plain blocks are edited
   * inline, so the DOM text is the source of truth. Rendered (multi-column
   * or markdown) blocks show *rendered* output in the DOM — innerText there
   * would destroy markdown syntax — so the directive's stored content wins,
   * except for panel textarea edits staged in _pendingContent.
   */
  static _readContentForSync(el) {
    if (this._pendingContent != null) {
      const staged = this._pendingContent;
      this._pendingContent = null;
      return staged;
    }
    if (!this._isRenderedBlock(el)) return el.innerText || "";
    return this._directiveContent(el) ?? (el.innerText || "");
  }

  /**
   * Find the selected text block in markdown and replace it with its current
   * DOM state. The preview re-render replaces `areaEl.innerHTML` in-place,
   * which destroys the selected DOM node, so we re-attach the selection to
   * the freshly rendered element via the preview callback.
   */
  static _syncToMarkdown() {
    const el = this._selected;
    if (!el) return;
    const id = el.dataset.id;
    if (!id) return;
    const md = this._getMarkdown?.() || "";

    const settings = readTextBlockSettings(el);
    settings.id = id;
    const content = this._readContentForSync(el);
    let updated = updateTextBlockDirective(md, id, settings, content);
    if (updated == null) {
      updated = replaceLegacyTextBlock(md, id, settings, content);
    }
    if (updated != null) {
      this._setMarkdown?.(updated);
      // Re-select the freshly rendered node after the preview patches
      // innerHTML — otherwise _selected stays detached and further panel
      // edits silently no-op.
      if (this._onPreviewReady) {
        this._onPreviewReady((slideEl) => {
          const fresh =
            slideEl?.querySelector(`.text-block[data-id="${id}"]`) ||
            document.querySelector(`.text-block[data-id="${id}"]`);
          if (fresh) {
            this.select(fresh);
            this._syncPanelUI();
            // The block may have moved/resized (preset toggles, float
            // changes) — keep the panel anchored to it.
            this._positionPanel(fresh);
          } else {
            // Fallback: the node is truly gone (deleted). Clear the stale ref.
            if (!this._selected?.isConnected) this._selected = null;
          }
        });
      }
    }
  }

  // ─── Properties panel ─────────────────────────────────────────────────────

  static _ensurePanel() {
    if (this._panel) return;
    const el = document.createElement("div");
    el.id = "textPropertiesPanel";
    el.className = "text-properties-panel webdeck-hidden";
    el.setAttribute("role", "toolbar");
    el.setAttribute("aria-label", "Text block properties");
    el.innerHTML = `
      <div class="text-properties-panel__header">
        <button type="button" class="text-properties-panel__tab-btn active" data-tab="text">Text</button>
        <button type="button" class="text-properties-panel__tab-btn" data-tab="style">Style</button>
        <button type="button" class="text-properties-panel__tab-btn" data-tab="position">Position</button>
      </div>
      <div class="text-properties-panel__body">
        <div class="text-properties-panel__tab" data-tab-content="text">
          <div class="text-properties-panel__row">
            <textarea class="text-properties-panel__textarea" data-field="content" rows="3" placeholder="Text"></textarea>
          </div>
          <div class="text-properties-panel__row">
            <label class="text-properties-panel__field text-properties-panel__field--check">
              <input type="checkbox" class="text-properties-panel__checkbox" data-field="markdown" />
              <span class="text-properties-panel__field-label">Render Markdown</span>
            </label>
            <label class="text-properties-panel__field text-properties-panel__field--compact">
              <span class="text-properties-panel__field-label">Columns</span>
              <input type="number" min="0" max="4" step="1" class="text-properties-panel__input" data-field="columnCount" placeholder="—" />
            </label>
          </div>
          <div class="text-properties-panel__section-label">Paragraph</div>
          <div class="text-properties-panel__row">
            <button type="button" class="text-properties-panel__chip" data-action="align-left">Left</button>
            <button type="button" class="text-properties-panel__chip" data-action="align-center">Center</button>
            <button type="button" class="text-properties-panel__chip" data-action="align-right">Right</button>
          </div>
          <div class="text-properties-panel__section-label">Bubble</div>
          <div class="text-properties-panel__row">
            <label class="text-properties-panel__field text-properties-panel__field--check">
              <input type="checkbox" class="text-properties-panel__checkbox" data-field="bubbleEnabled" />
              <span class="text-properties-panel__field-label">Enabled</span>
            </label>
            <select class="text-properties-panel__input" data-field="tail" aria-label="Tail direction">
              <option value="bottom">Tail: Bottom</option>
              <option value="top">Tail: Top</option>
              <option value="left">Tail: Left</option>
              <option value="right">Tail: Right</option>
            </select>
          </div>
          <div class="text-properties-panel__row text-properties-panel__row--bubble-only webdeck-hidden">
            <div class="text-properties-panel__field">
              <span class="text-properties-panel__field-label">Border color</span>
              <span class="text-properties-panel__input-wrap">
                <button type="button" class="text-properties-panel__clear-btn" data-action="reset-border-color" aria-label="Reset border color">${CLEAR_ICON}</button>
                <input type="color" class="text-properties-panel__input" data-field="borderColor" />
              </span>
            </div>
          </div>
        </div>
        <div class="text-properties-panel__tab webdeck-hidden" data-tab-content="style">
          <div class="text-properties-panel__section-label">Font</div>
          <div class="text-properties-panel__row">
            <button type="button" class="text-properties-panel__chip" data-action="bold">B</button>
            <button type="button" class="text-properties-panel__chip" data-action="italic">I</button>
            <button type="button" class="text-properties-panel__chip" data-action="underline">U</button>
            <button type="button" class="text-properties-panel__chip" data-action="strikethrough">S</button>
          </div>
          <div class="text-properties-panel__row">
            <label class="text-properties-panel__field">
              <span class="text-properties-panel__field-label">Size</span>
              <input type="number" class="text-properties-panel__input" data-field="fontSize" />
            </label>
            <div class="text-properties-panel__field">
              <span class="text-properties-panel__field-label">Text color</span>
              <span class="text-properties-panel__input-wrap">
                <button type="button" class="text-properties-panel__clear-btn" data-action="reset-color" aria-label="Reset color">${CLEAR_ICON}</button>
                <input type="color" class="text-properties-panel__input" data-field="color" />
              </span>
            </div>
          </div>
          <div class="text-properties-panel__section-label">Surface</div>
          <div class="text-properties-panel__row">
            <div class="text-properties-panel__field">
              <span class="text-properties-panel__field-label">Background</span>
              <span class="text-properties-panel__input-wrap">
                <button type="button" class="text-properties-panel__clear-btn" data-action="reset-background" aria-label="No background">${CLEAR_ICON}</button>
                <input type="color" class="text-properties-panel__input" data-field="backgroundColor" />
              </span>
            </div>
            <label class="text-properties-panel__field">
              <span class="text-properties-panel__field-label">Opacity</span>
              <input type="number" step="0.1" min="0" max="1" class="text-properties-panel__input" data-field="opacity" />
            </label>
          </div>
        </div>
        <div class="text-properties-panel__tab webdeck-hidden" data-tab-content="position">
          <div class="text-properties-panel__section-label">Placement</div>
          <div class="text-properties-panel__row">
            <label class="text-properties-panel__field text-properties-panel__field--check">
              <input type="checkbox" class="text-properties-panel__checkbox" data-field="float" />
              <span class="text-properties-panel__field-label">Float (overlay)</span>
            </label>
          </div>
          <div class="text-properties-panel__row">
            <label class="text-properties-panel__field">
              <span class="text-properties-panel__field-label">X</span>
              <input type="number" class="text-properties-panel__input" data-field="left" />
            </label>
            <label class="text-properties-panel__field">
              <span class="text-properties-panel__field-label">Y</span>
              <input type="number" class="text-properties-panel__input" data-field="top" />
            </label>
          </div>
          <div class="text-properties-panel__row">
            <label class="text-properties-panel__field">
              <span class="text-properties-panel__field-label">Rotate</span>
              <input type="number" class="text-properties-panel__input" data-field="rotation" />
            </label>
            <label class="text-properties-panel__field">
              <span class="text-properties-panel__field-label">Z-Index</span>
              <input type="number" class="text-properties-panel__input" data-field="zIndex" />
            </label>
          </div>
        </div>
        <div class="text-properties-panel__row text-properties-panel__row--footer">
          <button type="button" class="text-properties-panel__btn text-properties-panel__btn--danger" data-action="delete">Delete</button>
        </div>
      </div>
    `;
    this._panel = el;
    document.body.appendChild(el);
    this._wirePanel();
  }

  static _wirePanel() {
    if (!this._panel) return;
    const { _panel: el } = this;

    el.addEventListener("input", (e) => {
      const field = e.target?.dataset?.field;
      if (!field) return;
      const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
      this._onPanelInput(field, value);
    });

    el.addEventListener("change", (e) => {
      // <select> fires change, not input, in some browsers — keep the live
      // DOM (dataset/style) in sync before the markdown sync reads it.
      const field = e.target?.dataset?.field;
      if (field === "tail" || field === "bubbleEnabled") {
        const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
        this._onPanelInput(field, v);
      }
      this._syncToMarkdown();
    });
    el.addEventListener("click", (e) => {
      const tab = e.target?.closest?.("[data-tab]")?.dataset?.tab;
      if (tab) {
        this._switchTab(tab);
        return;
      }
      const action = e.target?.closest?.("[data-action]")?.dataset?.action;
      if (!action) return;
      this._onPanelAction(action);
    });

    // Sync when a textarea loses focus.
    el.addEventListener(
      "blur",
      (e) => {
        if (e.target?.tagName === "TEXTAREA") this._syncToMarkdown();
      },
      true,
    );
  }

  static _switchTab(tab) {
    if (!this._panel) return;
    this._panel.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    this._panel.querySelectorAll("[data-tab-content]").forEach((pane) => {
      pane.classList.toggle("webdeck-hidden", pane.dataset.tabContent !== tab);
    });
  }

  static _showPanel({ below = false } = {}) {
    this._ensurePanel();
    const el = this._selected;
    if (!el || !this._panel) return;
    ImagePropertiesPanel.hide();
    this._ensureId(el);
    this._syncPanelUI();
    this._switchTab("text");
    this._panel.classList.remove("webdeck-hidden");
    // Explicit opens always re-record the anchor side; sync re-anchors reuse it.
    this._positionPanel(el, { below, preferredSide: true });
  }

  /**
   * Anchor the panel to the block's current geometry. Called on open and
   * again after sync-driven re-renders — the preview replaces the block node
   * (and presets change its size), so the panel would otherwise float
   * detached from the element it edits.
   */
  static _positionPanel(el, { below = false, preferredSide = null } = {}) {
    if (!el || !this._panel) return;
    // Remember which side the user opened with so re-anchors stay put.
    if (preferredSide) this._panelSide = below ? "below" : "right";
    const side = this._panelSide || (below ? "below" : "right");

    if (this._panel.classList.contains("webdeck-hidden")) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    const panelH = this._panel.offsetHeight || 260;
    const panelW = this._panel.offsetWidth || 280;

    let left;
    let top;
    if (side === "below") {
      left = rect.left + window.scrollX;
      top = rect.bottom + window.scrollY + 8;
      if (top + panelH > window.innerHeight + window.scrollY) {
        top = rect.top + window.scrollY - panelH - 8;
      }
    } else {
      left = rect.right + window.scrollX + 8;
      top = rect.top + window.scrollY;
      if (left + panelW > window.innerWidth + window.scrollX) {
        left = rect.left + window.scrollX - panelW - 8;
      }
    }
    top = Math.max(
      window.scrollY + 8,
      Math.min(top, window.innerHeight + window.scrollY - panelH - 8),
    );
    left = Math.max(
      window.scrollX + 8,
      Math.min(left, window.innerWidth + window.scrollX - panelW - 8),
    );

    this._panel.style.top = `${top}px`;
    this._panel.style.left = `${left}px`;
  }

  static _hidePanel() {
    if (this._panel) this._panel.classList.add("webdeck-hidden");
  }

  static _syncPanelUI() {
    const el = this._selected;
    if (!el || !this._panel) return;
    const settings = readTextBlockSettings(el);

    const setValue = (field, value) => {
      const input = this._panel.querySelector(`[data-field="${field}"]`);
      if (!input) return;
      if (input.type === "checkbox") {
        input.checked = !!value;
      } else if (input.type === "color") {
        input.value = (value || "").trim() || "#000000";
      } else if (field === "backgroundColor") {
        input.value = value && value !== "transparent" ? value : "#ffffff";
      } else {
        input.value = value;
      }
    };

    setValue("content", this._readPanelContent(el));
    setValue("left", settings.left);
    setValue("top", settings.top);
    setValue("fontSize", settings.fontSize);
    setValue("rotation", settings.rotation);
    setValue("color", settings.color);
    setValue("backgroundColor", settings.backgroundColor);
    setValue("opacity", settings.opacity);
    setValue("zIndex", settings.zIndex);
    setValue("float", settings.float);
    setValue("borderColor", settings.borderColor);
    setValue("columnCount", settings.columnCount || "");
    setValue("markdown", settings.markdown);
    setValue("bubbleEnabled", settings.preset === "bubble");
    setValue("tail", settings.tail || "bottom");

    // Tail direction only matters when bubble is on.
    const tailInput = this._panel.querySelector('[data-field="tail"]');
    if (tailInput) tailInput.disabled = settings.preset !== "bubble";

    // The border-color control only means something on a bubble preset.
    this._panel
      .querySelector(".text-properties-panel__row--bubble-only")
      ?.classList.toggle("webdeck-hidden", settings.preset !== "bubble");

    this._panel.querySelectorAll("[data-action]").forEach((btn) => {
      const action = btn.dataset.action;
      let active = false;
      switch (action) {
        case "align-left":
          active = settings.textAlign === "left";
          break;
        case "align-center":
          active = settings.textAlign === "center";
          break;
        case "align-right":
          active = settings.textAlign === "right";
          break;
        case "bold":
          active = settings.fontWeight === "bold" || settings.fontWeight === "700";
          break;
        case "italic":
          active = settings.fontStyle === "italic";
          break;
        case "underline":
          active = settings.textDecoration.includes("underline");
          break;
        case "strikethrough":
          active = settings.textDecoration.includes("line-through");
          break;
      }
      btn.classList.toggle("active", active);
    });
  }

  /**
   * Text for the panel's content textarea: rendered blocks show their
   * markdown source (the DOM only holds rendered output).
   */
  static _readPanelContent(el) {
    if (!this._isRenderedBlock(el)) return el.innerText || "";
    return this._directiveContent(el) ?? (el.innerText || "");
  }

  static _onPanelInput(field, value) {
    const el = this._selected;
    if (!el) return;

    if (field === "content") {
      if (this.isMultiColumn(el)) {
        // Rendered blocks show rendered output in the DOM; stage textarea
        // edits so _syncToMarkdown persists them as markdown source.
        this._pendingContent = value;
      } else {
        el.innerText = value;
      }
      return;
    }

    if (field === "float") {
      const isFloat = !!value;
      if (isFloat) {
        const area = el.closest(".slide__area");
        if (area) {
          const rect = el.getBoundingClientRect();
          const areaRect = area.getBoundingClientRect();
          const cs = getComputedStyle(area);
          const padL = parseFloat(cs.paddingLeft) || 0;
          const padT = parseFloat(cs.paddingTop) || 0;
          const scale = getStageScale();
          const left = Math.round((rect.left - areaRect.left) / scale - padL / scale);
          const top = Math.round((rect.top - areaRect.top) / scale - padT / scale);
          el.style.left = `${left}px`;
          el.style.top = `${top}px`;
        }
      } else {
        el.style.left = "";
        el.style.top = "";
      }
      el.classList.toggle("text-block--float", isFloat);
      el.style.position = isFloat ? "absolute" : "";
      return;
    }

    const pxFields = ["left", "top", "fontSize"];
    const numeric = [...pxFields, "rotation", "zIndex", "columnCount"].includes(field);
    if (numeric) {
      const n = parseFloat(value);
      if (Number.isNaN(n)) return;
      if (field === "rotation") {
        el.style.transform = n ? `rotate(${n}deg)` : "";
      } else if (pxFields.includes(field)) {
        el.style[field] = `${n}px`;
      } else if (field === "columnCount") {
        // 0 removes the column override so the block reverts to plain flow.
        el.style.columnCount = n ? String(n) : "";
      } else {
        el.style[field] = String(n);
      }
      return;
    }

    if (field === "bubbleEnabled") {
      const enabled = !!value;
      if (enabled) {
        el.classList.add("text-block--bubble");
        el.dataset.preset = "bubble";
        if (!TEXT_BLOCK_TAIL_SIDES.includes(el.dataset.tail)) el.dataset.tail = "bottom";
        const a = el.style.textAlign || "left";
        if (TEXT_ALIGNS.has(a)) el.dataset.align = a;
      } else {
        el.classList.remove("text-block--bubble");
        delete el.dataset.preset;
        delete el.dataset.tail;
        delete el.dataset.align;
      }
      this._syncPanelUI();
      return;
    }

    if (field === "tail") {
      if (el.dataset.preset === "bubble" && TEXT_BLOCK_TAIL_SIDES.includes(value)) {
        el.dataset.tail = value;
      }
      return;
    }

    if (field === "opacity") {
      el.style.opacity = value;
    } else if (["color", "backgroundColor"].includes(field)) {
      el.style[field] = value;
    } else if (field === "borderColor") {
      // Rides the same custom property the bubble CSS reads, so body border
      // and tail outline recolor together.
      el.style.setProperty("--bubble-border-color", value);
    } else if (field === "markdown") {
      el.classList.toggle("text-block--markdown", !!value);
    }
  }

  static _onPanelAction(action) {
    const el = this._selected;
    if (!el) return;

    if (action === "delete") {
      this._deleteSelected();
      return;
    }

    const alignMap = {
      "align-left": "left",
      "align-center": "center",
      "align-right": "right",
    };
    if (alignMap[action]) {
      const a = alignMap[action];
      el.style.textAlign = a;
      if (el.dataset.preset && TEXT_ALIGNS.has(a)) {
        el.dataset.align = a;
      }
      this._syncPanelUI();
      this._syncToMarkdown();
      return;
    }

    if (action === "bold") {
      const isBold = el.style.fontWeight === "bold" || el.style.fontWeight === "700";
      el.style.fontWeight = isBold ? "" : "bold";
    } else if (action === "italic") {
      el.style.fontStyle = el.style.fontStyle === "italic" ? "" : "italic";
    } else if (action === "underline") {
      this._toggleDecoration(el, "underline");
    } else if (action === "strikethrough") {
      this._toggleDecoration(el, "line-through");
    } else if (action === "reset-color") {
      el.style.color = "";
    } else if (action === "reset-background") {
      el.style.backgroundColor = "";
    } else if (action === "reset-border-color") {
      el.style.removeProperty("--bubble-border-color");
    }

    this._syncPanelUI();
    this._syncToMarkdown();
  }

  static _toggleDecoration(el, kind) {
    const set = new Set((el.style.textDecoration || "").split(" ").filter(Boolean));
    if (set.has(kind)) set.delete(kind);
    else set.add(kind);
    el.style.textDecoration = Array.from(set).join(" ") || "";
  }

  static _deleteSelected() {
    const el = this._selected;
    if (!el) return;
    const id = el.dataset.id;
    if (!id) return;
    const md = this._getMarkdown?.() || "";

    let updated = removeTextBlockDirective(md, id);
    if (updated == null) {
      updated = removeLegacyTextBlock(md, id);
    }
    if (updated == null) return;
    this.deselect();
    this._onDelete?.(updated);
  }
}
