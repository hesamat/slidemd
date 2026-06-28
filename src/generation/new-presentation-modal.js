/**
 * New Presentation Modal — Stepper Wizard
 *
 * 3 steps: Template → Background → Styling
 * User can click "Create" on the first step to use all defaults.
 */

const COLOR_SWATCHES = [
  { name: "White", value: "#ffffff" },
  { name: "Slate", value: "#1e293b" },
  { name: "Ink", value: "#0f172a" },
  { name: "Sky", value: "#0ea5e9" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Pink", value: "#ec4899" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Lime", value: "#84cc16" },
  { name: "Emerald", value: "#10b981" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Sand", value: "#f5f5dc" },
  { name: "Paper", value: "#f8fafc" },
];

const TEMPLATES = [
  {
    id: "blank",
    name: "Blank",
    desc: "Empty title slide — start from scratch",
    markdown: `layout: title-slide

@title
# Presentation Title

## Subtitle or Tagline

**Author Name**
`,
  },
  {
    id: "standard",
    name: "Standard",
    desc: "Title, 2 content slides, summary, closing",
    markdown: `layout: title-slide

@title
# Presentation Title

## Subtitle or Tagline

**Author Name**

---

layout: header-content

@header
## Overview

@main
- Topic 1
- Topic 2
- Topic 3

---

layout: header-content

@header
## Key Points

@main
- Point A with explanation
- Point B with explanation

---

layout: header-content

@header
## Summary

@main
- Takeaway 1
- Takeaway 2

---

layout: title-slide

@title
# Thank You

Questions?
`,
  },
  {
    id: "lecture",
    name: "Lecture",
    desc: "Academic format: objectives, topics, recap",
    markdown: `layout: title-slide

@title
# Course Title

## Semester / Year

---

layout: header-content

@header
## Learning Objectives

@main
- Objective 1
- Objective 2
- Objective 3

---

layout: header-content

@header
## Topic 1

@main
- Key concept
- Formula or definition

---

layout: header-content

@header
## Topic 2

@main
- Key concept
- Example

---

layout: header-content

@header
## Summary

@main
- Recap point 1
- Recap point 2

---

layout: title-slide

@title
# Next Lecture

## Topic preview
`,
  },
];

const STEPS = [
  { id: "template", label: "Template" },
  { id: "background", label: "Background" },
  { id: "styling", label: "Styling" },
];

export class NewPresentationModal {
  static _onPickImage = null;

  static setOnPickImage(cb) {
    this._onPickImage = cb;
  }

  static async show() {
    return new Promise((resolve) => {
      const backdrop = this._createDom();
      document.body.appendChild(backdrop);

      let currentStep = 0;
      let selectedBg = "";
      let selectedTheme = "";
      let selectedTitleStyle = "short";
      let selectedTemplate = TEMPLATES[0];
      let selectedImagePath = "";
      let imageOverlay = 40;

      const stepPanels = backdrop.querySelectorAll(".new-stepper__panel");
      const stepDots = backdrop.querySelectorAll(".new-stepper__dot");
      const stepLabels = backdrop.querySelectorAll(".new-stepper__step-label");
      const prevBtn = backdrop.querySelector('[data-action="prev"]');
      const nextBtn = backdrop.querySelector('[data-action="next"]');
      const createBtn = backdrop.querySelector('[data-action="create"]');
      const createDefaultsBtn = backdrop.querySelector('[data-action="create-defaults"]');
      const cancelBtn = backdrop.querySelector('[data-action="cancel"]');

      const showStep = (idx) => {
        currentStep = idx;
        stepPanels.forEach((p, i) => p.classList.toggle("active", i === idx));
        stepDots.forEach((d, i) => {
          d.classList.toggle("active", i === idx);
          d.classList.toggle("done", i < idx);
        });
        stepLabels.forEach((l, i) => l.classList.toggle("active", i === idx));
        prevBtn.style.display = idx === 0 ? "none" : "block";
        nextBtn.style.display = idx >= STEPS.length - 1 ? "none" : "block";
        createBtn.style.display = idx >= STEPS.length - 1 ? "block" : "none";
        createDefaultsBtn.style.display = idx === 0 ? "block" : "none";
      };

      const buildImageBackground = (imagePath, overlay) => {
        if (!imagePath) return "";
        const url = `url('${String(imagePath).replace(/'/g, "\\'")}')`;
        const imageLayer = `${url} center / cover no-repeat`;
        const opacity = overlay / 100;
        if (opacity <= 0) return imageLayer;
        const overlayLayer = `linear-gradient(rgba(0,0,0,${opacity}),rgba(0,0,0,${opacity}))`;
        return `${overlayLayer}, ${imageLayer}`;
      };

      const getBackgroundValue = () => {
        if (selectedImagePath) return buildImageBackground(selectedImagePath, imageOverlay);
        return selectedBg;
      };

      // ── Background swatches ──
      const swatchBtns = backdrop.querySelectorAll(".new-stepper__swatch");
      const bgText = backdrop.querySelector('[data-field="bg-text"]');
      const bgPreview = backdrop.querySelector(".new-stepper__bg-preview");
      const bgClear = backdrop.querySelector('[data-action="clear-bg"]');
      const bgPickImage = backdrop.querySelector('[data-action="pick-image"]');
      const themeCb = backdrop.querySelector('[data-field="bg-theme"]');
      const overlaySlider = backdrop.querySelector('[data-field="bg-overlay"]');
      const overlayValue = backdrop.querySelector('[data-display="bg-overlay"]');
      const imageStatus = backdrop.querySelector(".new-stepper__image-status");
      const overlayRow = backdrop.querySelector(".new-stepper__overlay-row");

      const syncBg = () => {
        swatchBtns.forEach((s) =>
          s.classList.toggle("selected", s.dataset.value === selectedBg && !selectedImagePath),
        );
        if (bgText) bgText.value = selectedImagePath || selectedBg;
        if (bgPreview) {
          const bgVal = getBackgroundValue();
          bgPreview.style.background = bgVal || "var(--surface-elevated)";
          bgPreview.classList.toggle("has-bg", !!bgVal);
        }
        if (bgClear) bgClear.style.display = selectedBg || selectedImagePath ? "block" : "none";
        if (themeCb) themeCb.checked = selectedTheme === "dark";
        if (imageStatus) {
          if (selectedImagePath) {
            imageStatus.textContent = selectedImagePath;
            imageStatus.style.display = "block";
          } else {
            imageStatus.style.display = "none";
          }
        }
        if (overlayRow) overlayRow.style.display = selectedImagePath ? "flex" : "none";
        if (overlaySlider) overlaySlider.value = imageOverlay;
        if (overlayValue) overlayValue.textContent = `${imageOverlay}%`;
      };

      swatchBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          selectedBg = btn.dataset.value;
          selectedImagePath = "";
          selectedTheme = isColorDark(btn.dataset.value) ? "dark" : "";
          syncBg();
        });
      });

      if (bgText) {
        bgText.addEventListener("input", (e) => {
          selectedBg = e.target.value.trim();
          selectedImagePath = "";
          syncBg();
        });
      }

      if (bgPickImage) {
        bgPickImage.addEventListener("click", (e) => {
          e.stopPropagation();
          if (this._onPickImage) {
            this._onPickImage((path) => {
              selectedImagePath = path;
              selectedBg = "";
              selectedTheme = "dark";
              syncBg();
            });
          }
        });
      }

      if (bgClear) {
        bgClear.addEventListener("click", () => {
          selectedBg = "";
          selectedImagePath = "";
          selectedTheme = "";
          syncBg();
        });
      }

      if (themeCb) {
        themeCb.addEventListener("change", (e) => {
          selectedTheme = e.target.checked ? "dark" : "light";
        });
      }

      if (overlaySlider) {
        overlaySlider.addEventListener("input", () => {
          imageOverlay = parseInt(overlaySlider.value, 10);
          if (overlayValue) overlayValue.textContent = `${imageOverlay}%`;
          syncBg();
        });
      }

      // ── Title style buttons ──
      const titleBtns = backdrop.querySelectorAll("[data-title-style]");
      const titleHint = backdrop.querySelector(".new-stepper__title-disabled-hint");
      titleBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          if (btn.disabled) return;
          titleBtns.forEach((b) => b.classList.remove("selected"));
          btn.classList.add("selected");
          selectedTitleStyle = btn.dataset.titleStyle;
        });
      });

      // ── Area styling ──
      const borderWidth = backdrop.querySelector('[data-field="border-width"]');
      const borderColor = backdrop.querySelector('[data-field="border-color"]');
      const radius = backdrop.querySelector('[data-field="radius"]');
      const padding = backdrop.querySelector('[data-field="padding"]');

      const hasAreaStyle = () => {
        return (
          parseInt(borderWidth.value, 10) > 0 ||
          parseInt(radius.value, 10) > 0 ||
          parseInt(padding.value, 10) !== 10
        );
      };

      const syncTitleDisabled = () => {
        const disabled = hasAreaStyle();
        titleBtns.forEach((btn) => {
          btn.disabled = disabled;
          if (disabled) btn.classList.remove("selected");
        });
        if (disabled) {
          // Force title to none when borders are active
          const noneBtn = backdrop.querySelector('[data-title-style="none"]');
          if (noneBtn) noneBtn.classList.add("selected");
          selectedTitleStyle = "none";
        }
        if (titleHint) titleHint.style.display = disabled ? "block" : "none";
      };

      const updateLabels = () => {
        backdrop.querySelector('[data-display="border-width"]').textContent =
          `${borderWidth.value}px`;
        backdrop.querySelector('[data-display="radius"]').textContent = `${radius.value}px`;
        backdrop.querySelector('[data-display="padding"]').textContent = `${padding.value}px`;
        syncTitleDisabled();
      };
      [borderWidth, radius, padding].forEach((el) => el?.addEventListener("input", updateLabels));

      const buildAreaStyle = () => {
        const parts = [];
        const bw = parseInt(borderWidth.value, 10);
        const bc = borderColor.value;
        const br = parseInt(radius.value, 10);
        const pd = parseInt(padding.value, 10);
        if (bw > 0) parts.push(`border: ${bw}px solid ${bc}`);
        if (br > 0) parts.push(`border-radius: ${br}px`);
        if (pd !== 10) parts.push(`padding: ${pd}px`);
        return parts.join("; ");
      };

      // ── Template cards ──
      const templateCards = backdrop.querySelectorAll(".new-stepper__template");
      templateCards.forEach((card) => {
        card.addEventListener("click", () => {
          templateCards.forEach((c) => c.classList.remove("selected"));
          card.classList.add("selected");
          selectedTemplate = TEMPLATES.find((t) => t.id === card.dataset.template);
        });
      });

      // ── Navigation ──
      prevBtn.addEventListener("click", () => {
        if (currentStep > 0) showStep(currentStep - 1);
      });

      nextBtn.addEventListener("click", () => {
        if (currentStep < STEPS.length - 1) showStep(currentStep + 1);
      });

      const resolveWith = () => {
        backdrop.remove();
        resolve({
          background: getBackgroundValue(),
          theme: selectedTheme,
          titleStyle: selectedTitleStyle,
          areaStyle: buildAreaStyle(),
          template: selectedTemplate,
        });
      };

      createBtn.addEventListener("click", resolveWith);
      createDefaultsBtn.addEventListener("click", resolveWith);

      cancelBtn.addEventListener("click", () => {
        backdrop.remove();
        resolve(null);
      });

      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) {
          backdrop.remove();
          resolve(null);
        }
      });

      const handleEsc = (e) => {
        if (e.key === "Escape") {
          backdrop.remove();
          resolve(null);
          document.removeEventListener("keydown", handleEsc);
        }
      };
      document.addEventListener("keydown", handleEsc);

      syncBg();
      showStep(0);
    });
  }

  static _createDom() {
    const el = document.createElement("div");
    el.className = "modal new-stepper";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");

    const swatchBtns = COLOR_SWATCHES.map(
      (c) =>
        `<button type="button" class="new-stepper__swatch" data-value="${c.value}" title="${c.name}" style="background:${c.value}"></button>`,
    ).join("");

    const templateCards = TEMPLATES.map(
      (t) => `
        <div class="new-stepper__template ${t.id === "blank" ? "selected" : ""}" data-template="${t.id}">
          <div class="new-stepper__template-preview">
            <div class="new-stepper__template-preview-line"></div>
            <div class="new-stepper__template-preview-line"></div>
            <div class="new-stepper__template-preview-line"></div>
          </div>
          <div class="new-stepper__template-info">
            <div class="new-stepper__template-name">${t.name}</div>
            <div class="new-stepper__template-desc">${t.desc}</div>
          </div>
        </div>`,
    ).join("");

    el.innerHTML = `
      <div class="modal__overlay"></div>
      <div class="new-stepper__dialog">
        <div class="new-stepper__header">
          <h2 class="new-stepper__title">New Presentation</h2>
          <button class="new-stepper__close" aria-label="Close">&times;</button>
        </div>

        <div class="new-stepper__progress">
          ${STEPS.map(
            (s, i) => `
            <div class="new-stepper__step-indicator">
              <div class="new-stepper__dot ${i === 0 ? "active" : ""}">${i + 1}</div>
              <span class="new-stepper__step-label ${i === 0 ? "active" : ""}">${s.label}</span>
            </div>`,
          ).join("")}
        </div>

        <div class="new-stepper__body">

          <!-- Step 1: Template -->
          <div class="new-stepper__panel active" data-step="template">
            <p class="new-stepper__section-hint">Pick a starting layout. You can always add or remove slides later. Click <strong>Create</strong> to skip ahead with all defaults.</p>
            <div class="new-stepper__templates">${templateCards}</div>
          </div>

          <!-- Step 2: Background -->
          <div class="new-stepper__panel" data-step="background">
            <p class="new-stepper__section-hint">Choose a color or image for all slides.</p>
            <div class="new-stepper__inline-section">
              <span class="new-stepper__label">Color</span>
              <div class="new-stepper__swatches">${swatchBtns}</div>
            </div>
            <div class="new-stepper__inline-section">
              <span class="new-stepper__label">Image</span>
              <div class="new-stepper__row">
                <input type="text" class="new-stepper__text-input" data-field="bg-text" placeholder="Paste image path or URL..." />
                <button class="new-stepper__bg-btn" data-action="pick-image" type="button">Browse...</button>
              </div>
              <div class="new-stepper__image-status" style="display:none"></div>
            </div>
            <div class="new-stepper__overlay-row" style="display:none">
              <span class="new-stepper__label">Overlay</span>
              <input type="range" class="new-stepper__range" data-field="bg-overlay" min="0" max="100" value="40" />
              <span class="new-stepper__control-value" data-display="bg-overlay">40%</span>
            </div>
            <div class="new-stepper__inline-section">
              <span class="new-stepper__label">Preview</span>
              <div class="new-stepper__bg-preview"></div>
            </div>
            <div class="new-stepper__row new-stepper__row--between">
              <label class="new-stepper__toggle">
                <input type="checkbox" data-field="bg-theme" />
                <span>Dark theme</span>
              </label>
              <button class="new-stepper__bg-btn new-stepper__bg-btn--clear" data-action="clear-bg" type="button" style="display:none">Clear</button>
            </div>
          </div>

          <!-- Step 3: Styling (Title + Area) -->
          <div class="new-stepper__panel" data-step="styling">
            <div class="new-stepper__inline-section">
              <span class="new-stepper__label">Title Decoration</span>
              <p class="new-stepper__hint">Accent line under slide titles.</p>
              <div class="new-stepper__title-options">
                <button class="new-stepper__option selected" data-title-style="short" type="button">
                  <span class="new-stepper__option-name">Short</span>
                  <span class="new-stepper__option-desc">55% width</span>
                </button>
                <button class="new-stepper__option" data-title-style="full" type="button">
                  <span class="new-stepper__option-name">Full</span>
                  <span class="new-stepper__option-desc">100% width</span>
                </button>
                <button class="new-stepper__option" data-title-style="none" type="button">
                  <span class="new-stepper__option-name">None</span>
                  <span class="new-stepper__option-desc">No line</span>
                </button>
              </div>
              <p class="new-stepper__title-disabled-hint" style="display:none">Disabled when content borders are active.</p>
            </div>

            <div class="new-stepper__divider"></div>

            <div class="new-stepper__inline-section">
              <span class="new-stepper__label">Content Areas</span>
              <p class="new-stepper__hint">Border, radius, and padding for all content blocks.</p>
              <div class="new-stepper__control-row">
                <span class="new-stepper__control-label">Border</span>
                <input type="range" class="new-stepper__range" data-field="border-width" min="0" max="12" value="0" />
                <span class="new-stepper__control-value" data-display="border-width">0px</span>
                <input type="color" class="new-stepper__color" data-field="border-color" value="#d3d3d3" />
              </div>
              <div class="new-stepper__control-row">
                <span class="new-stepper__control-label">Radius</span>
                <input type="range" class="new-stepper__range" data-field="radius" min="0" max="50" value="0" />
                <span class="new-stepper__control-value" data-display="radius">0px</span>
              </div>
              <div class="new-stepper__control-row">
                <span class="new-stepper__control-label">Padding</span>
                <input type="range" class="new-stepper__range" data-field="padding" min="0" max="48" value="10" />
                <span class="new-stepper__control-value" data-display="padding">10px</span>
              </div>
            </div>
          </div>

        </div>

        <div class="new-stepper__footer">
          <button class="new-stepper__btn new-stepper__btn--secondary" data-action="cancel" type="button">Cancel</button>
          <div class="new-stepper__footer-right">
            <button class="new-stepper__btn new-stepper__btn--secondary" data-action="prev" type="button" style="display:none">Back</button>
            <button class="new-stepper__btn new-stepper__btn--primary" data-action="create-defaults" type="button">Create</button>
            <button class="new-stepper__btn new-stepper__btn--primary" data-action="next" type="button">Next</button>
            <button class="new-stepper__btn new-stepper__btn--primary" data-action="create" type="button" style="display:none">Create</button>
          </div>
        </div>
      </div>
    `;

    const closeBtn = el.querySelector(".new-stepper__close");
    closeBtn.onclick = () => el.remove();

    return el;
  }
}

function isColorDark(hex) {
  if (!hex || !hex.startsWith("#")) return false;
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}
