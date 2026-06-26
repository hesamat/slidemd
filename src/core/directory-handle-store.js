/**
 * DirectoryHandleStore
 *
 * Small helper for persisting a `FileSystemDirectoryHandle` in IndexedDB so
 * we don't have to ask the user to re-pick a directory on every visit.
 * Pattern borrowed from `CourseProfileManager`.
 */
export class DirectoryHandleStore {
  static DB_NAME = "webdeck_image_dir";
  static STORE = "directory_handles";
  static KEY = "images_dir";

  /**
   * `mode` describes what the saved handle points to:
   *   - "parent" — the parent folder containing the deck .md file.
   *                Images live at `<handle>/images/`.
   *   - "images" — the handle IS the images folder itself.
   */
  static MODE_KEY = "images_dir_mode";

  /**
   * Open (and upgrade on first run) the IndexedDB database.
   * @returns {Promise<IDBDatabase>}
   */
  static openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.STORE)) {
          db.createObjectStore(this.STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * @param {FileSystemDirectoryHandle} handle
   * @param {'parent'|'images'} [mode='parent'] What `handle` points to.
   */
  static async save(handle, mode = "parent") {
    try {
      const db = await this.openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(this.STORE).put(handle, this.KEY);
        tx.objectStore(this.STORE).put(mode, this.MODE_KEY);
      });
    } catch (err) {
      console.warn("DirectoryHandleStore.save failed:", err);
    }
  }

  /**
   * @returns {Promise<{handle: FileSystemDirectoryHandle|null, mode: 'parent'|'images'}>}
   */
  static async load() {
    try {
      const db = await this.openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE, "readonly");
        let handle = null;
        let mode = "parent";
        const reqH = tx.objectStore(this.STORE).get(this.KEY);
        const reqM = tx.objectStore(this.STORE).get(this.MODE_KEY);
        reqH.onsuccess = () => {
          handle = reqH.result || null;
        };
        reqM.onsuccess = () => {
          mode = reqM.result || "parent";
        };
        tx.oncomplete = () => resolve({ handle, mode });
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn("DirectoryHandleStore.load failed:", err);
      return { handle: null, mode: "parent" };
    }
  }

  static async clear() {
    try {
      const db = await this.openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(this.STORE).delete(this.KEY);
        tx.objectStore(this.STORE).delete(this.MODE_KEY);
      });
    } catch (err) {
      console.warn("DirectoryHandleStore.clear failed:", err);
    }
  }
}
