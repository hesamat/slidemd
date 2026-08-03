/**
 * LayoutData
 * Manages layout templates, descriptions, and grid template data.
 * Provides access to layout configuration without UI concerns.
 * Built-in presets are defined in layouts.json; user-created custom
 * layouts are persisted in localStorage.
 */

import { escapeHtml } from "../core/utils.js";
import LAYOUTS from "./layouts.json" with { type: "json" };

const STORAGE_KEY = "webdeck:custom-layouts";
const HIDDEN_PRESETS = new Set([
  "default",
  "header-two-column",
  "sidebar-content",
  "content-sidebar",
]);

export class LayoutData {
  static _customMap = null;

  static _loadCustomLayouts() {
    if (typeof localStorage === "undefined") return {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  static _getCustomMap() {
    if (this._customMap === null) {
      this._customMap = this._loadCustomLayouts();
    }
    return this._customMap;
  }

  static _saveCustomLayouts(map) {
    if (typeof localStorage === "undefined") return;
    this._customMap = map;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
      // Ignore localStorage write failures (e.g. quota exceeded, private mode).
    }
  }

  static _normalizeName(name) {
    return String(name || "")
      .trim()
      .toLowerCase();
  }

  /**
   * Check whether a name is already used by a built-in preset.
   */
  static isBuiltIn(name) {
    return this._normalizeName(name) in LAYOUTS.layouts;
  }

  /**
   * Get all user-defined custom layout names.
   */
  static getAllCustomLayoutNames() {
    return Object.keys(this._getCustomMap()).sort();
  }

  /**
   * Get the grid template for a custom layout, or null if it does not exist.
   */
  static getCustomLayout(name) {
    const key = this._normalizeName(name);
    return key ? this._getCustomMap()[key] || null : null;
  }

  /**
   * Save (or overwrite) a user-defined custom layout in localStorage.
   * Rejects built-in preset names so users cannot shadow them.
   */
  static setCustomLayout(name, gridTemplate) {
    const key = this._normalizeName(name);
    if (!key || this.isBuiltIn(key)) return false;
    const map = this._getCustomMap();
    map[key] = String(gridTemplate || "").trim();
    this._saveCustomLayouts(map);
    return true;
  }

  /**
   * Delete a user-defined custom layout.
   */
  static deleteCustomLayout(name) {
    const key = this._normalizeName(name);
    const map = this._getCustomMap();
    delete map[key];
    this._saveCustomLayouts(map);
  }

  /**
   * Get the markdown template for a layout.
   * For built-in presets the stored template is returned;
   * for custom layouts a template is generated from the area names;
   * unknown layouts fall back to the default template.
   */
  static getTemplate(layoutName) {
    const jsonTemplate = LAYOUTS.layouts[layoutName]?.template;
    if (jsonTemplate) return jsonTemplate;

    if (this.getGridTemplate(layoutName)) {
      const areas = this.getAreaNames(layoutName);
      const lines = [`layout: ${layoutName}`];
      if (areas.includes("title")) {
        lines.push(`\n@title\n\n# Your Title Here`);
      } else if (areas.includes("header")) {
        lines.push(`\n@header\n\n## Slide Title`);
      }
      for (const area of areas) {
        if (area === "title" || area === "header" || area === "footer") continue;
        const label = area.replace(/[-_]/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
        lines.push(`\n@${area}\n\n### ${label}\n\nAdd your content here`);
      }
      if (areas.includes("footer")) {
        lines.push(`\n@footer\n\nAdditional context or reference`);
      }
      return lines.join("");
    }

    return LAYOUTS.layouts.default?.template || "";
  }

  /**
   * Get all available layout names (excluding default + hidden presets).
   * Custom user layouts are appended after built-in presets.
   */
  static getAllLayouts() {
    const presetNames = Object.keys(LAYOUTS.layouts).filter((key) => !HIDDEN_PRESETS.has(key));
    const custom = this.getAllCustomLayoutNames().filter((name) => !LAYOUTS.layouts[name]);
    return [...presetNames, ...custom];
  }

  /**
   * Get layout description.
   */
  static getDescription(layoutName) {
    const key = this._normalizeName(layoutName);
    return (
      LAYOUTS.layouts[key]?.description || (this.getCustomLayout(key) ? "Custom user layout" : "")
    );
  }

  /**
   * Get layout preview HTML for the layout picker.
   * For custom layouts a preview is generated from the area names.
   */
  static getPreviewHTML(layoutName) {
    const jsonPreview = LAYOUTS.layouts[layoutName]?.preview;
    if (jsonPreview) return jsonPreview;

    const areas = this.getAreaNames(layoutName);
    if (areas.length === 0) return '<div style="grid-area: main"></div>';
    return areas.map((area) => `<div style="grid-area: ${escapeHtml(area)}"></div>`).join("");
  }

  /**
   * Get the grid template string for a layout.
   * Checks user-defined custom layouts first, then built-in presets.
   */
  static getGridTemplate(layoutName) {
    const key = this._normalizeName(layoutName);
    if (!key) return null;
    return this.getCustomLayout(key) || LAYOUTS.layouts[key]?.gridTemplate || null;
  }

  /**
   * Get ordered area names for a layout.
   */
  static getAreaNames(layoutName) {
    const gridTemplate = this.getGridTemplate(layoutName);
    if (!gridTemplate) return ["main"];

    const rowMatches = gridTemplate.match(/"[^"]*"|'[^']*'/g) || [];
    const areas = [];

    const areaNameRe = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
    for (const row of rowMatches) {
      const content = row.slice(1, -1);
      const names = content.split(/\s+/).filter(Boolean);
      for (const name of names) {
        // In CSS grid-template-areas, '.' means an empty cell.
        // Avoid generating a corresponding slide area for it.
        if (/^\.+$/.test(name)) continue;
        if (!areaNameRe.test(name)) continue;
        if (!areas.includes(name)) areas.push(name);
      }
    }

    return areas.length ? areas : ["main"];
  }

  /**
   * Get all layout presets as an object (for LayoutParser compatibility).
   */
  static getPresets() {
    return Object.fromEntries(
      Object.entries(LAYOUTS.layouts).map(([key, value]) => [key, value.gridTemplate]),
    );
  }

  /**
   * Format layout name for display (e.g., "two-column" -> "Two Column")
   */
  static formatLayoutName(layoutName) {
    return layoutName.replace("-", " ").replace(/\b\w/g, (l) => l.toUpperCase());
  }

  /**
   * Check if a layout exists (built-in or custom).
   */
  static hasLayout(layoutName) {
    const key = this._normalizeName(layoutName);
    return key in LAYOUTS.layouts || this.getCustomLayout(key) !== null;
  }

  /**
   * Get code font size for a layout (px), or 0 if not set.
   */
  static getCodeFontSize(layoutName) {
    return LAYOUTS.layouts[layoutName]?.codeFontSize || 0;
  }
}
