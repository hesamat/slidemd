/**
 * Batched image uploader
 *
 * Uploads images to the CLI dev server via POST /api/upload-images in capped
 * batches. Batching avoids the per-image HTTP overhead of one request per file
 * while keeping each request small enough for the server's body limit, so a
 * large deck degrades one batch at a time instead of failing as a whole.
 */

/** Maximum number of files sent in a single request. */
export const UPLOAD_BATCH_MAX_FILES = 20;

/** Maximum total bytes sent in a single request (server cap is 100 MB). */
export const UPLOAD_BATCH_MAX_BYTES = 15 * 1024 * 1024;

/**
 * @typedef {{ key: string, file: File }} UploadEntry
 * `key` is the caller's identifier for the image (e.g. the original markdown
 * reference); the returned map is keyed by it.
 */

/**
 * Upload images in batches and return a map from entry key to server path.
 * Failed batches are logged and skipped — their keys are absent from the map.
 * @param {UploadEntry[]} entries
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {(uploaded: number, total: number) => void} [options.onProgress] Called
 *   after each batch with the number of images processed so far.
 * @returns {Promise<Map<string, string>>}
 */
export async function uploadImagesInBatches(entries, { signal, onProgress } = {}) {
  /** @type {Map<string, string>} */
  const pathMap = new Map();
  if (!entries?.length) return pathMap;

  const total = entries.length;
  let processed = 0;

  /** @type {UploadEntry[]} */
  let batch = [];
  let batchBytes = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    const sending = batch;
    batch = [];
    batchBytes = 0;

    // Filenames identify the parts in the response, so map them back by name.
    const keyByName = new Map(sending.map(({ key, file }) => [file.name, key]));
    const formData = new FormData();
    for (const { file } of sending) formData.append("image", file);

    try {
      const res = await fetch("/api/upload-images", {
        method: "POST",
        body: formData,
        signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        console.warn(`Image upload batch failed (HTTP ${res.status}):`, body.error);
        return;
      }
      const result = await res.json();
      for (const { name, path } of result.paths || []) {
        const key = keyByName.get(name);
        if (key !== undefined && path) pathMap.set(key, path);
      }
    } catch (e) {
      if (e.name === "AbortError") throw e;
      console.warn("Image upload batch failed:", e);
    } finally {
      processed += sending.length;
      onProgress?.(processed, total);
    }
  };

  for (const entry of entries) {
    if (signal?.aborted) throw new DOMException("Image upload cancelled", "AbortError");
    batch.push(entry);
    batchBytes += entry.file.size;
    if (batch.length >= UPLOAD_BATCH_MAX_FILES || batchBytes >= UPLOAD_BATCH_MAX_BYTES) {
      await flush();
    }
  }
  await flush();

  return pathMap;
}
