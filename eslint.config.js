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
  // Node tooling, root config files, and Playwright tests: build scripts, dev
  // server, fixture generator, root config (*.mjs and *.js such as
  // eslint.config.js and vitest.config.js), and e2e/**/*.js. These run in
  // Node, not the browser, so they get Node globals only. They are ESM via
  // "type": "module" in package.json.
  // Note: tools/pdf.mjs uses browser APIs (document, NodeFilter, etc.) inside
  // page.evaluate callbacks. ESLint parses those as ordinary function
  // expressions in Node scope, so the file declares them via a file-level
  // /* global */ directive. Follow the same pattern when adding new Node
  // tooling that calls page.evaluate or similar browser-context callbacks.
  {
    files: ["tools/**/*.mjs", "*.mjs", "*.js", "e2e/**/*.js"],
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
