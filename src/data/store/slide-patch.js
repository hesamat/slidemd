/**
 * @typedef {Object} SlidePatch
 * @property {number} index - 0-based slide index being changed
 * @property {string|null} before - slide markdown before the change
 * @property {string|null} after - slide markdown after the change
 * @property {string} source - user | ai | import | system
 * @property {number} timestamp - Date.now() when the patch was created
 */

export function createEditPatch(index, before, after, source = "user") {
  return { index, before, after, source, timestamp: Date.now() };
}

export function createInsertPatch(index, after, source = "user") {
  return { index, before: null, after, source, timestamp: Date.now() };
}

export function createDeletePatch(index, before, source = "user") {
  return { index, before, after: null, source, timestamp: Date.now() };
}

export function isInsert(patch) {
  return patch.before === null && patch.after !== null;
}

export function isDelete(patch) {
  return patch.after === null && patch.before !== null;
}

export function isNoOp(patch) {
  return patch.before === patch.after;
}

export function invertPatch(patch) {
  return { ...patch, before: patch.after, after: patch.before };
}
