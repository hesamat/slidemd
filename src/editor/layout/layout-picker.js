/**
 * LayoutPicker
 * Manages the layout picker modal UI for selecting layouts in edit mode.
 * Handles modal display, grid rendering, and user interactions.
 */

import { LayoutData } from "../../data/layout-data.js";
import { LayoutParser } from "../../data/layout-parser.js";

export class LayoutPicker {
  static modal = null;
  static overlay = null;
  static closeBtn = null;
  static grid = null;
  static customForm = null;
  static onSelectCallback = null;

  /**
   * Initialize the layout picker modal
   */
  static initModal() {
    this.modal = document.getElementById("layoutPickerModal");
    this.overlay = document.getElementById("layoutPickerOverlay");
    this.closeBtn = document.getElementById("closeLayoutPickerBtn");
    this.grid = document.getElementById("layoutPickerGrid");

    if (!this.modal || !this.grid) {
      return;
    }

    // Close modal handlers
    const closeModal = () => {
      this.hide();
    };

    this.overlay?.addEventListener("click", closeModal);
    this.closeBtn?.addEventListener("click", closeModal);

    // Close on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this.modal.classList.contains("webdeck-hidden")) {
        closeModal();
      }
    });

    this._buildCustomForm();
    this.renderGrid();
  }

  /**
   * Build the custom layout creation form and insert it into the modal body.
   */
  static _buildCustomForm() {
    const body = this.modal?.querySelector(".modal__body");
    if (!body || body.querySelector("#layoutPickerCustomForm")) {
      return;
    }

    const form = document.createElement("div");
    form.id = "layoutPickerCustomForm";
    form.className = "layout-picker-custom-form webdeck-hidden";
    form.innerHTML = `
      <div class="layout-picker-custom-form__fields">
        <label class="layout-picker-custom-form__label">
          <span>Layout name</span>
          <input type="text" id="customLayoutName" class="layout-picker-custom-form__input" placeholder="e.g. my-2x2" autocomplete="off">
        </label>
        <label class="layout-picker-custom-form__label">
          <span>Grid template</span>
          <textarea id="customLayoutGrid" class="layout-picker-custom-form__input" rows="2" placeholder='"header header" "main media" / 1fr 1fr'></textarea>
        </label>
        <div class="layout-picker-custom-form__preview" aria-live="polite">
          <div class="layout-option__preview" id="customLayoutPreview" style=""></div>
          <p class="layout-picker-custom-form__hint">
            Use quoted area names like <code>"header header"</code>,
            followed by columns after <code>/</code>.
          </p>
        </div>
      </div>
      <div class="layout-picker-custom-form__actions">
        <button type="button" id="saveCustomLayoutBtn" class="btn btn--primary">Save & Use</button>
        <button type="button" id="cancelCustomLayoutBtn" class="btn">Cancel</button>
      </div>
    `;

    body.appendChild(form);
    this.customForm = form;

    const nameInput = form.querySelector("#customLayoutName");
    const gridInput = form.querySelector("#customLayoutGrid");
    const preview = form.querySelector("#customLayoutPreview");

    const updatePreview = () => {
      const grid = String(gridInput.value).trim();
      if (!grid) {
        preview.style = "";
        preview.innerHTML = "";
        return;
      }
      const parsed = LayoutParser.parse(grid);
      preview.style = this.getGridStyleForTemplate(grid);
      preview.innerHTML = parsed.orderedAreas
        .map((area) => `<div style="grid-area: ${area}"></div>`)
        .join("");
    };

    gridInput.addEventListener("input", updatePreview);
    nameInput.addEventListener("input", () => {
      nameInput.value = String(nameInput.value)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9_-]/g, "");
    });

    form.querySelector("#saveCustomLayoutBtn").addEventListener("click", () => {
      const name = String(nameInput.value).trim().toLowerCase();
      const grid = String(gridInput.value).trim();
      nameInput.setCustomValidity("");
      if (!name || !grid) return;

      if (LayoutData.isBuiltIn(name)) {
        nameInput.setCustomValidity("A built-in preset with that name already exists.");
        nameInput.reportValidity();
        return;
      }

      const parsed = LayoutParser.parse(grid);
      if (parsed.orderedAreas.length === 0) return;

      if (!LayoutData.setCustomLayout(name, grid)) {
        nameInput.setCustomValidity("Could not save layout.");
        nameInput.reportValidity();
        return;
      }

      this._hideCustomForm();
      this.renderGrid();
      this.selectLayout(name);
    });

    form.querySelector("#cancelCustomLayoutBtn").addEventListener("click", () => {
      this._hideCustomForm();
    });
  }

  /**
   * Show the custom layout form.
   */
  static _showCustomForm() {
    this.customForm?.classList.remove("webdeck-hidden");
    const nameInput = this.customForm?.querySelector("#customLayoutName");
    this._clearCustomForm();
    nameInput?.focus();
  }

  /**
   * Hide the custom layout form.
   */
  static _hideCustomForm() {
    this.customForm?.classList.add("webdeck-hidden");
  }

  /**
   * Clear the custom layout form fields and preview.
   */
  static _clearCustomForm() {
    const nameInput = this.customForm?.querySelector("#customLayoutName");
    const gridInput = this.customForm?.querySelector("#customLayoutGrid");
    const preview = this.customForm?.querySelector("#customLayoutPreview");
    if (nameInput) nameInput.value = "";
    if (gridInput) gridInput.value = "";
    if (preview) {
      preview.style = "";
      preview.innerHTML = "";
    }
  }

  /**
   * Render the layout options grid
   */
  static renderGrid() {
    if (!this.grid) {
      return;
    }

    const layouts = LayoutData.getAllLayouts();

    this.grid.innerHTML = layouts
      .map((layout) => this._renderOption(layout))
      .concat(this._renderCustomOption())
      .join("");

    // Add click handlers to layout options
    const options = this.grid.querySelectorAll(".layout-option");

    options.forEach((option) => {
      option.addEventListener("click", (e) => {
        e.stopPropagation();
        const layout = option.dataset.layout;
        if (layout === "__custom__") {
          this._showCustomForm();
        } else {
          this.selectLayout(layout);
        }
      });

      // Keyboard navigation
      option.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const layout = option.dataset.layout;
          if (layout === "__custom__") {
            this._showCustomForm();
          } else {
            this.selectLayout(layout);
          }
        }
      });
    });
  }

  /**
   * Render a single layout option tile.
   */
  static _renderOption(layout) {
    const description = LayoutData.getDescription(layout);
    const preview = LayoutData.getPreviewHTML(layout);
    const formattedName = LayoutData.formatLayoutName(layout);
    const gridStyle = this.getGridTemplateStyle(layout);
    const areas = LayoutData.getAreaNames(layout);
    const areasMarkup = areas
      .map(
        (area) => `
                <span class="layout-option__area">@${area}</span>
            `,
      )
      .join("");

    return `
                <div class="layout-option" data-layout="${layout}" tabindex="0" role="button" aria-label="Select ${layout} layout">
                    <div class="layout-option__preview" style="${gridStyle}">
                        ${preview}
                    </div>
                    <div class="layout-option__name">${formattedName}</div>
                    <div class="layout-option__description">${description}</div>
                    <div class="layout-option__areas" aria-hidden="true">
                        ${areasMarkup}
                    </div>
                </div>
            `;
  }

  /**
   * Render the "Custom" creation tile.
   */
  static _renderCustomOption() {
    return `
      <div class="layout-option layout-option--custom" data-layout="__custom__" tabindex="0" role="button" aria-label="Create a custom layout">
        <div class="layout-option__preview layout-option__preview--custom">
          <span class="layout-option__custom-icon">+</span>
        </div>
        <div class="layout-option__name">Custom</div>
        <div class="layout-option__description">Define your own grid</div>
      </div>
    `;
  }

  /**
   * Show the layout picker modal
   * @param {Function} onSelectCallback - Callback function called with selected layout name
   */
  static show(onSelectCallback) {
    if (!this.modal) {
      this.initModal();
    }

    this.onSelectCallback = onSelectCallback;
    this.modal.classList.remove("webdeck-hidden");
    this._hideCustomForm();

    // Focus first layout option
    const firstOption = this.modal?.querySelector(".layout-option");
    firstOption?.focus();
  }

  /**
   * Hide the layout picker modal
   */
  static hide() {
    if (this.modal) {
      this.modal.classList.add("webdeck-hidden");
    }
    this._hideCustomForm();
    this.onSelectCallback = null;
  }

  /**
   * Get grid template style for preview rendering for a named layout.
   */
  static getGridTemplateStyle(layoutName) {
    const gridTemplate = LayoutData.getGridTemplate(layoutName);
    if (!gridTemplate) return "";
    return this.getGridStyleForTemplate(gridTemplate);
  }

  /**
   * Build a CSS grid shorthand style string for a raw grid template spec.
   * Used for both preset previews and the custom layout live preview.
   */
  static getGridStyleForTemplate(gridTemplate) {
    if (!gridTemplate || !gridTemplate.includes("/")) {
      return `grid: ${gridTemplate.replace(/"/g, "'")};`;
    }

    const parsed = LayoutParser.parse(gridTemplate, { fallbackAreas: ["main"] });
    let cols = parsed.gridTemplateColumns;

    // Scale down fixed pixel widths for previews (e.g., 300px -> 60px)
    cols = cols.replace(/(\d+)px/g, (_, pixels) => {
      const scaled = Math.round(parseInt(pixels) / 5);
      return `${scaled}px`;
    });

    // Use single quotes inside the HTML style attribute for compatibility.
    const areas = parsed.gridTemplateAreas.replace(/"/g, "'");

    return `grid: ${areas} ${parsed.gridTemplateRows} / ${cols};`;
  }

  /**
   * Select a layout and call the callback
   */
  static selectLayout(layoutName) {
    // Call callback BEFORE hiding, since hide() clears the callback
    if (this.onSelectCallback) {
      this.onSelectCallback(layoutName);
    }
    this.hide();
  }
}
