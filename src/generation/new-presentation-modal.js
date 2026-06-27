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

# Presentation Title

Author Name
`,
  },
  {
    id: "standard",
    name: "Standard",
    desc: "Title + content slides",
    markdown: `layout: title-slide

# Presentation Title

Author Name

---

layout: header-content

## Overview

@main

- Topic 1
- Topic 2
- Topic 3

---

layout: header-content

## Topic 1

@main

- Detail A
- Detail B

---

layout: header-content

## Topic 2

@main

- Detail C
- Detail D

---

layout: title-slide

# Thank You

Questions?
`,
  },
  {
    id: "lecture",
    name: "Lecture",
    desc: "Academic format",
    markdown: `layout: title-slide

# Course Title

Semester / Year

---

layout: header-content

## Today's Topics

@main

- Learning objective 1
- Learning objective 2
- Learning objective 3

---

layout: header-content

## Topic 1

@main

- Key concept explanation
- Important formulas or definitions

---

layout: header-content

## Topic 2

@main

- Key concept explanation
- Examples and applications

---

layout: header-content

## Summary

@main

- Recap point 1
- Recap point 2
- Recap point 3

---

layout: title-slide

# Next Lecture

Topic preview
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
      let selectedHeader = "underline";
      let showBorder = true;
      let roundedCode = true;
      let selectedTemplate = TEMPLATES[0];

      // Elements
      const themeCards = backdrop.querySelectorAll(".new-presentation-modal__theme-card");
      const colorBtns = backdrop.querySelectorAll(".new-presentation-modal__color");
      const headerOptions = backdrop.querySelectorAll("[data-header-style]");
      const borderToggle = backdrop.querySelector('[data-toggle="border"]');
      const codeToggle = backdrop.querySelector('[data-toggle="code"]');
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

      // Header style selection
      headerOptions.forEach((opt) => {
        opt.onclick = () => {
          headerOptions.forEach((o) => o.classList.remove("selected"));
          opt.classList.add("selected");
          selectedHeader = opt.dataset.headerStyle;
        };
      });

      // Border toggle
      borderToggle.onclick = () => {
        showBorder = !showBorder;
        borderToggle.classList.toggle("active", showBorder);
      };

      // Code toggle
      codeToggle.onclick = () => {
        roundedCode = !roundedCode;
        codeToggle.classList.toggle("active", roundedCode);
      };

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
          headerStyle: selectedHeader,
          showBorder,
          roundedCode,
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
              <span class="new-presentation-modal__section-title">Style</span>
              <div class="new-presentation-modal__options">
                <button class="new-presentation-modal__option selected" data-header-style="underline" type="button">Underline</button>
                <button class="new-presentation-modal__option" data-header-style="pill" type="button">Pill</button>
                <button class="new-presentation-modal__option" data-header-style="none" type="button">None</button>
              </div>
              <div class="new-presentation-modal__toggle-row">
                <span class="new-presentation-modal__toggle-label">Show border on images</span>
                <button class="new-presentation-modal__toggle active" data-toggle="border" type="button"></button>
              </div>
              <div class="new-presentation-modal__toggle-row">
                <span class="new-presentation-modal__toggle-label">Rounded code blocks</span>
                <button class="new-presentation-modal__toggle active" data-toggle="code" type="button"></button>
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
