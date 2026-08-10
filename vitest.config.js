import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.js"],
    environment: "node",
  },
  resolve: {
    // pptxtojson's package.json points "main" at a UMD bundle with no named
    // exports; point at the ESM build directly the way Vite does in dev.
    // Exact-match only, so any future pptxtojson subpath imports are not
    // rewritten.
    alias: [{ find: /^pptxtojson$/, replacement: "pptxtojson/dist/index.js" }],
  },
});
