/**
 * MermaidHelperManager
 *
 * Manages the Mermaid template helper panel.
 * Extracted from EditController.
 */

const TEMPLATES = {
  flowchart:
    "```mermaid\nflowchart TD\n    A[Start] --> B{Decision}\n    B -->|Yes| C[Do the thing]\n    B -->|No| D[Stop]\n```\n",
  erDiagram:
    "```mermaid\nerDiagram\n    CUSTOMER ||--o{ ORDER : places\n    ORDER ||--|{ LINE_ITEM : contains\n    PRODUCT ||--o{ LINE_ITEM : includes\n    CUSTOMER {\n        string name\n        string email\n    }\n    ORDER {\n        string id\n        date orderDate\n    }\n    PRODUCT {\n        string sku\n        string title\n    }\n```\n",
  sequence:
    "```mermaid\nsequenceDiagram\n    participant A as User\n    participant B as Service\n    A->>B: Request\n    B-->>A: Response\n```\n",
  class:
    "```mermaid\nclassDiagram\n    class SlideDeck {\n        +title\n        +render()\n    }\n    class Slide {\n        +layout\n        +areas\n    }\n    SlideDeck --> Slide\n```\n",
  state:
    "```mermaid\nstateDiagram-v2\n    [*] --> Draft\n    Draft --> Review\n    Review --> Published\n    Published --> [*]\n```\n",
  gantt:
    "```mermaid\ngantt\n    title Project Timeline\n    dateFormat  YYYY-MM-DD\n    section Prep\n    Draft content      :a1, 2025-01-01, 2025-01-07\n    Review             :a2, 2025-01-08, 2025-01-12\n    section Delivery\n    Finalize slides    :a3, 2025-01-13, 2025-01-16\n```\n",
};

export class MermaidHelperManager {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.mermaidHelperPanel
   * @param {object} opts.markdownEditor
   */
  constructor({ mermaidHelperPanel, markdownEditor }) {
    this._panel = mermaidHelperPanel;
    this._markdownEditor = markdownEditor;
  }

  get markdownEditor() {
    return this._markdownEditor;
  }

  init() {
    if (!this._panel) return;
    const templateButtons = this._panel.querySelectorAll("[data-mermaid-template]");
    templateButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const template = button.getAttribute("data-mermaid-template");
        this.insertTemplate(template);
      });
    });
  }

  toggle() {
    if (!this._panel) return;
    const isHidden = this._panel.classList.toggle("webdeck-hidden");
    this._panel.setAttribute("aria-hidden", String(isHidden));
  }

  hide() {
    if (!this._panel) return;
    this._panel.classList.add("webdeck-hidden");
    this._panel.setAttribute("aria-hidden", "true");
  }

  insertTemplate(templateName) {
    if (!this._markdownEditor) return;
    const snippet = TEMPLATES[templateName] || TEMPLATES.flowchart;
    this._markdownEditor.insertText(snippet);
    this._markdownEditor.focus();
  }
}
