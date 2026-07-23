import localforage from "localforage";

const DRAFT_STORE = localforage.createInstance({
  name: "webdeck",
  storeName: "drafts",
});

const DRAFT_KEY = "current-draft";

export class DraftManager {
  static async saveDraft(markdown, images) {
    const imageEntries = [];
    for (const [path, blob] of images) {
      imageEntries.push([path, blob]);
    }
    await DRAFT_STORE.setItem(DRAFT_KEY, { markdown, images: imageEntries });
  }

  static async loadDraft() {
    const data = await DRAFT_STORE.getItem(DRAFT_KEY);
    if (!data) return null;
    const images = new Map(data.images || []);
    return { markdown: data.markdown, images };
  }

  static async clearDraft() {
    await DRAFT_STORE.removeItem(DRAFT_KEY);
  }
}
