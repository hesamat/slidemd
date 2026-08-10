import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";

// Shared rules applied to every linted file. Language options (globals) are
// scoped per-path in the blocks below so browser-only APIs (document,
// localStorage, etc.) are not silently allowed in Node tooling.
const sharedRules = {
  "no-unused-vars": [
    "warn",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
    },
  ],
  "no-redeclare": "error",
  "no-constant-condition": "warn",
};

export default [
  js.configs.recommended,
  prettier,
  // Browser source: src/ and the deck entry point. Runs in the browser, so
  // browser + es2021 globals are available.
  {
    files: ["src/**/*.js", "deck.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    rules: sharedRules,
  },
  // Node tooling: build scripts, dev server, fixture generator, and root
  // config files (*.mjs). These run in Node, not the browser, so they get
  // Node globals only. They are ESM via "type": "module" in package.json.
  // Note: tools/pdf.mjs uses browser APIs (document, NodeFilter) inside
  // page.evaluate callbacks that execute in the browser context; those are
  // stringified function bodies, not Node-scope references, so scoping
  // browser globals out of the Node block does not produce false positives.
  {
    files: ["tools/**/*.mjs", "*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: sharedRules,
  },
  {
    ignores: ["dist/", "node_modules/", "decks/"],
  },
];
