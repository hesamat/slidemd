/**
 * DirectoryHandleStore
 *
 * Small helper for persisting a `FileSystemDirectoryHandle` in IndexedDB so
 * we don't have to ask the user to re-pick a directory on every visit.
 * Handles are keyed by deck file name so each deck stores its own directory.
 *
 * @class
 */
export class DirectoryHandleStore {
  /** @type {string} */
  static DB_NAME = "webdeck_image_dir";
  /** @type {string} */
  static STORE = "directory_handles";

  /**
   * Build the IndexedDB key for a given deck file name.
   * @param {string} [fileName]
   * @returns {{handleKey: string, modeKey: string}}
   */
  static keysFor(fileName) {
    const base = fileName ? fileName.replace(/\.md$/i, "") : "";
    const suffix = base ? `:${base}/images` : "";
    return {
      handleKey: `images_dir${suffix}`,
      modeKey: `images_dir_mode${suffix}`,
    };
  }

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
   * @param {string} [fileName] Deck file name to key the handle by.
   * @returns {Promise<void>}
   */
  static async save(handle, mode = "parent", fileName) {
    try {
      const { handleKey, modeKey } = this.keysFor(fileName);
      const db = await this.openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(this.STORE).put(handle, handleKey);
        tx.objectStore(this.STORE).put(mode, modeKey);
      });
    } catch (err) {
      console.warn("DirectoryHandleStore.save failed:", err);
    }
  }

  /**
   * Load the saved directory handle and mode from IndexedDB.
   * @static
   * @param {string} [fileName] Deck file name to look up.
   * @returns {Promise<{handle: FileSystemDirectoryHandle|null, mode: import('../types.js').DirectoryMode}>}
   */
  static async load(fileName) {
    try {
      const { handleKey, modeKey } = this.keysFor(fileName);
      const db = await this.openDb();
      const result = await new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE, "readonly");
        let handle = null;
        let mode = "parent";
        const reqH = tx.objectStore(this.STORE).get(handleKey);
        const reqM = tx.objectStore(this.STORE).get(modeKey);
        reqH.onsuccess = () => {
          handle = reqH.result || null;
        };
        reqM.onsuccess = () => {
          mode = reqM.result || "parent";
        };
        tx.oncomplete = () => resolve({ handle, mode });
        tx.onerror = () => reject(tx.error);
      });

      // Verify the handle actually belongs to this deck by checking if the
      // .md file exists in the directory. A stale handle from a different deck
      // (saved before per-file-name keying) would fail this check.
      //
      // IMPORTANT: After a page reload a stored handle's permission resets to
      // "prompt". Calling getFileHandle() before the user re-grants permission
      // throws a *permission* error — NOT a "file not found" error. We must
      // NOT clear the handle on permission errors, otherwise a perfectly valid
      // handle gets permanently deleted on the first reload and images can
      // never resolve again. Only clear on a genuine NotFoundError.
      if (result.handle && fileName) {
        try {
          const perm = await result.handle.queryPermission({ mode: "read" });
          if (perm === "granted") {
            await result.handle.getFileHandle(fileName);
          }
        } catch (err) {
          if (err && err.name === "NotFoundError") {
            console.warn(
              `[DirHandleStore] load: "${fileName}" not found in dir="${result.handle.name}" — clearing stale handle`,
            );
            result.handle = null;
            this.clear(fileName).catch(() => {});
          } else {
            // Permission or transient error — keep the handle; it may become
            // usable once the user grants read permission later in init.
            console.warn(
              `[DirHandleStore] load: verification of "${fileName}" deferred (${err?.name || err})`,
            );
          }
        }
      }

      // Clean up stale legacy keys in the background (non-blocking)
      this.clearLegacy().catch(() => {});

      return result;
    } catch (err) {
      console.warn("DirectoryHandleStore.load failed:", err);
      return { handle: null, mode: "parent" };
    }
  }

  /**
   * Clear the saved directory handle and mode from IndexedDB.
   * @static
   * @param {string} [fileName] Deck file name to clear.
   * @returns {Promise<void>}
   */
  /**
   * Remove the legacy static keys (`images_dir` / `images_dir_mode`) that
   * pre-date per-file-name keying. Safe to call even if they don't exist.
   * @static
   * @returns {Promise<void>}
   */
  static async clearLegacy() {
    try {
      const db = await this.openDb();
      const legacyKeys = [];
      // Collect all keys so we can remove old .md-suffixed ones
      await new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE, "readonly");
        const req = tx.objectStore(this.STORE).openKeyCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            const key = cursor.key;
            if (
              key === "images_dir" ||
              key === "images_dir_mode" ||
              /images_dir(_mode)?:.*\.md$/i.test(key)
            ) {
              legacyKeys.push(key);
            }
            cursor.continue();
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      if (legacyKeys.length === 0) return;
      await new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE, "readwrite");
        for (const key of legacyKeys) {
          tx.objectStore(this.STORE).delete(key);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // ignore
    }
  }

  static async clear(fileName) {
    try {
      const { handleKey, modeKey } = this.keysFor(fileName);
      const db = await this.openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(this.STORE).delete(handleKey);
        tx.objectStore(this.STORE).delete(modeKey);
      });
    } catch (err) {
      console.warn("DirectoryHandleStore.clear failed:", err);
    }
  }
}
