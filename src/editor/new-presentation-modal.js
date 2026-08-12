/**
 * New Presentation Modal — Stepper Wizard
 *
 * 3 steps: Template → Background → Styling
 * User can click "Create" on the first step to use all defaults.
 */

import {
  isColorDark,
  buildImageBackground,
  buildAreaStyle,
  syncSliderLabels,
  syncTitleDisabled,
  buildBackgroundPanelHtml,
  buildAreaStylePanelHtml,
  buildTitlePanelHtml,
  syncBgState,
} from "../editor/ui/style-helpers.js";
import { modalOpened, modalClosed } from "../core/modal-state.js";

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

const P = "new-stepper__";

export class NewPresentationModal {
  static _onPickImage = null;

  static setOnPickImage(cb) {
    this._onPickImage = cb;
  }

  static async show() {
    return new Promise((resolve) => {
      const backdrop = this._createDom();
      document.body.appendChild(backdrop);
      modalOpened();

      let currentStep = 0;
      let selectedBg = "";
      let selectedTheme = "";
      let selectedTitleStyle = "short";
      let selectedTemplate = TEMPLATES[0];
      let selectedImagePath = "";
      let imageOverlay = 40;

      const stepPanels = backdrop.querySelectorAll(`.${P}panel`);
      const stepDots = backdrop.querySelectorAll(`.${P}dot`);
      const stepLabels = backdrop.querySelectorAll(`.${P}step-label`);
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

      const getBackgroundValue = () => {
        if (selectedImagePath) return buildImageBackground(selectedImagePath, imageOverlay, "");
        return selectedBg;
      };

      const syncBg = () => {
        syncBgState(backdrop, {
          bg: selectedBg,
          imagePath: selectedImagePath,
          theme: selectedTheme,
          bgValue: getBackgroundValue(),
          overlay: imageOverlay,
        });
      };

      // ── Background swatches ──
      backdrop.querySelector(".style-swatch-grid").addEventListener("click", (e) => {
        const btn = e.target.closest(".style-swatch");
        if (!btn || btn.dataset.action === "open-color-picker") return;
        selectedBg = btn.dataset.value;
        selectedImagePath = "";
        selectedTheme = btn.dataset.value && isColorDark(btn.dataset.value) ? "dark" : "";
        syncBg();
      });

      // ── Color picker (hidden input overlays dropper button) ──
      const colorInput = backdrop.querySelector('[data-field="bg-custom-color"]');
      if (colorInput) {
        colorInput.addEventListener("input", (e) => {
          selectedBg = e.target.value;
          selectedImagePath = "";
          selectedTheme = isColorDark(e.target.value) ? "dark" : "";
          syncBg();
        });
      }

      backdrop.querySelector('[data-action="pick-image"]')?.addEventListener("click", (e) => {
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

      backdrop.querySelector('[data-field="bg-theme"]')?.addEventListener("change", (e) => {
        selectedTheme = e.target.checked ? "dark" : "light";
      });

      backdrop.querySelector('[data-field="bg-overlay"]')?.addEventListener("input", () => {
        const slider = backdrop.querySelector('[data-field="bg-overlay"]');
        imageOverlay = parseInt(slider.value, 10);
        syncBg();
      });

      // ── Title style buttons ──
      const titleBtns = backdrop.querySelectorAll(".style-btn-option");
      titleBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          if (btn.disabled) return;
          titleBtns.forEach((b) => b.classList.remove("selected"));
          btn.classList.add("selected");
          selectedTitleStyle = btn.dataset.headerStyle;
        });
      });

      // ── Area styling ──
      const borderWidth = backdrop.querySelector('[data-field="border-width"]');
      const borderColor = backdrop.querySelector('[data-field="border-color"]');
      const radius = backdrop.querySelector('[data-field="radius"]');
      const padding = backdrop.querySelector('[data-field="padding"]');

      const updateLabels = () => {
        syncSliderLabels(backdrop);
        const hasBorders = syncTitleDisabled(backdrop, {
          titleBtnSelector: ".style-btn-option",
          hintSelector: ".style-disabled-hint",
        });
        if (hasBorders) {
          selectedTitleStyle = "none";
        } else {
          const selectedBtn = backdrop.querySelector(".style-btn-option.selected");
          selectedTitleStyle = selectedBtn?.dataset.headerStyle || "short";
        }
      };
      [borderWidth, radius, padding].forEach((el) => el?.addEventListener("input", updateLabels));

      const buildAreaStyleFromUI = () => {
        return buildAreaStyle(borderWidth.value, borderColor.value, radius.value, padding.value);
      };

      // ── Template cards ──
      const templateCards = backdrop.querySelectorAll(`.${P}template`);
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
        ac.abort();
        backdrop.remove();
        modalClosed();
        resolve({
          background: getBackgroundValue(),
          theme: selectedTheme,
          titleStyle: selectedTitleStyle,
          areaStyle: buildAreaStyleFromUI(),
          template: selectedTemplate,
        });
      };

      createBtn.addEventListener("click", resolveWith);
      createDefaultsBtn.addEventListener("click", resolveWith);

      const dismiss = () => {
        ac.abort();
        backdrop.remove();
        modalClosed();
        resolve(null);
      };

      cancelBtn.addEventListener("click", dismiss);

      backdrop.querySelector(`.${P}close`).addEventListener("click", dismiss);

      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) dismiss();
      });

      const ac = new AbortController();
      document.addEventListener(
        "keydown",
        (e) => {
          if (e.key === "Escape") dismiss();
        },
        { signal: ac.signal },
      );

      syncBg();
      showStep(0);
    });
  }

  static _createDom() {
    const el = document.createElement("div");
    el.className = "modal new-stepper";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");

    const templateCards = TEMPLATES.map(
      (t) => `
        <div class="${P}template ${t.id === "blank" ? "selected" : ""}" data-template="${t.id}">
          <div class="${P}template-preview">
            <div class="${P}template-preview-line"></div>
            <div class="${P}template-preview-line"></div>
            <div class="${P}template-preview-line"></div>
          </div>
          <div class="${P}template-info">
            <div class="${P}template-name">${t.name}</div>
            <div class="${P}template-desc">${t.desc}</div>
          </div>
        </div>`,
    ).join("");

    el.innerHTML = `
      <div class="modal__overlay"></div>
      <div class="${P}dialog">
        <div class="${P}header">
          <h2 class="${P}title">New Presentation</h2>
          <button class="${P}close" aria-label="Close">&times;</button>
        </div>
        <div class="${P}progress">
          ${STEPS.map(
            (s, i) => `
            <div class="${P}step-indicator">
              <div class="${P}dot ${i === 0 ? "active" : ""}">${i + 1}</div>
              <span class="${P}step-label ${i === 0 ? "active" : ""}">${s.label}</span>
            </div>`,
          ).join("")}
        </div>
        <div class="${P}body">
          <div class="${P}panel active" data-step="template">
            <p class="${P}section-hint">Pick a starting layout. You can always add or remove slides later. Click <strong>Create</strong> to skip ahead with all defaults.</p>
            <div class="${P}templates">${templateCards}</div>
          </div>
          <div class="${P}panel" data-step="background">
            <p class="${P}section-hint">Choose a color or image for all slides.</p>
            ${buildBackgroundPanelHtml()}
          </div>
          <div class="${P}panel" data-step="styling">
            ${buildTitlePanelHtml()}
            <div class="${P}divider"></div>
            ${buildAreaStylePanelHtml({ showHint: true })}
          </div>
        </div>
        <div class="${P}footer">
          <button class="${P}btn ${P}btn--secondary" data-action="cancel" type="button">Cancel</button>
          <div class="${P}footer-right">
            <button class="${P}btn ${P}btn--secondary" data-action="prev" type="button" style="display:none">Back</button>
            <button class="${P}btn ${P}btn--primary" data-action="create-defaults" type="button">Create</button>
            <button class="${P}btn ${P}btn--primary" data-action="next" type="button">Next</button>
            <button class="${P}btn ${P}btn--primary" data-action="create" type="button" style="display:none">Create</button>
          </div>
        </div>
      </div>
    `;

    return el;
  }
}
