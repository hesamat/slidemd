// @vitest-environment jsdom
// Quick layout debug script - run with: npx vitest run tools/layout-debug.mjs
import { describe, it } from "vitest";
import { PptxExtractor } from "../src/data/pptx-extractor.js";
import { inferLayout, findDominantImages, partitionByAreaOverlap } from "../src/data/pptx-layout-inference.js";
import { ELEMENT_TYPES } from "../src/data/pptx-slide-config.js";
import fs from "fs";

const file = process.env.LAYOUT_DEBUG_FILE;
const slideIdx = parseInt(process.env.LAYOUT_DEBUG_SLIDE || "0", 10);

describe.skipIf(!file)("layout debug", () => {
  it("prints layout inference details", async () => {
    const buf = fs.readFileSync(file);
    const arrayBuffer = new Uint8Array(buf).buffer;
    const result = await PptxExtractor.extract(arrayBuffer);
    const slide = result.slides[slideIdx];
    const slideWidth = result.slideWidth || 960;
    const slideHeight = result.slideHeight || 540;
    console.log(`Slide ${slideIdx}: ${slideWidth}x${slideHeight}`);

    const allElements = slide.elements.filter(
      (el) =>
        el.placeholderType !== ELEMENT_TYPES.FOOTER &&
        ((el.type === ELEMENT_TYPES.TEXT && el.content?.trim()) ||
          (el.type === ELEMENT_TYPES.IMAGE && el.ref) ||
          (el.type === ELEMENT_TYPES.TABLE && el.rows?.length) ||
          el.type === ELEMENT_TYPES.CHART ||
          el.type === ELEMENT_TYPES.DIAGRAM),
    );

    console.log(`\nAll elements (${allElements.length}):`);
    for (const el of allElements) {
      const part = partitionByAreaOverlap(el, slideWidth, slideHeight);
      console.log(
        `  type=${el.type} L=${el.left?.toFixed(0)} T=${el.top?.toFixed(0)} W=${el.width?.toFixed(0)} H=${el.height?.toFixed(0)} part=${part} content="${(el.content || "").slice(0, 40)}"`,
      );
    }

    const textElements = slide.elements.filter(
      (el) => el.type === ELEMENT_TYPES.TEXT && el.content?.trim(),
    );
    const dominantImages = findDominantImages(allElements, slideWidth, slideHeight);
    console.log(`\nDominant images (${dominantImages.length}):`);
    for (const img of dominantImages) {
      console.log(
        `  L=${img.left?.toFixed(0)} T=${img.top?.toFixed(0)} W=${img.width?.toFixed(0)} H=${img.height?.toFixed(0)} ref=${img.ref}`,
      );
    }

    const hasMedia = allElements.some((el) => el.type !== ELEMENT_TYPES.TEXT);
    const layout = inferLayout(
      textElements,
      slideWidth,
      slideHeight,
      hasMedia,
      allElements,
      dominantImages,
      slideIdx,
    );
    console.log(`\ninferLayout result: ${layout.spec}`);

    // Check overlap
    if (dominantImages.length >= 2) {
      const [img1, img2] = dominantImages;
      const overlap = Math.max(
        0,
        Math.min(img1.left + img1.width, img2.left + img2.width) -
          Math.max(img1.left, img2.left),
      );
      const minW = Math.min(img1.width, img2.width);
      console.log(`\nOverlap: ${overlap.toFixed(0)} vs minW*0.3=${(minW * 0.3).toFixed(0)}`);
    }
  });
});
