import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default [
  js.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    rules: {
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
    },
  },
  // Node tooling: build scripts, dev server, fixture generator, and root
  // config files (*.mjs). These run in Node, not the browser, so they get
  // Node globals. They are ESM via "type": "module" in package.json.
  {
    files: ["tools/**/*.mjs", "*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
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
    },
  },
  {
    ignores: ["dist/", "node_modules/", "decks/"],
  },
];
