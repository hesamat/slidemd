/**
 * Clipboard and download helpers for exporting text content.
 *
 * Small utilities used by the AI prompt export flow. Kept separate from
 * feature modules so they can be reused and tested in isolation.
 */

/**
 * Copy text to the system clipboard.
 * Uses the async Clipboard API when available, with a fallback for older
 * browsers / non-secure contexts.
 * @param {string} text
 * @returns {Promise<void>} Rejects if the copy fails (e.g. permission denied).
 */
export async function copyText(text) {
  if (typeof text !== "string") {
    throw new TypeError("copyText: text must be a string");
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback: hidden textarea + execCommand. Needed for non-HTTPS contexts
  // where navigator.clipboard is undefined.
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  try {
    textarea.select();
    const ok = document.execCommand("copy");
    if (!ok) throw new Error("execCommand copy returned false");
  } finally {
    document.body.removeChild(textarea);
  }
}

/**
 * Download text as a file via a Blob URL.
 * @param {string} text
 * @param {string} filename — including extension.
 */
export function downloadText(text, filename) {
  if (typeof text !== "string") {
    throw new TypeError("downloadText: text must be a string");
  }
  if (typeof filename !== "string" || !filename) {
    throw new TypeError("downloadText: filename is required");
  }
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
