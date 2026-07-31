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
import {
  buildTextBlockDirective,
  parseTextBlockDirectives,
  updateTextBlockDirective,
  removeTextBlockDirective,
  replaceLegacyTextBlock,
  removeLegacyTextBlock,
} from "../../core/text-block-directive.js";

const DEFAULT_W = 320;
const DEFAULT_H = 80;

const CLEAR_ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="20" y2="20"/><line x1="20" y1="4" x2="4" y2="20"/></svg>';

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
    fontSize: parseFloat(style.fontSize) || 32,
    color: style.color || "",
    backgroundColor: style.backgroundColor || "transparent",
    textAlign: style.textAlign || "left",
    opacity: Number(style.opacity) || 1,
    zIndex: parseInt(style.zIndex, 10) || 0,
    rotation: parseFloat(rotMatch?.[1] || "0"),
    fontWeight: style.fontWeight || "",
    fontStyle: style.fontStyle || "",
    textDecoration: style.textDecoration || "",
  };
}

/**
 * Read the current stage scale factor from the DOM.
 */
function getStageScale() {
  const stage = document.querySelector(".stage__inner");
  if (!stage) return 1;
  const transform = getComputedStyle(stage).transform;
  if (!transform || transform === "none") return 1;
  const match = transform.match(/matrix\(([^,]+),/);
  return match ? parseFloat(match[1]) : 1;
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
  static _idCounter = 0;
  static _panel = null;
  static _abortController = null;

  /**
   * @param {object} opts
   * @param {() => string} opts.getMarkdown
   * @param {(md: string) => void} opts.setMarkdown
   * @param {(md: string) => void} [opts.onDelete]
   * @param {() => object|null} opts.getMarkdownEditor
   * @param {() => number} opts.getCurrentSlideIndex
   * @param {(index: number) => HTMLElement|null} opts.getSlideElementByIndex
   */
  static init({
    getMarkdown,
    setMarkdown,
    onDelete,
    getMarkdownEditor,
    getCurrentSlideIndex,
    getSlideElementByIndex,
  }) {
    if (this._initialized) return;
    this._initialized = true;
    this._getMarkdown = getMarkdown;
    this._setMarkdown = setMarkdown;
    this._onDelete = onDelete;
    this._getMarkdownEditor = getMarkdownEditor;
    this._getCurrentSlideIndex = getCurrentSlideIndex;
    this._getSlideElementByIndex = getSlideElementByIndex;

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
      fontSize: 32,
      color: "",
      backgroundColor: "transparent",
      textAlign: "left",
      opacity: 1,
      zIndex: 0,
      rotation: 0,
    };
    const directive = buildTextBlockDirective(settings, "Text");
    this._insertHtmlSnippet(directive, settings.float);
  }

  static _nextId() {
    this._idCounter += 1;
    return `tb-${Date.now()}-${this._idCounter}`;
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
        if (!block) return;
        e.stopPropagation();
        this._enterInlineEdit(block);
      },
      { signal },
    );

    container.addEventListener(
      "blur",
      (e) => {
        const block = e.target.closest(".text-block");
        if (!block) return;
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
    this._selected = el;
    el.classList.add("text-block--selected");
    el.setAttribute("contenteditable", "false");
  }

  static deselect() {
    if (this._selected) {
      if (this._selected.isConnected) {
        this._selected.classList.remove("text-block--selected");
        if (this._selected.isContentEditable) this._finishInlineEdit(this._selected);
      }
      this._selected = null;
    }
    this._hidePanel();
  }

  static _ensureId(el) {
    if (!el || el.dataset.id) return;
    const content = el.innerText?.trim() || "";
    const md = this._getMarkdown?.() || "";
    const blocks = parseTextBlockDirectives(md);
    const match = blocks.find((b) => !b.settings.id && b.content.trim() === content);
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
   * Find the selected text block in markdown and replace it with its current
   * DOM state.
   */
  static _syncToMarkdown() {
    const el = this._selected;
    if (!el) return;
    const id = el.dataset.id;
    if (!id) return;
    const md = this._getMarkdown?.() || "";

    const settings = readTextBlockSettings(el);
    settings.id = id;
    const content = el.innerText || "";
    let updated = updateTextBlockDirective(md, id, settings, content);
    if (updated == null) {
      updated = replaceLegacyTextBlock(md, id, settings, content);
    }
    if (updated != null) {
      this._setMarkdown?.(updated);
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
            <textarea class="text-properties-panel__textarea" data-field="content" rows="4" placeholder="Text"></textarea>
          </div>
          <div class="text-properties-panel__row">
            <button type="button" class="text-properties-panel__chip" data-action="align-left">Left</button>
            <button type="button" class="text-properties-panel__chip" data-action="align-center">Center</button>
            <button type="button" class="text-properties-panel__chip" data-action="align-right">Right</button>
          </div>
          <div class="text-properties-panel__row">
            <label class="text-properties-panel__field text-properties-panel__field--check">
              <input type="checkbox" class="text-properties-panel__checkbox" data-field="float" />
              <span class="text-properties-panel__field-label">Float (overlay)</span>
            </label>
          </div>
        </div>
        <div class="text-properties-panel__tab webdeck-hidden" data-tab-content="style">
          <div class="text-properties-panel__row">
            <button type="button" class="text-properties-panel__chip" data-action="bold">B</button>
            <button type="button" class="text-properties-panel__chip" data-action="italic">I</button>
            <button type="button" class="text-properties-panel__chip" data-action="underline">U</button>
            <button type="button" class="text-properties-panel__chip" data-action="strikethrough">S</button>
          </div>
          <div class="text-properties-panel__row">
            <label class="text-properties-panel__field">
              <span class="text-properties-panel__field-label">Font</span>
              <input type="number" class="text-properties-panel__input" data-field="fontSize" />
            </label>
            <div class="text-properties-panel__field">
              <span class="text-properties-panel__field-label">Color</span>
              <span class="text-properties-panel__input-wrap">
                <button type="button" class="text-properties-panel__clear-btn" data-action="reset-color" aria-label="Reset color">${CLEAR_ICON}</button>
                <input type="color" class="text-properties-panel__input" data-field="color" />
              </span>
            </div>
          </div>
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

    el.addEventListener("change", () => this._syncToMarkdown());
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

  static _showPanel() {
    this._ensurePanel();
    const el = this._selected;
    if (!el || !this._panel) return;
    ImagePropertiesPanel.hide();
    this._ensureId(el);
    this._syncPanelUI();
    this._switchTab("text");
    this._panel.classList.remove("webdeck-hidden");

    const rect = el.getBoundingClientRect();
    const panelH = this._panel.offsetHeight || 260;
    const panelW = this._panel.offsetWidth || 280;

    let left = rect.right + window.scrollX + 8;
    let top = rect.top + window.scrollY;
    if (left + panelW > window.innerWidth) {
      left = rect.left + window.scrollX - panelW - 8;
    }
    top = Math.max(8, Math.min(top, window.innerHeight - panelH - 8));

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

    setValue("content", el.innerText || "");
    setValue("left", settings.left);
    setValue("top", settings.top);
    setValue("fontSize", settings.fontSize);
    setValue("rotation", settings.rotation);
    setValue("color", settings.color);
    setValue("backgroundColor", settings.backgroundColor);
    setValue("opacity", settings.opacity);
    setValue("zIndex", settings.zIndex);
    setValue("float", settings.float);

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

  static _onPanelInput(field, value) {
    const el = this._selected;
    if (!el) return;

    if (field === "content") {
      el.innerText = value;
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

    const numeric = ["left", "top", "fontSize", "rotation", "zIndex"].includes(field);
    if (numeric) {
      const n = parseFloat(value);
      if (Number.isNaN(n)) return;
      if (field === "rotation") {
        el.style.transform = n ? `rotate(${n}deg)` : "";
      } else if (["left", "top", "fontSize"].includes(field)) {
        el.style[field === "fontSize" ? "fontSize" : field] = `${n}px`;
      } else {
        el.style[field] = String(n);
      }
      return;
    }

    if (field === "opacity") {
      el.style.opacity = value;
    } else if (["color", "backgroundColor"].includes(field)) {
      el.style[field] = value;
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
      el.style.textAlign = alignMap[action];
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
