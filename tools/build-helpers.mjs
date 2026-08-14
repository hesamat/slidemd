import fs from "node:fs";
import path from "node:path";

/**
 * Return whether `resolved` is contained within `allowedDir`.
 * Both paths are resolved to absolute form before comparison.
 */
function isWithinAllowed(resolved, allowedDir) {
  const relative = path.relative(allowedDir, resolved);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Read a text file if it exists and is contained within an allowed directory.
 *
 * @param {string} filePath
 * @param {string} [allowedDir=process.cwd()]
 * @returns {string}
 */
export function readTextIfExists(filePath, allowedDir = process.cwd()) {
  const resolved = path.resolve(allowedDir, filePath);

  if (!isWithinAllowed(resolved, allowedDir)) {
    if (fs.existsSync(resolved)) {
      throw new Error("Invalid file path");
    }
    return "";
  }

  if (!fs.existsSync(resolved)) return "";
  return fs.readFileSync(resolved, "utf8");
}

export function isRemoteCssImport(specifier) {
  const s = String(specifier || "").trim().toLowerCase();
  return s.startsWith("http://") || s.startsWith("https://") || s.startsWith("data:");
}

export function mimeForExt(ext) {
  switch (ext.toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    default:
      return null;
  }
}

/**
 * Convert a local image file to a data URI.
 *
 * Only resolves paths that are contained within `allowedDir`.
 *
 * @param {string} filePath
 * @param {string} [allowedDir=process.cwd()]
 * @returns {string|null}
 */
export function toDataUri(filePath, allowedDir = process.cwd()) {
  const ext = path.extname(filePath);
  const mime = mimeForExt(ext);
  if (!mime) return null;

  const resolved = path.resolve(allowedDir, filePath);
  if (!isWithinAllowed(resolved, allowedDir)) return null;

  const buf = fs.readFileSync(resolved);
  const b64 = buf.toString("base64");
  return `data:${mime};base64,${b64}`;
}

/**
 * Recursively resolve relative @import statements in a CSS file.
 *
 * Only inlines imports that stay inside the directory containing the
 * importing file. Traversal attempts and absolute local paths are left
 * as-is, matching the original CSS semantics (remote imports are also
 * preserved).
 *
 * @param {string} entryFilePath
 * @param {object} [options]
 * @param {Set<string>} [options._seen]
 * @returns {string}
 */
export function resolveCssImports(entryFilePath, { _seen = new Set() } = {}) {
  const absEntry = path.resolve(entryFilePath);
  if (_seen.has(absEntry)) return "";
  _seen.add(absEntry);

  const src = fs.readFileSync(absEntry, "utf8");
  const dir = path.dirname(absEntry);

  const importRe = /^\s*@import\s+(?:url\()?['"]([^'"]+)['"]\)?\s*([^;]*);\s*$/gm;

  return src.replace(importRe, (full, specifier, mediaRaw) => {
    if (isRemoteCssImport(specifier)) return full;

    const importedAbs = path.resolve(dir, specifier);
    const relativeCheck = path.relative(dir, importedAbs);
    if (relativeCheck.startsWith("..") || path.isAbsolute(relativeCheck)) return full;
    if (!fs.existsSync(importedAbs)) return full;

    const importedCss = resolveCssImports(importedAbs, { _seen });
    const media = String(mediaRaw || "").trim();
    const banner = `/* @import ${specifier}${media ? " " + media : ""} */`;

    if (!media) return `${banner}\n${importedCss}`;

    if (/^(layer|supports)\b/i.test(media)) return full;

    return `${banner}\n@media ${media} {\n${importedCss}\n}`;
  });
}
