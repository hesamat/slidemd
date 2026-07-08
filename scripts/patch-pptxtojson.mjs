/**
 * Postinstall script: patches pptxtojson to preserve the start attribute
 * on <ol> elements. PptxToJSON drops this attribute, which breaks ordered
 * lists that begin mid-sequence (e.g. items 5-7 on a slide where 1-4
 * appeared previously).
 *
 * The patch is a single string replacement in the minified dist file.
 * Run automatically via "postinstall" in package.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = join(__dirname, "..", "node_modules", "pptxtojson", "dist", "index.js");

const BEFORE = `void 0===h[_]?(i+="<".concat(w,">"),h[_]=w):h[_]!==w&&(i+="</".concat(h[_],">"),i+="<".concat(w,">"),h[_]=w),i+='<li><p style="'.concat(k,'">')}`;

const AFTER = `var _sa="";if(w==="ol"&&p["a:pPr"]&&p["a:pPr"]["a:buAutoNum"]&&p["a:pPr"]["a:buAutoNum"].attrs&&p["a:pPr"]["a:buAutoNum"].attrs.start){_sa=" start=\\""+p["a:pPr"]["a:buAutoNum"].attrs.start+"\\""}void 0===h[_]?(i+="<".concat(w).concat(_sa,">"),h[_]=w):h[_]!==w&&(i+="</".concat(h[_],">"),i+="<".concat(w).concat(_sa,">"),h[_]=w),i+='<li><p style="'.concat(k,'">')}`;

try {
  const code = readFileSync(target, "utf8");
  if (code.includes(BEFORE)) {
    writeFileSync(target, code.replace(BEFORE, AFTER), "utf8");
    console.log("pptxtojson patched: <ol> start attribute preserved");
  } else if (code.includes(AFTER)) {
    // Already patched
  } else {
    console.warn("pptxtojson patch target not found – skip");
  }
} catch {
  // Dependency not installed yet (e.g. during first npm install)
}
