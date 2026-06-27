/**
 * New Presentation Modal
 * Modal for creating a new presentation with theme, style, and template options
 */

const ACCENT_COLORS = [
  { id: "indigo", value: "119, 102, 191", name: "Indigo" },
  { id: "blue", value: "59, 130, 246", name: "Blue" },
  { id: "teal", value: "20, 184, 166", name: "Teal" },
  { id: "green", value: "34, 197, 94", name: "Green" },
  { id: "orange", value: "249, 115, 22", name: "Orange" },
  { id: "red", value: "239, 68, 68", name: "Red" },
  { id: "pink", value: "236, 72, 153", name: "Pink" },
  { id: "purple", value: "168, 85, 247", name: "Purple" },
  { id: "white", value: "15, 23, 42", name: "White" },
  { id: "black", value: "241, 245, 249", name: "Black" },
];

const TEMPLATES = [
  {
    id: "blank",
    name: "Blank",
    desc: "Empty deck",
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
    desc: "Title + content slides",
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
## Topic 1

@main
- Detail A
- Detail B

---

layout: header-content

@header
## Topic 2

@main
- Detail C
- Detail D

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
    desc: "Academic format",
    markdown: `layout: title-slide

@title
# Course Title

## Semester / Year

---

layout: header-content

@header
## Today's Topics

@main
- Learning objective 1
- Learning objective 2
- Learning objective 3

---

layout: header-content

@header
## Topic 1

@main
- Key concept explanation
- Important formulas or definitions

---

layout: header-content

@header
## Topic 2

@main
- Key concept explanation
- Examples and applications

---

layout: header-content

@header
## Summary

@main
- Recap point 1
- Recap point 2
- Recap point 3

---

layout: title-slide

@title
# Next Lecture

## Topic preview
`,
  },
];

export class NewPresentationModal {
  static backdrop = null;

  /**
   * Show new presentation modal
   * @returns {Promise<Object|null>} Selected options or null if cancelled
   */
  static async show() {
    return new Promise((resolve) => {
      const backdrop = this.createModal();
      document.body.appendChild(backdrop);

      // State
      let selectedTheme = "light";
      let selectedColor = ACCENT_COLORS[0];
      let selectedTemplate = TEMPLATES[0];

      // Elements
      const themeCards = backdrop.querySelectorAll(".new-presentation-modal__theme-card");
      const colorBtns = backdrop.querySelectorAll(".new-presentation-modal__color");
      const templateCards = backdrop.querySelectorAll(".new-presentation-modal__template");
      const confirmBtn = backdrop.querySelector(".new-presentation-modal__btn--primary");
      const cancelBtn = backdrop.querySelector(".new-presentation-modal__btn--secondary");

      // Theme selection
      themeCards.forEach((card) => {
        card.onclick = () => {
          themeCards.forEach((c) => c.classList.remove("selected"));
          card.classList.add("selected");
          selectedTheme = card.dataset.theme;
        };
      });

      // Color selection
      colorBtns.forEach((btn) => {
        btn.onclick = () => {
          colorBtns.forEach((b) => b.classList.remove("selected"));
          btn.classList.add("selected");
          selectedColor = ACCENT_COLORS.find((c) => c.id === btn.dataset.color);
        };
      });

      // Template selection
      templateCards.forEach((card) => {
        card.onclick = () => {
          templateCards.forEach((c) => c.classList.remove("selected"));
          card.classList.add("selected");
          selectedTemplate = TEMPLATES.find((t) => t.id === card.dataset.template);
        };
      });

      // Cancel
      cancelBtn.onclick = () => {
        backdrop.remove();
        resolve(null);
      };

      // Confirm
      confirmBtn.onclick = () => {
        backdrop.remove();
        resolve({
          theme: selectedTheme,
          accentColor: selectedColor,
          template: selectedTemplate,
        });
      };

      // Close on backdrop click
      backdrop.onclick = (e) => {
        if (e.target === backdrop) {
          backdrop.remove();
          resolve(null);
        }
      };

      // Close on Escape
      const handleEsc = (e) => {
        if (e.key === "Escape") {
          backdrop.remove();
          resolve(null);
          document.removeEventListener("keydown", handleEsc);
        }
      };
      document.addEventListener("keydown", handleEsc);
    });
  }

  static createModal() {
    const backdrop = document.createElement("div");
    backdrop.className = "modal new-presentation-modal";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "newPresentationTitle");

    backdrop.innerHTML = `
      <div class="modal__overlay"></div>
      <div class="modal__dialog">
        <div class="modal__header">
          <h2 id="newPresentationTitle" class="modal__title">New Presentation</h2>
          <button class="modal__close new-presentation-modal__close" aria-label="Close">&times;</button>
        </div>
        <div class="modal__body">
          <div class="new-presentation-modal__sections">
            <div class="new-presentation-modal__section">
              <span class="new-presentation-modal__section-title">Color Mode</span>
              <div class="new-presentation-modal__theme-cards">
                <div class="new-presentation-modal__theme-card selected" data-theme="light">
                  <input type="radio" name="theme" class="new-presentation-modal__theme-radio" checked>
                  <div class="new-presentation-modal__theme-preview new-presentation-modal__theme-preview--light">Aa</div>
                  <div class="new-presentation-modal__theme-info">
                    <div class="new-presentation-modal__theme-name">Light</div>
                  </div>
                </div>
                <div class="new-presentation-modal__theme-card" data-theme="dark">
                  <input type="radio" name="theme" class="new-presentation-modal__theme-radio">
                  <div class="new-presentation-modal__theme-preview new-presentation-modal__theme-preview--dark">Aa</div>
                  <div class="new-presentation-modal__theme-info">
                    <div class="new-presentation-modal__theme-name">Dark</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="new-presentation-modal__section">
              <span class="new-presentation-modal__section-title">Accent Color</span>
              <div class="new-presentation-modal__colors">
                ${ACCENT_COLORS.map(
                  (c) => `
                  <button class="new-presentation-modal__color new-presentation-modal__color--${c.id} ${c.id === "indigo" ? "selected" : ""}"
                    data-color="${c.id}"
                    style="background: rgb(${c.value})"
                    title="${c.name}"
                    type="button"></button>
                `,
                ).join("")}
              </div>
            </div>

            <div class="new-presentation-modal__section">
              <span class="new-presentation-modal__section-title">Template</span>
              <div class="new-presentation-modal__templates">
                ${TEMPLATES.map(
                  (t) => `
                  <div class="new-presentation-modal__template ${t.id === "blank" ? "selected" : ""}" data-template="${t.id}">
                    <div class="new-presentation-modal__template-preview">
                      <div class="new-presentation-modal__template-preview-line"></div>
                      <div class="new-presentation-modal__template-preview-line"></div>
                      <div class="new-presentation-modal__template-preview-line"></div>
                    </div>
                    <div class="new-presentation-modal__template-name">${t.name}</div>
                    <div class="new-presentation-modal__template-desc">${t.desc}</div>
                  </div>
                `,
                ).join("")}
              </div>
            </div>
          </div>
        </div>
        <div class="new-presentation-modal__actions">
          <button class="new-presentation-modal__btn new-presentation-modal__btn--secondary" type="button">Cancel</button>
          <button class="new-presentation-modal__btn new-presentation-modal__btn--primary" type="button">Create</button>
        </div>
      </div>
    `;

    // Wire up close button
    const closeBtn = backdrop.querySelector(".new-presentation-modal__close");
    closeBtn.onclick = () => {
      backdrop.remove();
    };

    return backdrop;
  }
}
