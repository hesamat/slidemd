/**
 * Build docs/example.smd from docs/example.md + public images.
 * Run: node tools/build-example-smd.mjs
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

async function build() {
  const markdown = await readFile(join(ROOT, "docs", "example.md"), "utf-8");

  const zip = new JSZip();
  zip.file("deck.md", markdown);

  const imgFolder = zip.folder("images");

  const images = ["icon.png", "edit-mode.png"];
  for (const name of images) {
    const data = await readFile(join(ROOT, "public", name));
    imgFolder.file(name, data, { compression: "STORE" });
  }

  const content = await zip.generateAsync({ type: "nodebuffer" });
  const outPath = join(ROOT, "docs", "example.smd");
  await writeFile(outPath, content);
  console.log(`Created ${outPath} (${content.length} bytes)`);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
