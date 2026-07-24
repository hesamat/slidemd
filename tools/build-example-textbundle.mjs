/**
 * Rebuild docs/example.textbundle/ from its text.markdown + public images.
 * Run: node tools/build-example-textbundle.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

async function main() {
  const outDir = join(ROOT, "docs", "example.textbundle");
  const assetsDir = join(outDir, "assets");

  // Copy fresh images from public/
  const images = ["icon.png", "edit-mode.png"];
  for (const name of images) {
    const data = await readFile(join(ROOT, "public", name));
    await writeFile(join(assetsDir, name), data);
    console.log(`  ${name}: ${data.length} bytes`);
  }

  console.log(`Rebuilt ${outDir}`);
  console.log(`  assets/: ${images.length} images`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
