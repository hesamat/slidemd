/**
 * SlideSearch
 *
 * Full-text search across slide titles, body content, and speaker notes.
 * Provides an interactive modal that lets the presenter jump to matching slides.
 */

import { MarkdownParser } from "../data/markdown-parser.js";
import { escapeHtml, safeString } from "../core/utils.js";
import { modalOpened, modalClosed } from "../core/modal-state.js";

const SEARCH_DELAY_MS = 100;
const MAX_SNIPPET_LENGTH = 120;

/**
 * @typedef {Object} SlideSearchResult
 * @property {number} index - 0-based slide index.
 * @property {string} title - Slide title.
 * @property {string} snippet - Plain-text preview snippet for the result.
 * @property {string[]} matchedFields - Fields where the query matched (title, notes, body).
 * @property {number} score - Match score for ranking.
 * @property {boolean} isCurrent - Whether this is the current slide.
 * @property {boolean} isHidden - Whether the slide is hidden.
 */

export class SlideSearch {
  /**
   * @param {object} opts
   * @param {() => import('../types.js').Deck} opts.getDeck - Returns the current deck.
   * @param {(index: number) => void} opts.onSelect - Navigate to the selected slide.
   * @param {() => number} [opts.getCurrentIndex] - Returns the current slide index.
   * @param {() => boolean} [opts.isEditMode] - Returns true if edit mode is active.
   */
  constructor({ getDeck, onSelect, getCurrentIndex, isEditMode }) {
    this._getDeck = getDeck;
    this._onSelect = onSelect;
    this._getCurrentIndex = getCurrentIndex || (() => 0);
    this._isEditMode = isEditMode || (() => false);

    this._modal = null;
    this._input = null;
    this._list = null;
    this._emptyEl = null;
    this._index = null;
    this._results = [];
    this._selectedResultIndex = -1;
    this._searchTimeout = null;
    this._boundKeydown = null;
    this._boundDocumentKeydown = null;
  }

  /**
   * Build the search index from the current deck.
   * @returns {Array<{index: number, title: string, notes: string, bodyText: string}>}
   * @private
   */
  _buildIndex() {
    const deck = this._getDeck();
    const slides = deck?.slides || [];
    const includeHidden = this._isEditMode();

    return slides
      .map((slide, index) => ({ slide, index }))
      .filter(({ slide }) => includeHidden || !slide.hidden)
      .map(({ slide, index }) => ({
        index,
        title: safeString(slide.title),
        titleLower: safeString(slide.title).toLowerCase(),
        notes: MarkdownParser.stripFormatting(safeString(slide.notes)),
        notesLower: MarkdownParser.stripFormatting(safeString(slide.notes)).toLowerCase(),
        bodyText: this._getBodyText(slide),
        bodyLower: this._getBodyText(slide).toLowerCase(),
        isHidden: !!slide.hidden,
      }));
  }

  /**
   * Convert a slide's rendered area HTML to a single plain-text body string.
   * @param {import('../types.js').Slide} slide
   * @returns {string}
   * @private
   */
  _getBodyText(slide) {
    const areas = slide?.areas || {};
    const parts = Object.values(areas)
      .map((html) => this._htmlToPlainText(html))
      .filter(Boolean);
    if (!parts.length) return "";
    return parts.join("\n").replace(/\s+/g, " ").trim();
  }

  /**
   * Strip HTML tags and decode entities to plain text.
   * Uses DOMParser in the browser and a regex fallback in other environments.
   * @param {string} html
   * @returns {string}
   * @private
   */
  _htmlToPlainText(html) {
    const s = safeString(html).trim();
    if (!s) return "";

    if (typeof DOMParser !== "undefined") {
      try {
        const doc = new DOMParser().parseFromString(s, "text/html");
        return (doc.body?.textContent || "").replace(/\s+/g, " ").trim();
      } catch {
        // fall through to regex fallback
      }
    }

    return this._fallbackHtmlToPlainText(s);
  }

  /**
   * Regex-based HTML-to-text fallback for non-browser environments.
   * @param {string} html
   * @returns {string}
   * @private
   */
  _fallbackHtmlToPlainText(html) {
    let text = html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ");
    text = this._decodeHtmlEntities(text);
    return text.replace(/\s+/g, " ").trim();
  }

  /**
   * Decode common HTML entities for the regex fallback.
   * @param {string} text
   * @returns {string}
   * @private
   */
  _decodeHtmlEntities(text) {
    const named = {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: '"',
      apos: "'",
      nbsp: " ",
      ndash: "–",
      mdash: "—",
      ldquo: '"',
      rdquo: '"',
      lsquo: "'",
      rsquo: "'",
      hellip: "…",
    };
    return text
      .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (match, name) => named[name.toLowerCase()] || match)
      .replace(/&#(\d+);/g, (match, code) => {
        const n = parseInt(code, 10);
        return Number.isNaN(n) ? match : String.fromCharCode(n);
      })
      .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
        const n = parseInt(hex, 16);
        return Number.isNaN(n) ? match : String.fromCharCode(n);
      });
  }

  /**
   * Search the deck and return ranked results.
   * @param {string} query
   * @returns {SlideSearchResult[]}
   */
  search(query) {
    if (!this._index) {
      this._index = this._buildIndex();
    }

    const q = safeString(query).trim();
    const terms = q ? q.toLowerCase().split(/\s+/).filter(Boolean) : [];

    if (!terms.length) {
      return this._index.map((entry) => ({
        index: entry.index,
        title: entry.title,
        snippet: this._truncate(entry.bodyText, MAX_SNIPPET_LENGTH),
        matchedFields: [],
        score: 0,
        isCurrent: entry.index === this._getCurrentIndex(),
        isHidden: entry.isHidden,
      }));
    }

    const results = [];
    for (const entry of this._index) {
      const combined = `${entry.titleLower}\n${entry.notesLower}\n${entry.bodyLower}`;
      if (!terms.every((term) => combined.includes(term))) continue;

      const matchedFields = [];
      if (terms.every((term) => entry.titleLower.includes(term))) matchedFields.push("title");
      if (terms.every((term) => entry.notesLower.includes(term))) matchedFields.push("notes");
      if (terms.every((term) => entry.bodyLower.includes(term))) matchedFields.push("body");

      let score = 0;
      if (matchedFields.length === 0) {
        // Terms are spread across fields; still a valid match.
        if (terms.some((term) => entry.titleLower.includes(term))) matchedFields.push("title");
        if (terms.some((term) => entry.notesLower.includes(term))) matchedFields.push("notes");
        if (terms.some((term) => entry.bodyLower.includes(term))) matchedFields.push("body");
        score = 1;
      } else {
        if (matchedFields.includes("title")) score += 10;
        if (matchedFields.includes("notes")) score += 4;
        if (matchedFields.includes("body")) score += 1;
      }

      const snippet = this._buildSnippet(entry, terms);
      results.push({
        index: entry.index,
        title: entry.title,
        snippet,
        matchedFields,
        score,
        isCurrent: entry.index === this._getCurrentIndex(),
        isHidden: entry.isHidden,
      });
    }

    results.sort((a, b) => b.score - a.score || a.index - b.index);
    return results;
  }

  /**
   * Build a readable snippet around the first matching term.
   * @param {object} entry
   * @param {string[]} terms
   * @returns {string}
   * @private
   */
  _buildSnippet(entry, terms) {
    const bodyPos = this._firstMatchPosition(entry.bodyLower, terms);
    if (bodyPos) {
      return this._extractContext(
        entry.bodyText,
        bodyPos.index,
        bodyPos.length,
        MAX_SNIPPET_LENGTH,
      );
    }

    const notesPos = this._firstMatchPosition(entry.notesLower, terms);
    if (notesPos) {
      return this._extractContext(entry.notes, notesPos.index, notesPos.length, MAX_SNIPPET_LENGTH);
    }

    const titlePos = this._firstMatchPosition(entry.titleLower, terms);
    if (titlePos) {
      return this._extractContext(entry.title, titlePos.index, titlePos.length, MAX_SNIPPET_LENGTH);
    }

    return this._truncate(entry.bodyText, MAX_SNIPPET_LENGTH);
  }

  /**
   * Find the earliest occurrence of any term in a text.
   * @param {string} textLower
   * @param {string[]} terms
   * @returns {{index: number, length: number}|null}
   * @private
   */
  _firstMatchPosition(textLower, terms) {
    let best = null;
    for (const term of terms) {
      const idx = textLower.indexOf(term);
      if (idx !== -1 && (best === null || idx < best.index)) {
        best = { index: idx, length: term.length };
      }
    }
    return best;
  }

  /**
   * Extract a context window around a match.
   * @param {string} text
   * @param {number} start
   * @param {number} length
   * @param {number} maxLength
   * @returns {string}
   * @private
   */
  _extractContext(text, start, length, maxLength) {
    if (!text) return "";
    const radius = Math.max(20, Math.floor((maxLength - length) / 2));
    let from = Math.max(0, start - radius);
    let to = Math.min(text.length, start + length + radius);

    // Shift window to avoid truncating the match if near boundaries.
    if (to - from < maxLength) {
      if (from === 0) to = Math.min(text.length, from + maxLength);
      if (to === text.length) from = Math.max(0, to - maxLength);
    }

    let snippet = text.slice(from, to);
    if (from > 0) snippet = `…${snippet}`;
    if (to < text.length) snippet = `${snippet}…`;
    return snippet.trim();
  }

  /**
   * Truncate text to a maximum length with ellipsis.
   * @param {string} text
   * @param {number} maxLength
   * @returns {string}
   * @private
   */
  _truncate(text, maxLength) {
    if (!text || text.length <= maxLength) return text || "";
    return `${text.slice(0, maxLength - 1).trim()}…`;
  }

  /**
   * Highlight matching query terms in a plain-text snippet.
   * @param {string} text
   * @param {string[]} terms
   * @returns {string}
   * @private
   */
  _highlightTerms(text, terms) {
    if (!terms.length) return escapeHtml(text);

    const escapedTerms = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const regex = new RegExp(`(${escapedTerms.join("|")})`, "gi");

    let result = "";
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index === regex.lastIndex) {
        regex.lastIndex++;
        continue;
      }
      result += escapeHtml(text.slice(lastIndex, match.index));
      result += `<mark class="slide-search__mark">${escapeHtml(match[1])}</mark>`;
      lastIndex = match.index + match[1].length;
    }

    result += escapeHtml(text.slice(lastIndex));
    return result;
  }

  /**
   * Open the search modal.
   */
  open() {
    if (this._modal) {
      this._input?.focus();
      return;
    }

    this._index = this._buildIndex();
    this._modal = this._createModal();

    const fullscreenElement = document.fullscreenElement;
    const targetParent = fullscreenElement || document.body;
    targetParent.appendChild(this._modal);
    modalOpened();

    this._boundKeydown = (e) => this._handleModalKeydown(e);
    this._boundDocumentKeydown = (e) => this._handleDocumentKeydown(e);

    this._input?.addEventListener("keydown", this._boundKeydown);
    this._list?.addEventListener("click", (e) => this._handleResultClick(e));
    this._list?.addEventListener("keydown", (e) => this._handleResultKeydown(e));
    document.addEventListener("keydown", this._boundDocumentKeydown);

    this._renderResults("");
    this._input?.focus();
  }

  /**
   * Close the search modal and clean up.
   */
  close() {
    if (!this._modal) return;

    if (this._searchTimeout) {
      clearTimeout(this._searchTimeout);
      this._searchTimeout = null;
    }

    if (this._boundKeydown && this._input) {
      this._input.removeEventListener("keydown", this._boundKeydown);
    }

    if (this._boundDocumentKeydown) {
      document.removeEventListener("keydown", this._boundDocumentKeydown);
    }

    this._modal?.remove();
    modalClosed();
    this._modal = null;
    this._input = null;
    this._list = null;
    this._emptyEl = null;
    this._results = [];
    this._selectedResultIndex = -1;
    this._index = null;
    this._boundKeydown = null;
    this._boundDocumentKeydown = null;
  }

  /**
   * Create the search modal DOM.
   * @returns {HTMLElement}
   * @private
   */
  _createModal() {
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "slide-search-modal";

    const overlay = document.createElement("div");
    overlay.className = "modal__overlay";
    overlay.addEventListener("click", () => this.close());

    const dialog = document.createElement("div");
    dialog.className = "modal__dialog modal__dialog--slide-search";

    const header = document.createElement("div");
    header.className = "modal__header";

    const title = document.createElement("h2");
    title.className = "modal__title";
    title.textContent = "Search Slides";

    const closeBtn = document.createElement("button");
    closeBtn.className = "modal__close";
    closeBtn.innerHTML = "&times;";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.addEventListener("click", () => this.close());

    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "modal__body";

    const input = document.createElement("input");
    input.className = "slide-search__input";
    input.type = "text";
    input.placeholder = "Search titles, content, and notes…";
    input.setAttribute("autocomplete", "off");
    input.setAttribute("aria-label", "Search slides");

    input.addEventListener("input", () => {
      if (this._searchTimeout) clearTimeout(this._searchTimeout);
      this._searchTimeout = setTimeout(() => {
        this._searchTimeout = null;
        this._renderResults(input.value);
      }, SEARCH_DELAY_MS);
    });

    const list = document.createElement("div");
    list.className = "slide-search__list";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Search results");

    const empty = document.createElement("div");
    empty.className = "slide-search__empty slide-search__empty--hidden";
    empty.textContent = "No slides match your search.";

    body.appendChild(input);
    body.appendChild(list);
    body.appendChild(empty);

    dialog.appendChild(header);
    dialog.appendChild(body);

    modal.appendChild(overlay);
    modal.appendChild(dialog);

    this._input = input;
    this._list = list;
    this._emptyEl = empty;

    return modal;
  }

  /**
   * Render search results for the given query.
   * @param {string} query
   * @private
   */
  _renderResults(query) {
    this._results = this.search(query);
    this._selectedResultIndex = this._results.length > 0 ? 0 : -1;

    this._list.innerHTML = "";

    if (this._results.length === 0) {
      this._emptyEl.classList.remove("slide-search__empty--hidden");
      if (!query.trim()) this._emptyEl.textContent = "Start typing to search.";
      else this._emptyEl.textContent = "No slides match your search.";
      return;
    }

    this._emptyEl.classList.add("slide-search__empty--hidden");

    const q = safeString(query).trim();
    const terms = q ? q.toLowerCase().split(/\s+/).filter(Boolean) : [];

    for (let i = 0; i < this._results.length; i++) {
      const result = this._results[i];
      const item = this._createResultItem(result, terms, i);
      this._list.appendChild(item);
    }

    this._updateSelection();
  }

  /**
   * Create a single result item element.
   * @param {SlideSearchResult} result
   * @param {string[]} terms
   * @param {number} listIndex
   * @returns {HTMLElement}
   * @private
   */
  _createResultItem(result, terms, listIndex) {
    const item = document.createElement("div");
    item.className = "slide-search__item";
    item.setAttribute("role", "option");
    item.setAttribute("tabindex", "0");
    item.setAttribute("data-index", String(listIndex));
    if (result.isCurrent) item.classList.add("current");
    if (result.isHidden) item.classList.add("hidden");

    const number = document.createElement("div");
    number.className = "slide-search__number";
    number.textContent = result.index + 1;

    const content = document.createElement("div");
    content.className = "slide-search__content";

    const title = document.createElement("div");
    title.className = "slide-search__title";
    title.innerHTML = this._highlightTerms(result.title, terms);

    const meta = document.createElement("div");
    meta.className = "slide-search__meta";
    meta.textContent = this._formatMatchedFields(result.matchedFields);

    const snippet = document.createElement("div");
    snippet.className = "slide-search__snippet";
    snippet.innerHTML = this._highlightTerms(result.snippet, terms);

    content.appendChild(title);
    if (result.matchedFields.length) content.appendChild(meta);
    content.appendChild(snippet);

    const badges = document.createElement("div");
    badges.className = "slide-search__badges";
    if (result.isCurrent) {
      const currentBadge = document.createElement("span");
      currentBadge.className = "slide-search__badge slide-search__badge--current";
      currentBadge.textContent = "Current";
      badges.appendChild(currentBadge);
    } else if (result.isHidden) {
      const hiddenBadge = document.createElement("span");
      hiddenBadge.className = "slide-search__badge slide-search__badge--hidden";
      hiddenBadge.textContent = "Hidden";
      badges.appendChild(hiddenBadge);
    }

    item.appendChild(number);
    item.appendChild(content);
    item.appendChild(badges);

    item.addEventListener("click", () => this._activateResult(listIndex));

    return item;
  }

  /**
   * Format matched fields as a human-readable label.
   * @param {string[]} fields
   * @returns {string}
   * @private
   */
  _formatMatchedFields(fields) {
    if (!fields.length) return "";
    const labels = fields.map((f) => {
      if (f === "title") return "title";
      if (f === "notes") return "notes";
      if (f === "body") return "content";
      return f;
    });
    return `Match in ${labels.join(", ")}`;
  }

  /**
   * Move the visual selection to the given result.
   * @param {number} listIndex
   * @private
   */
  _selectResult(listIndex) {
    if (listIndex < 0 || listIndex >= this._results.length) return;
    this._selectedResultIndex = listIndex;
    this._updateSelection();
  }

  /**
   * Update the selected result classes and scroll it into view.
   * @private
   */
  _updateSelection() {
    const items = this._list.querySelectorAll(".slide-search__item");
    items.forEach((item, i) => {
      const isSelected = i === this._selectedResultIndex;
      item.classList.toggle("selected", isSelected);
      item.setAttribute("aria-selected", isSelected ? "true" : "false");
      if (isSelected && typeof item.scrollIntoView === "function") {
        item.scrollIntoView({ block: "nearest" });
      }
    });
  }

  /**
   * Jump to the selected result and close the modal.
   * @param {number} listIndex
   * @private
   */
  _activateResult(listIndex) {
    const result = this._results[listIndex];
    if (!result) return;
    this._onSelect(result.index);
    this.close();
  }

  /**
   * Handle keyboard events inside the search input.
   * @param {KeyboardEvent} e
   * @private
   */
  _handleModalKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      this.close();
      return;
    }

    if (this._results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      this._selectResult((this._selectedResultIndex + 1) % this._results.length);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      this._selectResult(
        (this._selectedResultIndex - 1 + this._results.length) % this._results.length,
      );
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (this._searchTimeout) {
        clearTimeout(this._searchTimeout);
        this._searchTimeout = null;
        this._renderResults(this._input.value);
      }
      if (this._selectedResultIndex >= 0) {
        this._activateResult(this._selectedResultIndex);
      } else if (this._results.length > 0) {
        this._activateResult(0);
      }
    }
  }

  /**
   * Close the modal on Escape at the document level when the modal is open.
   * @param {KeyboardEvent} e
   * @private
   */
  _handleDocumentKeydown(e) {
    if (e.key === "Escape" && this._modal) {
      this.close();
    }
  }

  /**
   * Handle click events on the result list.
   * @param {MouseEvent} e
   * @private
   */
  _handleResultClick(e) {
    const item = e.target.closest(".slide-search__item");
    if (!item) return;
    const index = parseInt(item.getAttribute("data-index"), 10);
    if (!Number.isNaN(index)) {
      this._activateResult(index);
    }
  }

  /**
   * Handle keyboard events on a focused result item.
   * @param {KeyboardEvent} e
   * @private
   */
  _handleResultKeydown(e) {
    const item = e.target.closest(".slide-search__item");
    if (!item) return;
    const index = parseInt(item.getAttribute("data-index"), 10);
    if (Number.isNaN(index)) return;

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      this._activateResult(index);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      const nextIndex = (index + 1) % this._results.length;
      this._selectResult(nextIndex);
      this._focusResult(nextIndex);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      const nextIndex = (index - 1 + this._results.length) % this._results.length;
      this._selectResult(nextIndex);
      this._focusResult(nextIndex);
    }
  }

  /**
   * Move keyboard focus to the result at the given list index.
   * @param {number} listIndex
   * @private
   */
  _focusResult(listIndex) {
    const items = this._list?.querySelectorAll(".slide-search__item");
    items?.[listIndex]?.focus();
  }
}
