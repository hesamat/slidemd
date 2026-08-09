/**
 * Keyboard shortcuts registry.
 *
 * Single source of truth for all keyboard bindings and their display strings.
 */

const MAC_PATTERN = /Mac|iPhone|iPod|iPad/;

/**
 * @typedef {object} ShortcutBinding
 * @property {string} key
 * @property {{ cmdOrCtrl?: boolean, alt?: boolean, shift?: boolean }} [modifiers]
 * @property {boolean} [global] - When true, this binding works in every mode (e.g. command palette).
 */

/**
 * @typedef {object} Shortcut
 * @property {string} id
 * @property {string} name
 * @property {string} category
 * @property {ShortcutBinding[]} bindings
 */

/**
 * The central shortcuts registry.
 * @type {Shortcut[]}
 */
export const SHORTCUTS = [
  {
    id: "next",
    name: "Next slide",
    category: "Navigation",
    bindings: [{ key: "ArrowRight" }, { key: " " }, { key: "PageDown" }, { key: "ArrowDown" }],
  },
  {
    id: "prev",
    name: "Previous slide",
    category: "Navigation",
    bindings: [{ key: "ArrowLeft" }, { key: "PageUp" }, { key: "ArrowUp" }, { key: "Backspace" }],
  },
  {
    id: "first",
    name: "First slide",
    category: "Navigation",
    bindings: [{ key: "Home" }],
  },
  {
    id: "last",
    name: "Last slide",
    category: "Navigation",
    bindings: [{ key: "End" }],
  },
  {
    id: "goto",
    name: "Go to slide",
    category: "Navigation",
    bindings: [{ key: "g" }, { key: "G" }],
  },
  {
    id: "search",
    name: "Search slides",
    category: "Navigation",
    bindings: [
      { key: "/" },
      { key: "?" },
      { key: "f", modifiers: { cmdOrCtrl: true, shift: true } },
    ],
  },

  {
    id: "edit",
    name: "Toggle edit mode",
    category: "View",
    bindings: [{ key: "e" }, { key: "E" }],
  },
  {
    id: "viewer",
    name: "Open presenter view",
    category: "View",
    bindings: [{ key: "p" }, { key: "P" }],
  },
  {
    id: "fullscreen",
    name: "Toggle fullscreen",
    category: "View",
    bindings: [{ key: "f" }, { key: "F" }],
  },
  {
    id: "break",
    name: "Toggle break timer",
    category: "View",
    bindings: [{ key: "b" }, { key: "B" }],
  },
  {
    id: "theme",
    name: "Toggle app theme",
    category: "View",
    bindings: [{ key: "t" }, { key: "T" }],
  },
  {
    id: "reload",
    name: "Reload deck",
    category: "View",
    bindings: [{ key: "r" }, { key: "R" }],
  },

  {
    id: "save",
    name: "Save changes",
    category: "Edit",
    // Global: intercept Ctrl+S in every mode so the browser's own save
    // dialog never appears; the save action silently re-saves or falls back
    // to the app's picker flow when there is no destination yet.
    bindings: [{ key: "s", modifiers: { cmdOrCtrl: true }, global: true }],
  },
  {
    id: "newSlide",
    name: "New slide",
    category: "Edit",
    bindings: [{ key: "n", modifiers: { alt: true } }],
  },
  {
    id: "duplicateSlide",
    name: "Duplicate slide",
    category: "Edit",
    bindings: [{ key: "d", modifiers: { alt: true } }],
  },
  {
    id: "deleteSlide",
    name: "Delete slide",
    category: "Edit",
    bindings: [{ key: "Backspace", modifiers: { alt: true } }],
  },
  {
    id: "insertImage",
    name: "Insert image",
    category: "Edit",
    bindings: [{ key: "i", modifiers: { alt: true } }],
  },
  {
    id: "insertText",
    name: "Insert text block",
    category: "Edit",
    bindings: [{ key: "t", modifiers: { alt: true } }],
  },
  {
    id: "openLayout",
    name: "Open layout picker",
    category: "Edit",
    bindings: [{ key: "l", modifiers: { alt: true } }],
  },
  {
    id: "toggleMermaid",
    name: "Toggle Mermaid helper",
    category: "Edit",
    bindings: [{ key: "m", modifiers: { alt: true } }],
  },
  {
    id: "adjustColumns",
    name: "Adjust columns",
    category: "Edit",
    bindings: [{ key: "a", modifiers: { alt: true } }],
  },
  {
    id: "slideTheme",
    name: "Toggle slide theme",
    category: "Edit",
    bindings: [{ key: "t", modifiers: { alt: true, shift: true } }],
  },
  {
    id: "styles",
    name: "Toggle slide styles",
    category: "Edit",
    bindings: [{ key: "s", modifiers: { alt: true } }],
  },
  {
    id: "moveSlideUp",
    name: "Move slide up",
    category: "Edit",
    bindings: [{ key: "ArrowUp", modifiers: { alt: true, shift: true } }],
  },
  {
    id: "moveSlideDown",
    name: "Move slide down",
    category: "Edit",
    bindings: [{ key: "ArrowDown", modifiers: { alt: true, shift: true } }],
  },
  {
    id: "undo",
    name: "Undo",
    category: "Edit",
    bindings: [{ key: "z", modifiers: { cmdOrCtrl: true } }],
  },
  {
    id: "redo",
    name: "Redo",
    category: "Edit",
    bindings: [
      { key: "z", modifiers: { cmdOrCtrl: true, shift: true } },
      { key: "y", modifiers: { cmdOrCtrl: true } },
    ],
  },
  {
    id: "commandPalette",
    name: "Open command palette",
    category: "View",
    bindings: [{ key: "k", modifiers: { cmdOrCtrl: true }, global: true }],
  },
];

const MAC_KEY_LABELS = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Backspace: "⌫",
  " ": "Space",
  PageUp: "PgUp",
  PageDown: "PgDn",
};

const WIN_KEY_LABELS = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Backspace: "Backspace",
  " ": "Space",
  PageUp: "PageUp",
  PageDown: "PageDown",
};

const MAC_MODIFIERS = { cmdOrCtrl: "⌘", alt: "⌥", shift: "⇧" };
const WIN_MODIFIERS = { cmdOrCtrl: "Ctrl", alt: "Alt", shift: "Shift" };

export function isMac() {
  return MAC_PATTERN.test(navigator.userAgent);
}

/**
 * Format a single binding for display.
 * @param {ShortcutBinding} binding
 * @param {"mac" | "win" | null} [platform]
 * @returns {string}
 */
export function formatBinding(binding, platform = null) {
  const useMac = platform === "mac" || (platform === null && isMac());
  const modLabels = useMac ? MAC_MODIFIERS : WIN_MODIFIERS;
  const keyLabels = useMac ? MAC_KEY_LABELS : WIN_KEY_LABELS;
  const joiner = useMac ? "" : "+";

  const parts = [];
  const m = binding.modifiers || {};
  if (m.cmdOrCtrl) parts.push(modLabels.cmdOrCtrl);
  if (m.alt) parts.push(modLabels.alt);
  if (m.shift) parts.push(modLabels.shift);

  const key =
    binding.key.length === 1 ? binding.key.toUpperCase() : (keyLabels[binding.key] ?? binding.key);
  parts.push(key);

  return parts.join(joiner);
}

/**
 * Format a shortcut by id.
 * @param {string} id
 * @param {{ all?: boolean, platform?: "mac" | "win" }} [opts]
 * @returns {string}
 */
export function formatShortcut(id, opts = {}) {
  const shortcut = SHORTCUTS.find((s) => s.id === id);
  if (!shortcut) return "";
  const { all = false, platform = null } = opts;
  if (all) {
    return shortcut.bindings.map((b) => formatBinding(b, platform)).join(" / ");
  }
  const binding = shortcut.bindings[0];
  return binding ? formatBinding(binding, platform) : "";
}

/**
 * @param {string} id
 * @returns {Shortcut | undefined}
 */
export function getShortcutById(id) {
  return SHORTCUTS.find((s) => s.id === id);
}

/**
 * @param {string} category
 * @returns {Shortcut[]}
 */
export function getShortcutsForCategory(category) {
  return SHORTCUTS.filter((s) => s.category === category);
}
