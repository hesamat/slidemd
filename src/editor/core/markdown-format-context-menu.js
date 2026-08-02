/**
 * MarkdownFormatContextMenu
 *
 * Right-click context menu for the CodeMirror markdown editor.  Provides a
 * small set of Markdown formatting actions.  Works with or without an active
 * selection: without a selection it acts on the word or line under the cursor.
 *
 * Each action is a toggle: if the target already has the formatting, it is
 * removed; otherwise it is applied.
 */
export class MarkdownFormatContextMenu {
  static _active = null;

  static closeActive() {
    this._active?.close();
  }

  /**
   * Open the menu at the given screen coordinates for the given editor range.
   * @param {object} opts
   * @param {object} opts.editor - MarkdownEditor instance
   * @param {number} opts.from - Selection/cursor start
   * @param {number} opts.to - Selection/cursor end
   * @param {number} opts.clientX - Pointer x
   * @param {number} opts.clientY - Pointer y
   * @param {{label: string, action: () => void}[]} [opts.items] - Optional custom items to render instead of formatting actions
   */
  static open(opts) {
    MarkdownFormatContextMenu.closeActive();
    const menu = new MarkdownFormatContextMenu(opts);
    menu.render();
    MarkdownFormatContextMenu._active = menu;
  }

  constructor({ editor, from, to, clientX, clientY, items }) {
    this._editor = editor;
    this._from = from;
    this._to = to;
    this._clientX = clientX;
    this._clientY = clientY;
    this._items = items || null;
    this._menuEl = null;
    this._abortController = null;

    const value = this._editor.getValue();
    this._value = value;
    this._lineFrom = this._lineStart(value, from);
    this._lineTo = this._lineEnd(value, to);
    this._wordFrom = from === to ? this._wordStart(value, from) : from;
    this._wordTo = from === to ? this._wordEnd(value, to) : to;
  }

  render() {
    this.close();

    this._abortController = new AbortController();
    const { signal } = this._abortController;

    const menu = document.createElement("div");
    menu.className = "markdown-format-context-menu";
    menu.setAttribute("role", "menu");
    menu.style.left = `${this._clientX}px`;
    menu.style.top = `${this._clientY}px`;
    this._menuEl = menu;

    this._renderPrimary();

    document.body.appendChild(menu);

    // Keep the menu within the viewport.
    const rect = menu.getBoundingClientRect();
    const overflowX = rect.right - window.innerWidth;
    const overflowY = rect.bottom - window.innerHeight;
    if (overflowX > 0) menu.style.left = `${Math.max(4, this._clientX - overflowX - 4)}px`;
    if (overflowY > 0) menu.style.top = `${Math.max(4, this._clientY - overflowY - 4)}px`;

    document.addEventListener("click", () => this.close(), { signal });
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") this.close();
      },
      { signal },
    );
    document.addEventListener("scroll", () => this.close(), { signal, capture: true });
  }

  close() {
    if (this._menuEl) {
      this._menuEl.remove();
      this._menuEl = null;
    }
    this._abortController?.abort();
    this._abortController = null;
    if (MarkdownFormatContextMenu._active === this) {
      MarkdownFormatContextMenu._active = null;
    }
  }

  _lineStart(value, pos) {
    let start = pos;
    while (start > 0 && value[start - 1] !== "\n") start -= 1;
    return start;
  }

  _lineEnd(value, pos) {
    let end = pos;
    while (end < value.length && value[end] !== "\n") end += 1;
    return end;
  }

  _wordStart(value, pos) {
    let start = pos;
    while (start > 0 && /[\w-]/.test(value[start - 1])) start -= 1;
    return start;
  }

  _wordEnd(value, pos) {
    let end = pos;
    while (end < value.length && /[\w-]/.test(value[end])) end += 1;
    return end;
  }

  _inlineRange() {
    return {
      from: this._from === this._to ? this._wordFrom : this._from,
      to: this._from === this._to ? this._wordTo : this._to,
    };
  }

  _blockRange() {
    return { from: this._lineFrom, to: this._lineTo };
  }

  _isMarkerAt(value, i, marker) {
    if (value.slice(i, i + marker.length) !== marker) return false;
    // Reject markers that are part of a longer run (e.g. a single "*" inside "**").
    if (value[i - 1] === marker[0] || value[i + marker.length] === marker[0]) return false;
    return true;
  }

  _enclosingInlineRange(before, _after) {
    const { from, to } = this._inlineRange();
    if (this._from !== this._to) return { from, to };
    if (from === to) return { from, to };

    const value = this._value;
    const marker = before;
    const markerLen = marker.length;

    // Only look for markers on the current line so we do not accidentally
    // grab formatting from other text elsewhere in the slide.
    const positions = [];
    for (let i = this._lineFrom; i <= this._lineTo - markerLen; i++) {
      if (this._isMarkerAt(value, i, marker)) positions.push(i);
    }

    // Pair markers in order (opening/closing) and find the pair that
    // encloses the cursor/selection.
    for (let p = 0; p + 1 < positions.length; p += 2) {
      const open = positions[p];
      const close = positions[p + 1];
      const contentStart = open + markerLen;
      const contentEnd = close;
      if (from >= contentStart && to <= contentEnd) {
        return { from: contentStart, to: contentEnd };
      }
    }

    return { from, to };
  }

  _renderPrimary() {
    if (!this._menuEl) return;
    this._menuEl.innerHTML = "";

    if (this._items && this._items.length) {
      this._buildItems(this._items);
      return;
    }

    this._buildItems([
      { label: "Bold", action: () => this._toggleWrap("**", "**") },
      { label: "Italic", action: () => this._toggleWrap("*", "*") },
      { label: "Heading", action: () => this._renderHeadings(), more: true, closeMenu: false },
      { label: "More", action: () => this._renderMore(), more: true, closeMenu: false },
    ]);
  }

  _renderHeadings() {
    if (!this._menuEl) return;
    this._menuEl.innerHTML = "";

    this._buildItems([
      { label: "Back", action: () => this._renderPrimary(), back: true, closeMenu: false },
    ]);

    const divider = document.createElement("div");
    divider.className = "markdown-format-context-menu__divider";
    this._menuEl.appendChild(divider);

    this._buildItems([
      { label: "H1", action: () => this._toggleHeading(1) },
      { label: "H2", action: () => this._toggleHeading(2) },
      { label: "H3", action: () => this._toggleHeading(3) },
    ]);
  }

  _renderMore() {
    if (!this._menuEl) return;
    this._menuEl.innerHTML = "";

    this._buildItems([
      { label: "Back", action: () => this._renderPrimary(), back: true, closeMenu: false },
    ]);

    const divider = document.createElement("div");
    divider.className = "markdown-format-context-menu__divider";
    this._menuEl.appendChild(divider);

    this._buildItems([
      { label: "Inline code", action: () => this._toggleWrap("`", "`") },
      { label: "Bullet list", action: () => this._toggleBulletList() },
      { label: "Numbered list", action: () => this._toggleNumberedList() },
      { label: "Blockquote", action: () => this._toggleBlockquote() },
      { label: "Link", action: () => this._toggleLink() },
    ]);
  }

  _buildItems(items) {
    for (const item of items) {
      if (item.divider) {
        const divider = document.createElement("div");
        divider.className = "markdown-format-context-menu__divider";
        this._menuEl.appendChild(divider);
        continue;
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "markdown-format-context-menu__item";
      btn.setAttribute("role", "menuitem");

      const label = document.createElement("span");
      label.className = "markdown-format-context-menu__label";
      label.textContent = item.label;
      btn.appendChild(label);

      if (item.more || item.back) {
        const hint = document.createElement("span");
        hint.className = "markdown-format-context-menu__hint";
        hint.textContent = item.more ? "▶" : "◀";
        btn.appendChild(hint);
      }

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (item.closeMenu !== false) this.close();
        item.action();
      });

      this._menuEl.appendChild(btn);
    }
  }

  _toggleWrap(before, after) {
    const { from, to } = this._enclosingInlineRange(before, after);
    if (from === to) return;

    const beforeLen = before.length;
    const afterLen = after.length;
    const value = this._value;
    const selected = value.slice(from, to);

    // Selection already includes the markers (e.g. "**word**").
    if (
      selected.startsWith(before) &&
      selected.endsWith(after) &&
      !selected.startsWith(before + before) &&
      !selected.endsWith(after + after)
    ) {
      this._editor.replaceRange(from, to, selected.slice(beforeLen, selected.length - afterLen));
      return;
    }

    // Selection is inside markers (e.g. "word" in "**word**").
    const left = value.slice(from - beforeLen, from);
    const right = value.slice(to, to + afterLen);
    if (left === before && right === after) {
      this._editor.replaceRange(from - beforeLen, to + afterLen, selected);
      return;
    }

    this._editor.replaceRange(from, to, `${before}${selected}${after}`);
  }

  _toggleHeading(level) {
    const line = this._value.slice(this._lineFrom, this._lineTo);
    const match = line.match(/^(\s*)(#{1,6})\s+(.*)$/);
    const prefix = "#".repeat(level) + " ";
    if (match) {
      if (match[2].length === level) {
        this._editor.replaceRange(this._lineFrom, this._lineTo, `${match[1]}${match[3]}`);
      } else {
        this._editor.replaceRange(this._lineFrom, this._lineTo, `${match[1]}${prefix}${match[3]}`);
      }
    } else {
      this._editor.replaceRange(this._lineFrom, this._lineFrom, prefix);
    }
  }

  _toggleBulletList() {
    const { from, to } = this._blockRange();
    const text = this._value.slice(from, to);
    const lines = text.split("\n");
    const bulletRe = /^[-*+]\s+/;
    const already = lines.every((line) => line === "" || bulletRe.test(line));
    const newText = already
      ? lines.map((line) => line.replace(bulletRe, "")).join("\n")
      : lines.map((line) => (line ? `- ${line}` : line)).join("\n");
    this._editor.replaceRange(from, to, newText);
  }

  _toggleNumberedList() {
    const { from, to } = this._blockRange();
    const text = this._value.slice(from, to);
    const lines = text.split("\n");
    const numberRe = /^\s*\d+\.\s+/;
    const already = lines.every((line) => line === "" || numberRe.test(line));
    const newText = already
      ? lines.map((line) => line.replace(numberRe, "")).join("\n")
      : lines.map((line, i) => (line ? `${i + 1}. ${line}` : line)).join("\n");
    this._editor.replaceRange(from, to, newText);
  }

  _toggleBlockquote() {
    const { from, to } = this._blockRange();
    const text = this._value.slice(from, to);
    const lines = text.split("\n");
    const quoteRe = /^>\s+/;
    const already = lines.every((line) => line === "" || quoteRe.test(line));
    const newText = already
      ? lines.map((line) => line.replace(quoteRe, "")).join("\n")
      : lines.map((line) => (line ? `> ${line}` : line)).join("\n");
    this._editor.replaceRange(from, to, newText);
  }

  _toggleLink() {
    const { from, to } = this._inlineRange();
    if (from === to) return;
    const selected = this._value.slice(from, to);
    const linkMatch = selected.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      this._editor.replaceRange(from, to, linkMatch[1]);
      return;
    }
    const url =
      typeof window !== "undefined" && window.prompt
        ? window.prompt("Enter URL:", "https://")
        : null;
    if (url === null) return;
    this._editor.replaceRange(from, to, `[${selected}](${url})`);
  }
}
