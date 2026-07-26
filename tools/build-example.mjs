/**
 * Rebuild docs/example/images/ from public/ images.
 * Run: node tools/build-example.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

async function main() {
  const imagesDir = join(ROOT, "docs", "example", "images");

  // Copy fresh images from public/
  const images = ["icon.png", "edit-mode.png"];
  for (const name of images) {
    const data = await readFile(join(ROOT, "public", name));
    await writeFile(join(imagesDir, name), data);
    console.log(`  ${name}: ${data.length} bytes`);
  }

  console.log(`\nRebuilt docs/example/images/`);
  console.log(`  ${images.length} images`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
