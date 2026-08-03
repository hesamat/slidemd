/**
 * Command Registry
 *
 * Single source of truth for commands that are available from the
 * keyboard and the command palette. Each entry maps an action id to
 * display metadata and key bindings.
 */

/**
 * @typedef {Object} KeyBinding
 * @property {string} key - The key value as reported by KeyboardEvent.key.
 * @property {boolean} [ctrl=false]
 * @property {boolean} [shift=false]
 * @property {boolean} [alt=false]
 */

/**
 * @typedef {Object} CommandDefinition
 * @property {string} id - Action id, also used to look up the action function.
 * @property {string} name - Human-readable name shown in the command palette.
 * @property {string} shortcut - Display shortcut string for the command palette.
 * @property {string} category - Category tab name.
 * @property {string[]} [plainKeys] - Plain single-key bindings for layer 2 handling.
 * @property {KeyBinding[]} [modifiers] - Modifier key combinations for layer 1 handling.
 * @property {boolean} [viewing] - Whether the plain keys should be in the viewing map.
 * @property {boolean} [editor] - Whether the action is gated to the editor window.
 * @property {Function} [isEnabled] - (ctx) => boolean, for the command palette.
 */

/** @type {CommandDefinition[]} */
export const COMMANDS = [
  {
    id: "next",
    name: "Next slide",
    shortcut: "→ / Space",
    category: "Navigation",
    plainKeys: ["ArrowRight", " ", "PageDown", "ArrowDown"],
  },
  {
    id: "prev",
    name: "Previous slide",
    shortcut: "← / Backspace",
    category: "Navigation",
    plainKeys: ["ArrowLeft", "ArrowUp", "PageUp", "Backspace"],
  },
  {
    id: "first",
    name: "First slide",
    shortcut: "Home",
    category: "Navigation",
    plainKeys: ["Home"],
  },
  {
    id: "last",
    name: "Last slide",
    shortcut: "End",
    category: "Navigation",
    plainKeys: ["End"],
  },
  {
    id: "goto",
    name: "Go to slide",
    shortcut: "G",
    category: "Navigation",
    plainKeys: ["g", "G"],
  },
  {
    id: "search",
    name: "Search slides",
    shortcut: "/",
    category: "Navigation",
    plainKeys: ["/", "?"],
    modifiers: [{ key: "f", ctrl: true, shift: true }],
  },

  {
    id: "edit",
    name: "Toggle edit mode",
    shortcut: "E",
    category: "View",
    plainKeys: ["e", "E"],
    editor: true,
    isEnabled: (ctx) => ctx.roleManager?.isEditorWindow,
  },
  {
    id: "viewer",
    name: "Open presenter view",
    shortcut: "P",
    category: "View",
    plainKeys: ["p", "P"],
    viewing: true,
    isEnabled: (ctx) => ctx.roleManager?.isEditorWindow && !ctx.isEditMode(),
  },
  {
    id: "fullscreen",
    name: "Toggle fullscreen",
    shortcut: "F",
    category: "View",
    plainKeys: ["f", "F"],
  },
  {
    id: "break",
    name: "Toggle break timer",
    shortcut: "B",
    category: "View",
    plainKeys: ["b", "B"],
    viewing: true,
    isEnabled: (ctx) => ctx.roleManager?.isEditorWindow && !ctx.isEditMode(),
  },
  {
    id: "theme",
    name: "Toggle app theme",
    shortcut: "T",
    category: "View",
    plainKeys: ["t", "T"],
  },
  {
    id: "reload",
    name: "Reload deck",
    shortcut: "R",
    category: "View",
    plainKeys: ["r", "R"],
    editor: true,
    isEnabled: (ctx) => ctx.roleManager?.isEditorWindow,
  },

  {
    id: "save",
    name: "Save changes",
    shortcut: "Ctrl+S",
    category: "Edit",
    modifiers: [{ key: "s", ctrl: true }],
    isEnabled: (ctx) => ctx.isEditMode(),
  },
  {
    id: "newSlide",
    name: "New slide",
    shortcut: "Alt+N",
    category: "Edit",
    modifiers: [{ key: "n", alt: true }],
    isEnabled: (ctx) => ctx.isEditMode(),
  },
  {
    id: "duplicateSlide",
    name: "Duplicate slide",
    shortcut: "Alt+D",
    category: "Edit",
    modifiers: [{ key: "d", alt: true }],
    isEnabled: (ctx) => ctx.isEditMode(),
  },
  {
    id: "deleteSlide",
    name: "Delete slide",
    shortcut: "Alt+Backspace",
    category: "Edit",
    modifiers: [{ key: "Backspace", alt: true }],
    isEnabled: (ctx) => ctx.isEditMode(),
  },
  {
    id: "insertImage",
    name: "Insert image",
    shortcut: "Alt+I",
    category: "Edit",
    modifiers: [{ key: "i", alt: true }],
    isEnabled: (ctx) => ctx.isEditMode(),
  },
  {
    id: "insertText",
    name: "Insert text block",
    shortcut: "Alt+T",
    category: "Edit",
    modifiers: [{ key: "t", alt: true }],
    isEnabled: (ctx) => ctx.isEditMode(),
  },
  {
    id: "openLayout",
    name: "Open layout picker",
    shortcut: "Alt+L",
    category: "Edit",
    modifiers: [{ key: "l", alt: true }],
    isEnabled: (ctx) => ctx.isEditMode(),
  },
  {
    id: "toggleMermaid",
    name: "Toggle Mermaid helper",
    shortcut: "Alt+M",
    category: "Edit",
    modifiers: [{ key: "m", alt: true }],
    isEnabled: (ctx) => ctx.isEditMode(),
  },
  {
    id: "adjustColumns",
    name: "Adjust columns",
    shortcut: "Alt+A",
    category: "Edit",
    modifiers: [{ key: "a", alt: true }],
    isEnabled: (ctx) => ctx.isEditMode(),
  },
  {
    id: "slideTheme",
    name: "Toggle slide theme",
    shortcut: "Alt+Shift+T",
    category: "Edit",
    modifiers: [{ key: "t", shift: true, alt: true }],
    isEnabled: (ctx) => ctx.isEditMode(),
  },
  {
    id: "styles",
    name: "Toggle slide styles",
    shortcut: "Alt+S",
    category: "Edit",
    modifiers: [{ key: "s", alt: true }],
    isEnabled: (ctx) => ctx.isEditMode(),
  },
  {
    id: "moveSlideUp",
    name: "Move slide up",
    shortcut: "Alt+Shift+↑",
    category: "Edit",
    modifiers: [{ key: "ArrowUp", shift: true, alt: true }],
    isEnabled: (ctx) => ctx.isEditMode(),
  },
  {
    id: "moveSlideDown",
    name: "Move slide down",
    shortcut: "Alt+Shift+↓",
    category: "Edit",
    modifiers: [{ key: "ArrowDown", shift: true, alt: true }],
    isEnabled: (ctx) => ctx.isEditMode(),
  },
  {
    id: "undo",
    name: "Undo",
    shortcut: "Ctrl+Z",
    category: "Edit",
    modifiers: [{ key: "z", ctrl: true }],
    isEnabled: (ctx) => ctx.isEditMode(),
  },
  {
    id: "redo",
    name: "Redo",
    shortcut: "Ctrl+Y",
    category: "Edit",
    modifiers: [
      { key: "z", ctrl: true, shift: true },
      { key: "y", ctrl: true },
    ],
    isEnabled: (ctx) => ctx.isEditMode(),
  },

  { id: "print", name: "Print to PDF", shortcut: "", category: "Export" },
  { id: "htmlExport", name: "Export HTML", shortcut: "", category: "Export" },
  { id: "textpackExport", name: "Export Textpack", shortcut: "", category: "Export" },
];

/**
 * Build the command list for the CommandPalette.
 * @param {object} ctx - The deck controller context.
 * @param {Record<string, Function>} actions - Map of action id to action function.
 * @returns {Array<{id: string, name: string, shortcut: string, category: string, isEnabled?: () => boolean, action: () => void}>}
 */
export function buildPaletteCommands(ctx, actions) {
  return COMMANDS.map((cmd) => ({
    id: cmd.id,
    name: cmd.name,
    shortcut: cmd.shortcut,
    category: cmd.category,
    isEnabled: cmd.isEnabled ? () => cmd.isEnabled(ctx) : undefined,
    action: actions[cmd.id],
  })).filter((cmd) => typeof cmd.action === "function");
}
