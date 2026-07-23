import JSZip from "jszip";

async function blobToArrayBuffer(blob) {
  if (typeof blob === "string") {
    const response = await fetch(blob);
    return response.arrayBuffer();
  }
  return blob.arrayBuffer();
}

export class SmdHandler {
  /**
   * Extracts markdown and images from an .smd (ZIP) file.
   * @param {Blob|File|ArrayBuffer|Uint8Array} file
   * @returns {Promise<{markdown: string, images: Map<string, Blob>}>}
   */
  static async extractFromSmd(file) {
    let data;
    if (file instanceof Blob || (typeof File !== "undefined" && file instanceof File)) {
      data = await file.arrayBuffer();
    } else {
      data = file;
    }
    const zip = await JSZip.loadAsync(data);
    const mdFile = zip.file("deck.md");
    if (!mdFile) {
      throw new Error("Invalid .smd file: missing deck.md");
    }
    const markdown = await mdFile.async("text");
    const images = new Map();
    const imagesFolder = zip.folder("images");
    if (imagesFolder) {
      const imageFiles = [];
      imagesFolder.forEach((path, entry) => {
        if (!entry.dir) {
          imageFiles.push(entry);
        }
      });
      for (const entry of imageFiles) {
        const arrayBuffer = await entry.async("arraybuffer");
        const blob = new Blob([arrayBuffer]);
        // entry.name is the full path from zip root (e.g., "images/icon.png"),
        // but we want just the filename relative to images/
        const name = entry.name.split("/").pop();
        images.set(`images/${name}`, blob);
      }
    }
    return { markdown, images };
  }

  /**
   * Creates an .smd (ZIP) blob from markdown and images.
   * Image files use STORE compression to avoid UI thread freezing.
   * @param {string} markdown
   * @param {Map<string, Blob>} images
   * @returns {Promise<Blob>}
   */
  static async buildSmd(markdown, images) {
    const zip = new JSZip();
    zip.file("deck.md", markdown);
    const imgFolder = zip.folder("images");
    for (const [relPath, blob] of images) {
      const fileName = relPath.replace(/^images\//, "");
      const arrayBuffer = await blobToArrayBuffer(blob);
      imgFolder.file(fileName, arrayBuffer, { compression: "STORE" });
    }
    const content = await zip.generateAsync({ type: "blob" });
    return content;
  }
}
