import localforage from "localforage";

const DRAFT_STORE = localforage.createInstance({
  name: "webdeck",
  storeName: "drafts",
});

const IMAGE_CACHE_KEY = "smd-image-cache";

export class DraftManager {
  static async saveDraft(markdown, images) {
    const imageEntries = [...images];
    await DRAFT_STORE.setItem("current-draft", { markdown, images: imageEntries });
  }

  static async loadDraft() {
    const data = await DRAFT_STORE.getItem("current-draft");
    if (!data) return null;
    const images = new Map(data.images || []);
    return { markdown: data.markdown, images };
  }

  static async clearDraft() {
    await DRAFT_STORE.removeItem("current-draft");
  }

  /**
   * Persist image cache to IndexedDB for page refresh recovery.
   * This is separate from the draft — survives clearDraft().
   * @param {Map<string, Blob>} imageMap - path → Blob
   */
  static async saveImageCache(imageMap) {
    const entries = [...imageMap];
    await DRAFT_STORE.setItem(IMAGE_CACHE_KEY, entries);
  }

  /**
   * Load persisted image cache from IndexedDB.
   * @returns {Promise<Map<string, Blob> | null>}
   */
  static async loadImageCache() {
    const entries = await DRAFT_STORE.getItem(IMAGE_CACHE_KEY);
    if (!entries) return null;
    return new Map(entries);
  }

  /**
   * Clear persisted image cache.
   */
  static async clearImageCache() {
    await DRAFT_STORE.removeItem(IMAGE_CACHE_KEY);
  }
}
