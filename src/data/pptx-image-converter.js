/**
 * Image format converters for PPTX extraction.
 *
 * Converts EMF/WMF and TIFF images to PNG data URLs that
 * browsers can render natively.
 */

/**
 * Convert EMF/WMF images to PNG data URLs using emf-converter.
 * Modifies slides and images arrays in place.
 * @param {import('./pptx-extractor.js').ExtractedSlide[]} slides
 * @param {import('./pptx-extractor.js').ExtractedImage[]} images
 * @returns {Promise<void>}
 */
export async function convertEmfImages(slides, images) {
  let emfConverter;
  try {
    emfConverter = await import("emf-converter");
  } catch (err) {
    console.warn("emf-converter not available, skipping EMF conversion:", err);
    return;
  }

  const { convertEmfToDataUrl, convertWmfToDataUrl } = emfConverter;

  for (const img of images) {
    if (img.mimeType !== "image/emf" && img.mimeType !== "image/wmf") continue;
    try {
      const raw = img.base64
        .replace(/^data:[^;]+;base64,/, "")
        .replace(/\s+/g, "")
        .replace(/-/g, "+")
        .replace(/_/g, "/");
      const pad = raw.length % 4;
      const padded = pad ? raw + "=".repeat(4 - pad) : raw;
      const binary = atob(padded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const convert = img.mimeType === "image/emf" ? convertEmfToDataUrl : convertWmfToDataUrl;
      let dataUrl = await convert(bytes.buffer, 1920, 1080);

      if (!dataUrl) {
        console.warn(
          `EMF conversion returned null for ${img.ref} (size: ${bytes.length} bytes) — browser may lack Canvas API or file is invalid`,
        );
        continue;
      }

      dataUrl = (await trimTransparentMargins(dataUrl)) ?? dataUrl;

      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
      img.base64 = base64;
      img.mimeType = "image/png";

      for (const slide of slides) {
        for (const el of slide.elements) {
          if (el.type === "image" && el.ref === img.ref && el.mimeType !== "image/png") {
            el.base64 = base64;
            el.mimeType = "image/png";
          }
        }
      }
    } catch (err) {
      console.warn(`Could not convert ${img.ref} from ${img.mimeType}:`, err);
    }
  }
}

/**
 * Convert TIFF images to PNG data URLs using utif2.
 * Browsers cannot display TIFF natively, so we decode to RGBA and
 * render via Canvas to produce PNG data URLs.
 * @param {import('./pptx-extractor.js').ExtractedSlide[]} slides
 * @param {import('./pptx-extractor.js').ExtractedImage[]} images
 * @returns {Promise<void>}
 */
export async function convertTiffImages(slides, images) {
  let Utif;
  try {
    Utif = await import("utif2");
  } catch (err) {
    console.warn("utif2 not available, skipping TIFF conversion:", err);
    return;
  }

  for (const img of images) {
    if (img.mimeType !== "image/tiff") continue;
    try {
      const raw = img.base64
        .replace(/^data:[^;]+;base64,/, "")
        .replace(/\s+/g, "")
        .replace(/-/g, "+")
        .replace(/_/g, "/");
      const pad = raw.length % 4;
      const padded = pad ? raw + "=".repeat(4 - pad) : raw;
      const binary = atob(padded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const ifds = Utif.decode(bytes.buffer);
      if (!ifds || ifds.length === 0) {
        console.warn(`TIFF decode returned no pages for ${img.ref}`);
        continue;
      }
      const firstPage = ifds[0];
      Utif.decodeImage(bytes.buffer, firstPage);

      const w = firstPage.width;
      const h = firstPage.height;

      if (typeof document === "undefined" || !document.createElement) {
        console.warn("Canvas API not available, skipping TIFF conversion for", img.ref);
        continue;
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      const rgba = new Uint8Array(firstPage.data);
      const imageData = ctx.createImageData(w, h);
      imageData.data.set(rgba);
      ctx.putImageData(imageData, 0, 0);

      const dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");

      img.base64 = base64;
      img.mimeType = "image/png";

      for (const slide of slides) {
        for (const el of slide.elements) {
          if (el.type === "image" && el.ref === img.ref && el.mimeType !== "image/png") {
            el.base64 = base64;
            el.mimeType = "image/png";
          }
        }
      }
    } catch (err) {
      console.warn(`Could not convert ${img.ref} from TIFF:`, err);
    }
  }
}

/**
 * Trim transparent margins around the visible content of a PNG data URL.
 * @param {string} dataUrl - PNG data URL to trim.
 * @returns {Promise<string|null>}
 */
async function trimTransparentMargins(dataUrl) {
  if (typeof document === "undefined" || !document.createElement) return null;
  const ALPHA_THRESHOLD = 10;
  const PAD_THRESHOLD_PCT = 1;

  try {
    const bitmap = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = (e) => reject(new Error("decode failed: " + String(e)));
      image.src = dataUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    const { data, width: cw, height: ch } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let minX = cw;
    let minY = ch;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        if (data[(y * cw + x) * 4 + 3] >= ALPHA_THRESHOLD) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;

    const minPadX = Math.ceil(cw * (PAD_THRESHOLD_PCT / 100));
    const minPadY = Math.ceil(ch * (PAD_THRESHOLD_PCT / 100));
    const hasBorder =
      minX >= minPadX || minY >= minPadY || cw - 1 - maxX >= minPadX || ch - 1 - maxY >= minPadY;
    if (!hasBorder) return null;

    const trimmedW = maxX - minX + 1;
    const trimmedH = maxY - minY + 1;
    const cropped = document.createElement("canvas");
    cropped.width = trimmedW;
    cropped.height = trimmedH;
    cropped
      .getContext("2d")
      .drawImage(canvas, minX, minY, trimmedW, trimmedH, 0, 0, trimmedW, trimmedH);
    return cropped.toDataURL("image/png");
  } catch (err) {
    console.warn("trimTransparentMargins failed:", err);
    return null;
  }
}
