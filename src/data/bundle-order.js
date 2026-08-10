/**
 * Shared JS bundle order.
 *
 * Single source of truth for the order in which source files are concatenated
 * when producing a self-contained HTML export. The runtime HTML export path
 * (HtmlExportManager) fetches each file in this order and strips ESM syntax;
 * the build script (tools/build.mjs) currently relies on esbuild's dependency
 * resolution instead, but importing this constant keeps the two paths aligned
 * if the build script ever needs explicit ordering.
 *
 * Keep additions in sync with the import graph in deck.js. Files must appear
 * before any file that imports them so the concatenated IIFE sees each
 * definition before its first reference.
 */

export const JS_BUNDLE_ORDER = [
  // Core utilities and helpers
  "src/core/utils.js",
  "src/core/element-gatherer.js",
  "src/core/mermaid-config.js",
  "src/core/asset-loader.js",
  // Data loading and parsing
  "src/data/layout-data.js",
  "src/data/markdown-parser.js",
  "src/data/layout-parser.js",
  "src/data/deck-loader.js",
  // Renderer components
  "src/renderer/notification.js",
  "src/renderer/stage-scaler.js",
  "src/renderer/content-enhancer.js",
  "src/renderer/slide-renderer.js",
  "src/renderer/theme-manager.js",
  "src/renderer/print-manager.js",
  // Engine components
  "src/engine/keyboard-shortcuts.js",
  "src/engine/keyboard-handler.js",
  "src/engine/command-registry.js",
  "src/engine/deck-keyboard.js",
  "src/engine/wheel-handler.js",
  "src/engine/freeze-manager.js",
  "src/engine/role-manager.js",
  "src/engine/slide-search.js",
  "src/engine/slide-navigator.js",
  "src/engine/break-manager.js",
  "src/engine/reload-manager.js",
  "src/engine/deck-events.js",
  "src/engine/pptx-importer.js",
  "src/engine/presentation-creator.js",
  "src/engine/command-palette.js",
  "src/engine/deck-controller.js",
  // UI components
  "src/ui/ui-actions.js",
  "src/editor/ui/open-deck-modal.js",
  // Entry point
  "deck.js",
];
