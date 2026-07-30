/**
 * Tracks the current in-flight image upload promise.
 *
 * .textpack open and PPTX import start background uploads and register the
 * promise here. Save/export operations can then wait for it to ensure the
 * persisted markdown uses server image paths instead of blob URLs.
 */

let uploadPromise = null;

/**
 * Register a new image upload promise. Replaces any existing one.
 * @param {Promise<void>} promise
 */
export function setImageUploadPromise(promise) {
  uploadPromise = promise;
}

/**
 * Return the current upload promise, or null when none is in progress.
 * @returns {Promise<void>|null}
 */
export function getImageUploadPromise() {
  return uploadPromise;
}

/**
 * Await the current upload promise if one exists. Resolves immediately when
 * there is no pending upload.
 * @returns {Promise<void>}
 */
export async function waitForImageUpload() {
  if (uploadPromise) {
    await uploadPromise;
  }
}
