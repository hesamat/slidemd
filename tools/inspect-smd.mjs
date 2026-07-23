import { readFile } from "node:fs/promises";
import { SmdHandler } from "../src/core/smd-handler.js";

const data = await readFile("docs/example.smd");
const { markdown, images } = await SmdHandler.extractFromSmd(data);

console.log("Markdown length:", markdown.length);
console.log("Images:", [...images.keys()]);
for (const [path, blob] of images) {
  console.log(`  ${path}: ${blob.size} bytes`);
}
