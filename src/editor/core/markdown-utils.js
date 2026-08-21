/**
 * Shared markdown manipulation helpers for block-level drag/move operations.
 */

/**
 * Remove a block from markdown and re-insert it at a new character offset,
 * adding the appropriate leading/trailing newlines and collapsing runs of
 * three or more newlines.  The inserted text may differ from the original
 * block (e.g. an image tag with updated style attributes).
 *
 * @param {string} markdown
 * @param {{ start: number, end: number }} block
 * @param {number} insertAt - Character offset in the post-removal markdown.
 * @param {string} [blockText] - Text to insert; defaults to `block.fullTag`.
 * @returns {string}
 */
export function removeAndInsertBlock(markdown, block, insertAt, blockText) {
  const text = blockText ?? block.fullTag;
  const withoutBlock = markdown.slice(0, block.start) + markdown.slice(block.end);
  const before = withoutBlock.slice(0, insertAt);
  const after = withoutBlock.slice(insertAt);

  const leading =
    before.length === 0 ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";

  const trailing = after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";

  let updated = before + leading + text + trailing + after;
  updated = updated.replace(/\n{3,}/g, "\n\n");
  return updated;
}
