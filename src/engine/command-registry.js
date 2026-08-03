/**
 * Command Registry
 *
 * Builds the command palette list from the central keyboard-shortcuts
 * registry. It no longer stores key bindings; those come from
 * keyboard-shortcuts.js.
 */

import { SHORTCUTS, formatShortcut } from "./keyboard-shortcuts.js";

/**
 * @typedef {Object} CommandDefinition
 * @property {string} id - Action id, also used to look up the action function.
 * @property {string} name - Human-readable name shown in the command palette.
 * @property {string} category - Category tab name.
 */

const PALETTE_EXTRAS = [
  { id: "print", name: "Print to PDF", category: "Export" },
  { id: "htmlExport", name: "Export HTML", category: "Export" },
  { id: "textpackExport", name: "Export Textpack", category: "Export" },
];

const IS_ENABLED = {
  edit: (ctx) => ctx.roleManager?.isEditorWindow,
  viewer: (ctx) => ctx.roleManager?.isEditorWindow && !ctx.isEditMode(),
  break: (ctx) => ctx.roleManager?.isEditorWindow && !ctx.isEditMode(),
  reload: (ctx) => ctx.roleManager?.isEditorWindow,
  save: (ctx) => ctx.isEditMode(),
  newSlide: (ctx) => ctx.isEditMode(),
  duplicateSlide: (ctx) => ctx.isEditMode(),
  deleteSlide: (ctx) => ctx.isEditMode(),
  insertImage: (ctx) => ctx.isEditMode(),
  insertText: (ctx) => ctx.isEditMode(),
  openLayout: (ctx) => ctx.isEditMode(),
  toggleMermaid: (ctx) => ctx.isEditMode(),
  adjustColumns: (ctx) => ctx.isEditMode(),
  slideTheme: (ctx) => ctx.isEditMode(),
  styles: (ctx) => ctx.isEditMode(),
  moveSlideUp: (ctx) => ctx.isEditMode(),
  moveSlideDown: (ctx) => ctx.isEditMode(),
  undo: (ctx) => ctx.isEditMode(),
  redo: (ctx) => ctx.isEditMode(),
};

/** @type {CommandDefinition[]} */
export const COMMANDS = [
  ...SHORTCUTS.filter((s) => s.id !== "commandPalette").map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
  })),
  ...PALETTE_EXTRAS,
];

function getShortcutString(id) {
  const raw = formatShortcut(id, { all: true });
  if (!raw) return "";
  // Remove duplicate display strings (e.g. "g" and "G" both render as "G").
  const parts = [];
  const seen = new Set();
  for (const part of raw.split(" / ")) {
    if (!seen.has(part)) {
      seen.add(part);
      parts.push(part);
    }
  }
  return parts.join(" / ");
}

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
    shortcut: getShortcutString(cmd.id),
    category: cmd.category,
    isEnabled: IS_ENABLED[cmd.id] ? () => IS_ENABLED[cmd.id](ctx) : undefined,
    action: actions[cmd.id],
  })).filter((cmd) => typeof cmd.action === "function");
}
