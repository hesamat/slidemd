/**
 * CommandPalette
 *
 * Quick-access modal for triggering actions via fuzzy search.
 */
import { escapeHtml } from "../core/utils.js";

const PALETTE_PREFIX = "command-palette";
const MAX_RESULTS = 50;

export class CommandPalette {
  /**
   * @param {object} opts
   * @param {Array<{id: string, name: string, shortcut?: string, keywords?: string[], category?: string, isAvailable?: () => boolean, isEnabled?: () => boolean, action: () => void}>} opts.commands
   */
  constructor({ commands = [] } = {}) {
    this._commands = commands;
    this._modal = null;
    this._input = null;
    this._list = null;
    this._empty = null;
    this._tabs = null;
    this._tabEls = {};
    this._category = "All";
    this._selectedIndex = 0;
    this._filtered = [];
  }

  open() {
    if (this._modal) {
      this._input?.focus();
      this._input?.select();
      return;
    }
    this._buildDom();
    const fullscreenElement = document.fullscreenElement;
    const targetParent = fullscreenElement || document.body;
    targetParent.appendChild(this._modal);
    this._input?.focus();
    this._input?.select();
    this._filter("");
  }

  close() {
    if (!this._modal) return;
    document.removeEventListener("keydown", this._trap);
    this._modal.remove();
    this._modal = null;
    this._input = null;
    this._list = null;
    this._empty = null;
    this._tabs = null;
    this._tabEls = {};
    this._category = "All";
    this._filtered = [];
  }

  _buildDom() {
    const p = PALETTE_PREFIX;
    this._modal = document.createElement("div");
    this._modal.className = `${p}__backdrop`;
    this._modal.setAttribute("role", "dialog");
    this._modal.setAttribute("aria-modal", "true");
    this._modal.setAttribute("aria-label", "Command palette");

    const dialog = document.createElement("div");
    dialog.className = `${p}__dialog`;
    dialog.addEventListener("click", (e) => e.stopPropagation());

    const header = document.createElement("div");
    header.className = `${p}__header`;
    const title = document.createElement("div");
    title.className = `${p}__title`;
    title.textContent = "Command Palette";
    const closeBtn = document.createElement("button");
    closeBtn.className = `${p}__close`;
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.innerHTML = "&times;";
    closeBtn.addEventListener("click", () => this.close());
    header.appendChild(title);
    header.appendChild(closeBtn);

    this._input = document.createElement("input");
    this._input.type = "text";
    this._input.className = `${p}__input`;
    this._input.placeholder = "Type a command or shortcut";
    this._input.setAttribute("aria-label", "Search commands");
    this._input.setAttribute("autocomplete", "off");
    this._input.addEventListener("input", () => this._filter(this._input.value));
    this._input.addEventListener("keydown", (e) => this._handleInputKeydown(e));

    this._tabs = this._buildTabs();

    this._list = document.createElement("div");
    this._list.className = `${p}__list`;
    this._list.setAttribute("role", "listbox");
    this._list.addEventListener("wheel", (e) => e.stopPropagation());

    this._empty = document.createElement("div");
    this._empty.className = `${p}__empty`;
    this._empty.textContent = "No matching commands";
    this._empty.classList.add(`${p}__empty--hidden`);

    dialog.appendChild(header);
    dialog.appendChild(this._input);
    dialog.appendChild(this._tabs);
    dialog.appendChild(this._list);
    dialog.appendChild(this._empty);
    this._modal.appendChild(dialog);

    this._modal.addEventListener("click", () => this.close());
    this._trap = (e) => this._handleDocumentKeydown(e);
    document.addEventListener("keydown", this._trap);
  }

  _buildTabs() {
    const p = PALETTE_PREFIX;
    const container = document.createElement("div");
    container.className = `${p}__tabs`;
    const categories = ["All"];
    const seen = new Set();
    for (const cmd of this._commands) {
      if (cmd.category && !seen.has(cmd.category)) {
        seen.add(cmd.category);
        categories.push(cmd.category);
      }
    }
    for (const cat of categories) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = `${p}__tab`;
      tab.textContent = cat;
      tab.dataset.category = cat;
      tab.addEventListener("click", () => this._selectCategory(cat));
      this._tabEls[cat] = tab;
      container.appendChild(tab);
    }
    return container;
  }

  _selectCategory(category) {
    this._category = category;
    this._updateTabSelection();
    this._filter(this._input?.value || "");
  }

  _updateTabSelection() {
    for (const [cat, el] of Object.entries(this._tabEls)) {
      el.classList.toggle("selected", cat === this._category);
      el.setAttribute("aria-selected", cat === this._category ? "true" : "false");
    }
  }

  _isEnabled(cmd) {
    return !cmd.isEnabled || cmd.isEnabled();
  }

  _filter(query) {
    const q = query.trim().toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    const available = this._commands.filter(
      (c) =>
        (!c.isAvailable || c.isAvailable()) &&
        (this._category === "All" || c.category === this._category),
    );
    if (!tokens.length) {
      this._filtered = available.slice(0, MAX_RESULTS);
    } else {
      this._filtered = available
        .map((c) => ({ c, score: this._score(c, tokens) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ c }) => c)
        .slice(0, MAX_RESULTS);
    }
    this._selectedIndex = 0;
    this._render();
  }

  _score(c, tokens) {
    const hay = [c.name, c.shortcut, c.category, ...(c.keywords || [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    let score = 0;
    for (const t of tokens) {
      const name = c.name.toLowerCase();
      const shortcut = (c.shortcut || "").toLowerCase();
      const category = (c.category || "").toLowerCase();
      if (name.startsWith(t)) score += 10;
      else if (name.includes(t)) score += 5;
      else if (shortcut.startsWith(t)) score += 4;
      else if (shortcut.includes(t)) score += 3;
      else if (category.includes(t)) score += 2;
      else if (hay.includes(t)) score += 1;
      else return 0;
    }
    return score;
  }

  _render() {
    this._updateTabSelection();
    if (!this._list) return;
    this._list.innerHTML = "";
    if (this._filtered.length === 0) {
      this._empty?.classList.remove(`${PALETTE_PREFIX}__empty--hidden`);
    } else {
      this._empty?.classList.add(`${PALETTE_PREFIX}__empty--hidden`);
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < this._filtered.length; i++) {
        const cmd = this._filtered[i];
        const enabled = this._isEnabled(cmd);
        const item = document.createElement("div");
        item.className = `${PALETTE_PREFIX}__item`;
        if (!enabled) item.classList.add("disabled");
        item.setAttribute("role", "option");
        item.setAttribute("tabindex", "-1");
        item.setAttribute("aria-selected", i === this._selectedIndex ? "true" : "false");
        item.setAttribute("aria-disabled", enabled ? "false" : "true");
        if (i === this._selectedIndex) item.classList.add("selected");
        item.addEventListener("click", () => this._activate(i));
        item.addEventListener("mouseenter", () => {
          this._selectedIndex = i;
          this._updateSelection();
        });

        const left = document.createElement("div");
        left.className = `${PALETTE_PREFIX}__left`;
        const name = document.createElement("div");
        name.className = `${PALETTE_PREFIX}__name`;
        name.innerHTML = this._highlight(cmd.name, this._queryTokens());
        left.appendChild(name);
        item.appendChild(left);

        if (cmd.shortcut) {
          const kbd = document.createElement("kbd");
          kbd.className = `${PALETTE_PREFIX}__shortcut`;
          kbd.textContent = cmd.shortcut;
          item.appendChild(kbd);
        }
        fragment.appendChild(item);
      }
      this._list.appendChild(fragment);
    }
    this._scrollSelectedIntoView();
  }

  _queryTokens() {
    const q = this._input?.value?.trim().toLowerCase() || "";
    return q.split(/\s+/).filter(Boolean);
  }

  _highlight(text, tokens) {
    if (!tokens.length) return escapeHtml(text);
    const pattern = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const regex = new RegExp(`(${pattern})`, "gi");
    let last = 0;
    let out = "";
    for (const match of text.matchAll(regex)) {
      out += escapeHtml(text.slice(last, match.index));
      out += `<mark class="${PALETTE_PREFIX}__mark">${escapeHtml(match[1])}</mark>`;
      last = match.index + match[1].length;
    }
    out += escapeHtml(text.slice(last));
    return out;
  }

  _handleInputKeydown(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      this.close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      this._selectNext();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      this._selectPrev();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      this._activate(this._selectedIndex);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      this._selectNext();
    }
  }

  _handleDocumentKeydown(e) {
    if (e.key === "Escape") this.close();
  }

  _selectNext() {
    if (this._filtered.length === 0) return;
    this._selectedIndex = (this._selectedIndex + 1) % this._filtered.length;
    this._updateSelection();
  }

  _selectPrev() {
    if (this._filtered.length === 0) return;
    this._selectedIndex = (this._selectedIndex - 1 + this._filtered.length) % this._filtered.length;
    this._updateSelection();
  }

  _updateSelection() {
    const items = this._list?.querySelectorAll(`.${PALETTE_PREFIX}__item`);
    items?.forEach((item, i) => {
      const isSelected = i === this._selectedIndex;
      item.classList.toggle("selected", isSelected);
      item.setAttribute("aria-selected", isSelected ? "true" : "false");
    });
    this._scrollSelectedIntoView();
  }

  _scrollSelectedIntoView() {
    const items = this._list?.querySelectorAll(`.${PALETTE_PREFIX}__item`);
    const selected = items?.[this._selectedIndex];
    if (selected && typeof selected.scrollIntoView === "function") {
      selected.scrollIntoView({ block: "nearest" });
    }
  }

  _activate(index) {
    const cmd = this._filtered[index];
    if (!cmd || !this._isEnabled(cmd)) return;
    this.close();
    try {
      cmd.action();
    } catch (e) {
      console.warn(`Command "${cmd.name}" failed:`, e);
    }
  }
}
