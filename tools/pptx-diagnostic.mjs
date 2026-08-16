/**
 * Developer diagnostic tool for the PPTX diagram crop pipeline.
 *
 * NOT part of the app or test suite.  Starts a Vite server, imports a real
 * PPTX in a headless Chromium, and writes the diagram crop diagnostics
 * (full-slide renders, final crops, font availability, shape matching) to
 * /tmp/pptx-diagnostic.  Used to debug the high-fidelity crop path in
 * pptx-diagram-cropper.js against real decks.
 *
 * Usage:
 *   node tools/pptx-diagnostic.mjs [path-to.pptx] [slide-index]
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

/* global window, document */

const pptxPath =
  process.argv[2] ||
  "/home/hesam/Documents/Projects/COMP-1510-202630/Lecture Slides/COMP 1510 DTC 202630 Week 03 Sequence Selection Repetition Indirection.pptx";
const slideIndex = parseInt(process.argv[3] ?? "7", 10);
const outDir = "/tmp/pptx-diagnostic";
fs.mkdirSync(outDir, { recursive: true });

const pptxBuffer = fs.readFileSync(pptxPath);
const pptxBase64 = pptxBuffer.toString("base64");

const projectRoot = path.resolve(import.meta.dirname, "..");
const server = spawn("npx", ["vite", "--port", "5174"], {
  cwd: projectRoot,
  stdio: "pipe",
});

await new Promise((resolve) => {
  server.stdout.on("data", (d) => {
    const s = d.toString();
    if (s.includes("Local:") || s.includes("5174")) resolve();
  });
  setTimeout(resolve, 10000);
});

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("console", (msg) => console.log("[browser]", msg.text()));
page.on("pageerror", (err) => console.error("[browser error]", err.message));
await page.goto("http://localhost:5174", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

const diagnostics = await page.evaluate(
  async ({ base64, idx }) => {
    window.__pptxCropCollectDiagnostics = true;
    window.__pptxCropDiagnostics = [];

    const { PptxExtractor } = await import(`/src/data/pptx-extractor.js?t=${Date.now()}`);

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    // Only process up to the requested slide; this avoids walking 100+ slides.
    const result = await PptxExtractor.extract(bytes.buffer, idx + 1);

    if (idx >= result.slides.length) {
      return { error: "Slide index out of range", slideIndex: idx, slideCount: result.slides.length };
    }

    const slide = result.slides[idx];
    const preview = slide.elements.map((el) => ({
      type: el.type,
      content: (el.content || "").slice(0, 60),
      shapType: el.shapType,
      left: el.left,
      top: el.top,
      width: el.width,
      height: el.height,
      base64: el.base64 ? el.base64.slice(0, 100) + "..." : null,
      base64Length: el.base64 ? el.base64.length : null,
    }));

    // Find the rendered diagram image for this specific slide.
    const slideImage = slide.elements.find((el) => el.type === "image" && el.base64);

    // Check which fonts are actually available in the browser.
    const availableFonts = [];
    if (document.fonts && document.fonts.check) {
      for (const f of ["Jost", "Carlito", "Caladea", "Open Sans", "Verdana"]) {
        availableFonts.push({
          font: f,
          w400: document.fonts.check(`400 16px "${f}"`),
          w600: document.fonts.check(`600 16px "${f}"`),
          w700: document.fonts.check(`700 16px "${f}"`),
        });
      }
    }

    const cropDiagnostics = window.__pptxCropDiagnostics || [];

    return { preview, slideIndex: idx, slideImageBase64: slideImage ? slideImage.base64 : null, availableFonts, cropDiagnostics };
  },
  { base64: pptxBase64, idx: slideIndex },
);

await browser.close();
server.kill();

if (diagnostics.error) {
  console.error("Diagnostic error:", diagnostics.error);
  process.exit(1);
}

function saveDataUrl(name, dataUrl) {
  if (!dataUrl) return;
  const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(base64, "base64"));
}

function saveBase64(name, b64) {
  if (!b64) return;
  // Strip data URL prefix if present.
  const cleaned = b64.replace(/^data:[^;]+;base64,/, "");
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(cleaned, "base64"));
}

// Save the specific requested slide's rendered diagram image.
if (diagnostics.slideImageBase64) {
  saveBase64("slide-diagram", diagnostics.slideImageBase64);
}

// Report which fonts are actually available.
if (diagnostics.availableFonts) {
  console.log("=== Font availability ===");
  for (const f of diagnostics.availableFonts) {
    console.log(`  ${f.font}: 400=${f.w400 ? "Y" : "N"} 600=${f.w600 ? "Y" : "N"} 700=${f.w700 ? "Y" : "N"}`);
  }
}

// Save crop diagnostics (one set per diagram rendered across all slides).
let targetIndex = -1;
let targetArea = 0;
for (let i = 0; i < (diagnostics.cropDiagnostics || []).length; i++) {
  const cd = diagnostics.cropDiagnostics[i];
  const prefix = `crop-${i}`;
  saveDataUrl(`${prefix}-final`, cd.finalCrop);
  saveDataUrl(`${prefix}-full-before-hide`, cd.fullBeforeHide);
  saveDataUrl(`${prefix}-full-after-hide`, cd.fullAfterHide);
  const cropJson = { ...cd };
  delete cropJson.fullBeforeHide;
  delete cropJson.fullAfterHide;
  delete cropJson.finalCrop;
  fs.writeFileSync(path.join(outDir, `${prefix}.json`), JSON.stringify(cropJson, null, 2));

  const area = (cd.cropRect?.w || 0) * (cd.cropRect?.h || 0);
  if (area > targetArea) {
    targetArea = area;
    targetIndex = i;
  }
}

if (targetIndex >= 0) {
  const cd = diagnostics.cropDiagnostics[targetIndex];
  saveDataUrl("final", cd.finalCrop);
  saveDataUrl("full-before-hide", cd.fullBeforeHide);
  saveDataUrl("full-after-hide", cd.fullAfterHide);
  fs.writeFileSync(path.join(outDir, "diagnostics.json"), JSON.stringify(cd, null, 2));
}

console.log("Diagnostics saved to", outDir);
console.log("Crop diagnostics count:", (diagnostics.cropDiagnostics || []).length);
if (targetIndex >= 0) console.log("Largest crop saved as final.png, full-before-hide.png, full-after-hide.png");
