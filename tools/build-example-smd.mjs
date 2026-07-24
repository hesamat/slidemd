/**
 * Rebuild docs/example.smd from its internal deck.md + public images.
 * Run: node tools/build-example-smd.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

async function build() {
  const smdPath = join(ROOT, "docs", "example.smd");
  const smdBuf = await readFile(smdPath);
  const zip = await JSZip.loadAsync(smdBuf);

  const mdFile = zip.file("deck.md");
  if (!mdFile) {
    throw new Error("Invalid .smd file: missing deck.md");
  }
  const markdown = await mdFile.async("text");

  const outZip = new JSZip();
  outZip.file("deck.md", markdown);

  const imgFolder = outZip.folder("images");
  const images = ["icon.png", "edit-mode.png"];
  for (const name of images) {
    const data = await readFile(join(ROOT, "public", name));
    imgFolder.file(name, data, { compression: "STORE" });
  }

  const content = await outZip.generateAsync({ type: "nodebuffer" });
  await writeFile(smdPath, content);
  console.log(`Rebuilt ${smdPath} (${content.length} bytes)`);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
