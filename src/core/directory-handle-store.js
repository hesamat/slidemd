/**
 * DirectoryHandleStore
 *
 * Small helper for persisting a `FileSystemDirectoryHandle` in IndexedDB so
 * we don't have to ask the user to re-pick a directory on every visit.
 * Pattern borrowed from `CourseProfileManager`.
 *
 * @class
 */
export class DirectoryHandleStore {
  /** @type {string} */
  static DB_NAME = "webdeck_image_dir";
  /** @type {string} */
  static STORE = "directory_handles";
  /** @type {string} */
  static KEY = "images_dir";

  /**
   * `mode` describes what the saved handle points to:
   *   - "parent" — the parent folder containing the deck .md file.
   *                Images live at `<handle>/images/`.
   *   - "images" — the handle IS the images folder itself.
   * @type {string}
   */
  static MODE_KEY = "images_dir_mode";

  /**
   * Open (and upgrade on first run) the IndexedDB database.
   * @static
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
   * Save a directory handle and its mode to IndexedDB.
   * @static
   * @param {FileSystemDirectoryHandle} handle
   * @param {import('../types.js').DirectoryMode} [mode='parent'] What `handle` points to.
   * @returns {Promise<void>}
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
   * Load the saved directory handle and mode from IndexedDB.
   * @static
   * @returns {Promise<{handle: FileSystemDirectoryHandle|null, mode: import('../types.js').DirectoryMode}>}
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

  /**
   * Clear the saved directory handle and mode from IndexedDB.
   * @static
   * @returns {Promise<void>}
   */
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
