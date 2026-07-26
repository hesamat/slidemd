import localforage from "localforage";

const DRAFT_STORE = localforage.createInstance({
  name: "webdeck",
  storeName: "drafts",
});

export class DraftManager {
  static async saveDraft(markdown) {
    await DRAFT_STORE.setItem("current-draft", { markdown });
  }

  static async loadDraft() {
    const data = await DRAFT_STORE.getItem("current-draft");
    if (!data) return null;
    return { markdown: data.markdown };
  }

  static async clearDraft() {
    await DRAFT_STORE.removeItem("current-draft");
  }
}
