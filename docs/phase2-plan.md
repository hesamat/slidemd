# Phase 2: Build Modernization Plan

## Current State

`tools/build.mjs` (755 lines) does everything manually:
- Regex-based ESM stripping (`stripEsmSyntax`) — fragile, 100+ lines
- Manual CSS import resolution
- Manual image inlining as data URIs
- Manual KaTeX font inlining
- Manual Prism component detection and bundling
- Terser minification
- HTML manipulation (remove presenter elements, inject scripts)

## Target State

Use esbuild for JS bundling and minification. Keep everything else as-is.

## What esbuild Handles

1. **JS bundling** — Replace `buildBundleJs()` + `stripEsmSyntax()` with `esbuild.build()`
2. **Minification** — Replace `terser` with esbuild's built-in minifier
3. **Tree shaking** — esbuild automatically removes unused code

## What Stays the Same

1. CSS import resolution (`resolveCssImports`)
2. Image inlining (`inlineLocalImagesInHtml`, `inlineImagesInDeck`)
3. KaTeX font inlining (`inlineKatexFonts`)
4. Prism component detection (`detectPrismComponentsFromDeck`)
5. Vendor CSS/JS assembly
6. HTML manipulation (remove presenter elements, inject scripts)
7. Mermaid CDN injection
8. Deck markdown parsing

## Implementation Steps

### Step 1: Install esbuild
```bash
npm install --save-dev esbuild
```

### Step 2: Create esbuild config
Create `tools/esbuild.config.mjs`:
```javascript
import { build } from 'esbuild';

await build({
  entryPoints: ['deck.js'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/deck.bundle.js',
  minify: true,
  // Don't externalize anything — bundle everything
});
```

### Step 3: Update build.mjs
- Remove `buildBundleJs()` function (lines 577-619)
- Remove `stripEsmSyntax()` function (lines 438-575)
- Remove `terser` import and usage
- Add esbuild import and call
- Keep all other logic unchanged

### Step 4: Handle generation modules
The current build excludes `src/generation/` from the bundle (it's not in the `order` array). With esbuild, we need to either:
- **Option A**: Add generation modules to the bundle (makes dist builds fully featured)
- **Option B**: Keep them excluded by marking them as external (current behavior)
- **Recommended: Option A** — Include generation in dist builds since users may want AI features

### Step 5: Verify
- Run `npm run build` and verify output
- Run `npm run pdf` and verify PDF generation
- Test the dist HTML file manually
- Run all quality gates: lint, format, test, build

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| esbuild handles ESM differently than our regex | Test thoroughly, compare output |
| Generation modules have dynamic imports | esbuild handles these well |
| Mermaid CDN injection still needed | Keep as post-processing step |
| CSS inlining unchanged | No risk |

## Estimated Effort

- Install + config: 0.5 day
- Update build.mjs: 1-2 days
- Test and fix issues: 1 day
- **Total: 2-3 days**
