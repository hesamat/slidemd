/**
 * SlideThumbnails
 * Manages the slide thumbnails sidebar in the editor.
 * Renders thumbnails of all slides and handles navigation via thumbnail clicks,
 * right-click context menu, and the pinned "Add Slide" footer button.
 */

// Touch long-press: how long (in ms) the user must hold a thumbnail
// before the context menu opens, and how long the optional haptic
// pulse lasts.  Both are well above the OS double-tap threshold
// (≈ 300 ms) and well below the "press and hold to drag" threshold
// on most tablets, so they sit in the dead zone between the two.
const LONG_PRESS_MS = 650;
const LONG_PRESS_HAPTIC_MS = 10;

export class SlideThumbnails {
  constructor(deck, controller, elements) {
    this._deck = deck;
    this._controller = controller;
    this._elements = elements;
    this._container = null;
    this._currentIndex = 0;
    this._contextMenu = null;

    this.init();
  }

  init() {
    this._container = document.getElementById("slideThumbnails");
    if (!this._container) return;

    // Cache the add-slide button (last child of the list) so we can
    // keep it in place when the thumbnails are re-rendered.
    this._addBtn = this._container.querySelector(".slide-thumbnails__add-btn");

    // Listen for slide changes to update current thumbnail highlight
    this._controller.addEventListener("slidechange", () => this.updateCurrentSlide());

    // Listen for deck changes to update our deck reference and re-render
    this._controller.addEventListener("deckchange", (data) => {
      this._deck = data.deck;
      this.render();
    });

    this._contextMenu = new SlideContextMenu(this);
    this._contextMenu.init();

    this._bindAddSlideFooter();
  }

  /**
   * Render all slide thumbnails.  The add-slide button is the last child
   * of the list and is preserved across renders so it always appears at
   * the end of the thumbnail list.
   */
  render() {
    if (!this._container) return;

    // Remove only the dynamically-generated thumbnails; keep the
    // add-slide button (and any other static children) intact.
    // We also clear any pending long-press timers on the old
    // thumbnails so a touch in progress doesn't fire a callback
    // bound to a now-stale element/index.
    Array.from(this._container.querySelectorAll(".slide-thumbnail")).forEach((node) => {
      const pending = node.dataset?.longPressTimer;
      if (pending) {
        window.clearTimeout(Number(pending));
        delete node.dataset.longPressTimer;
      }
      node.remove();
    });

    this._deck.slides.forEach((slide, index) => {
      const thumbnail = this.createThumbnail(slide, index);
      // Insert before the add button so it always ends up at the end
      // of the visible list (and after the most recent slide).
      if (this._addBtn && this._addBtn.parentNode === this._container) {
        this._container.insertBefore(thumbnail, this._addBtn);
      } else {
        this._container.appendChild(thumbnail);
      }
    });

    this.updateCurrentSlide();
  }

  /**
   * Create a single thumbnail element
   */
  createThumbnail(slide, index) {
    const thumbnail = document.createElement("div");
    thumbnail.className = "slide-thumbnail";
    thumbnail.dataset.slideIndex = String(index);
    thumbnail.setAttribute("role", "button");
    thumbnail.setAttribute("aria-label", `Go to slide ${index + 1}`);
    thumbnail.setAttribute("tabindex", "0");
    thumbnail.title = "Right-click for options";

    // Slide number
    const number = document.createElement("div");
    number.className = "slide-thumbnail__number";
    number.textContent = String(index + 1);

    // Slide title
    const title = document.createElement("div");
    title.className = "slide-thumbnail__title";
    title.textContent = this._stripMarkdown(slide.title || `Slide ${index + 1}`);

    thumbnail.appendChild(number);
    thumbnail.appendChild(title);

    // Long-press support and the click-suppression flag are declared
    // here so the click handler below can see them.
    let longPressTriggered = false;

    // Click handler to navigate to slide.  Suppressed after a
    // long-press so the touchend that follows doesn't also navigate.
    thumbnail.addEventListener("click", () => {
      if (longPressTriggered) {
        longPressTriggered = false;
        return;
      }
      this._controller.slideNavigator.goTo(index);
    });

    // Right-click → open the slide context menu
    thumbnail.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this._controller.slideNavigator.goTo(index);
      this._contextMenu.open(e.clientX, e.clientY, index);
    });

    // Keyboard activation: Enter/Space → navigate, ContextMenu/Shift+F10 → open context menu
    thumbnail.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this._controller.slideNavigator.goTo(index);
      } else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
        e.preventDefault();
        this._controller.slideNavigator.goTo(index);
        const rect = thumbnail.getBoundingClientRect();
        this._contextMenu.open(rect.right, rect.bottom, index);
      }
    });

    // Long-press on touch devices opens the same context menu.  The
    // `contextmenu` event only fires for mouse/pen, so without this
    // tablet users would lose access to new/duplicate/delete.
    // The pending timer is stored on the element's dataset so
    // `render()` can cancel it when the thumbnail is removed; without
    // that, a re-render mid-touch would leave a callback firing
    // against a now-stale index.
    const startLongPress = (touch) => {
      longPressTriggered = false;
      const timer = window.setTimeout(() => {
        delete thumbnail.dataset.longPressTimer;
        longPressTriggered = true;
        this._controller.slideNavigator.goTo(index);
        this._contextMenu.open(touch.clientX, touch.clientY, index);
        if (navigator.vibrate) navigator.vibrate(LONG_PRESS_HAPTIC_MS);
      }, LONG_PRESS_MS);
      thumbnail.dataset.longPressTimer = String(timer);
    };
    const cancelLongPress = () => {
      const pending = thumbnail.dataset?.longPressTimer;
      if (pending) {
        window.clearTimeout(Number(pending));
        delete thumbnail.dataset.longPressTimer;
      }
    };
    thumbnail.addEventListener(
      "touchstart",
      (e) => {
        const touch = e.touches[0];
        if (touch) startLongPress(touch);
      },
      { passive: true },
    );
    thumbnail.addEventListener("touchend", cancelLongPress);
    thumbnail.addEventListener("touchmove", cancelLongPress);
    thumbnail.addEventListener("touchcancel", cancelLongPress);

    return thumbnail;
  }

  _stripMarkdown(text) {
    return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");
  }

  /**
   * Bind the pinned "Add Slide" footer button (below the scrollable list).
   */
  _bindAddSlideFooter() {
    const btn = this._elements.addSlideFooterBtn || document.getElementById("addSlideFooterBtn");
    if (!btn) return;
    btn.addEventListener("click", () => this._addNewSlide());
  }

  /**
   * Create a new slide via the edit controller's layout picker.
   * Used by the right-click menu ("New" → after this index) and the
   * footer "+ Add Slide" button (which appends to the end).
   * @param {number} [afterIndex] insert after this index.  When
   *   omitted, the new slide is appended to the end of the deck
   *   (the footer button's contract).
   */
  _addNewSlide(afterIndex) {
    const editController = window.__WEBDECK_EDIT_CONTROLLER__;
    if (!editController) {
      console.warn("Edit controller not available");
      return;
    }
    if (typeof afterIndex === "number") {
      this._controller.slideNavigator.goTo(afterIndex);
    } else {
      // Footer button: navigate to the last slide so the layout
      // picker (which inserts "after current") appends to the end.
      const lastIndex = Math.max(0, (this._deck?.slides?.length ?? 1) - 1);
      this._controller.slideNavigator.goTo(lastIndex);
    }
    editController.showLayoutPicker();
  }

  /**
   * Update the current slide highlight
   */
  updateCurrentSlide() {
    if (!this._container) return;

    const currentIndex = this._controller.slideNavigator.currentIndex;
    this._currentIndex = currentIndex;
    const thumbnails = this._container.querySelectorAll(".slide-thumbnail");

    thumbnails.forEach((thumbnail, index) => {
      if (index === currentIndex) {
        thumbnail.classList.add("current");
        thumbnail.setAttribute("aria-current", "true");
      } else {
        thumbnail.classList.remove("current");
        thumbnail.removeAttribute("aria-current");
      }
      // Action buttons (move up / down) are revealed via CSS when
      // the thumbnail is hovered or has the .current class — no JS
      // toggling required.
    });

    // Scroll current thumbnail into view
    const currentThumbnail = thumbnails[currentIndex];
    if (currentThumbnail && currentThumbnail.scrollIntoView) {
      currentThumbnail.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  /**
   * Update the title of a specific thumbnail
   */
  updateThumbnailTitle(index, title) {
    if (!this._container) return;

    const thumbnails = this._container.querySelectorAll(".slide-thumbnail");
    if (thumbnails[index]) {
      const titleEl = thumbnails[index].querySelector(".slide-thumbnail__title");
      if (titleEl) {
        titleEl.textContent = this._stripMarkdown(title || `Slide ${index + 1}`);
      }
    }
  }

  /**
   * Refresh thumbnails (call when slides are added/removed)
   */
  refresh() {
    this.render();
  }
}

/**
 * SlideContextMenu
 *
 * A minimal right-click context menu for slide thumbnails.  Rendered into
 * `document.body` on `open()` and removed on any outside click or Escape
 * keypress.  Lives in the same file as `SlideThumbnails` because it has
 * to call back into it for "New after this slide".
 */
class SlideContextMenu {
  constructor(thumbnails) {
    this._thumbnails = thumbnails;
    this._menuEl = null;
    this._index = -1;
  }

  init() {
    // Global handlers — close the menu on any outside click, scroll,
    // resize, or Escape.  Registered once at startup.
    document.addEventListener("click", () => this.close());
    document.addEventListener("scroll", () => this.close(), true);
    window.addEventListener("resize", () => this.close());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close();
    });
  }

  /**
   * Open the menu at (x, y) screen coordinates for the given slide index.
   * @param {number} clientX
   * @param {number} clientY
   * @param {number} index
   */
  open(clientX, clientY, index) {
    this.close();
    this._index = index;

    const menu = document.createElement("div");
    menu.className = "slide-context-menu";
    menu.setAttribute("role", "menu");
    menu.style.left = `${clientX}px`;
    menu.style.top = `${clientY}px`;

    const items = [
      { label: "New slide", kbd: "Alt+N", action: (index) => this._newAfter(index) },
      { label: "Duplicate slide", kbd: "Alt+D", action: () => this._duplicate() },
      { label: "Delete slide", kbd: "Alt+⌫", action: () => this._delete() },
    ];

    const totalSlides = this._thumbnails._deck.slides.length;
    if (index > 0) {
      items.splice(1, 0, {
        label: "Move up",
        kbd: "Alt+Shift+\u2191",
        action: () => this._moveUp(index),
      });
    }
    if (index < totalSlides - 1) {
      const insertAt = index > 0 ? 3 : 2;
      items.splice(insertAt, 0, {
        label: "Move down",
        kbd: "Alt+Shift+\u2193",
        action: () => this._moveDown(index),
      });
    }

    for (const item of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slide-context-menu__item";
      btn.setAttribute("role", "menuitem");
      btn.innerHTML = `
                <span class="slide-context-menu__label">${item.label}</span>
                <kbd class="slide-context-menu__hint">${item.kbd}</kbd>
            `;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        // Capture the slide index BEFORE close() resets it to -1;
        // otherwise the action receives -1 and the new slide is
        // inserted next to the wrong slide.
        const index = this._index;
        this.close();
        item.action(index);
      });
      menu.appendChild(btn);
    }

    document.body.appendChild(menu);
    this._menuEl = menu;

    // If the menu would overflow the viewport, shift it back into bounds.
    const rect = menu.getBoundingClientRect();
    const overflowX = rect.right - window.innerWidth;
    const overflowY = rect.bottom - window.innerHeight;
    if (overflowX > 0) menu.style.left = `${Math.max(4, clientX - overflowX - 4)}px`;
    if (overflowY > 0) menu.style.top = `${Math.max(4, clientY - overflowY - 4)}px`;
  }

  close() {
    if (this._menuEl) {
      this._menuEl.remove();
      this._menuEl = null;
      this._index = -1;
    }
  }

  _newAfter(index) {
    // Add a new slide immediately after the right-clicked slide.  The
    // layout picker (which inserts "after current") does the heavy
    // lifting; we just navigate to the target slide first.  The
    // `index` is captured by the click handler before close() runs,
    // so it's the real right-clicked slide index (not -1).
    this._thumbnails._addNewSlide(index);
  }

  _duplicate() {
    const editController = window.__WEBDECK_EDIT_CONTROLLER__;
    if (!editController) return;
    editController.duplicateSlide();
  }

  _delete() {
    const editController = window.__WEBDECK_EDIT_CONTROLLER__;
    if (!editController) return;
    editController.deleteSlide();
  }

  _moveUp(index) {
    const editController = window.__WEBDECK_EDIT_CONTROLLER__;
    if (!editController) return;
    this._thumbnails._controller.slideNavigator.goTo(index);
    setTimeout(() => {
      editController.moveSlideUp();
    }, 50);
  }

  _moveDown(index) {
    const editController = window.__WEBDECK_EDIT_CONTROLLER__;
    if (!editController) return;
    this._thumbnails._controller.slideNavigator.goTo(index);
    setTimeout(() => {
      editController.moveSlideDown();
    }, 50);
  }
}
