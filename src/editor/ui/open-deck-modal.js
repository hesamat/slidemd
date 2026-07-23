/**
 * OpenDeckModal
 *
 * Custom modal for opening deck files. Shows a "Browse Folder" button
 * that opens the native directory picker, then lists .md files found
 * in the selected folder. Also displays recently opened decks.
 */
import { DeckLoader } from "../../data/deck-loader.js";
import { Notification } from "../../renderer/notification.js";

const LAST_FOLDER_KEY = "webdeck_last_folder_name";

export class OpenDeckModal {
  static _el = null;
  static _fileListEl = null;
  static _folderPathEl = null;
  static _browseBtn = null;
  static _dirHandle = null;

  static init() {
    this._el = document.getElementById("openDeckModal");
    this._fileListEl = document.getElementById("openDeckFileList");
    this._folderPathEl = document.getElementById("openDeckFolderPath");
    this._browseBtn = document.getElementById("openDeckBrowseBtn");

    if (!this._el) return;

    document.getElementById("openDeckModalOverlay")?.addEventListener("click", () => this.hide());
    document.getElementById("closeOpenDeckModalBtn")?.addEventListener("click", () => this.hide());
    this._browseBtn?.addEventListener("click", () => this._browseFolder());

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this._el.classList.contains("webdeck-hidden")) {
        this.hide();
      }
    });
  }

  static show() {
    if (!this._el) return;
    this._el.classList.remove("webdeck-hidden");
    this._fileListEl.innerHTML = "";
    this._folderPathEl.textContent = "";
    this._renderRecentDecks();
  }

  static hide() {
    if (!this._el) return;
    this._el.classList.add("webdeck-hidden");
  }

  static async _browseFolder() {
    if (!("showDirectoryPicker" in window)) {
      Notification.warning("Folder browsing requires a Chromium-based browser.");
      return;
    }

    try {
      this._dirHandle = await window.showDirectoryPicker({ id: "deck-folder" });
      this._folderPathEl.textContent = this._dirHandle.name;
      localStorage.setItem(LAST_FOLDER_KEY, this._dirHandle.name);
      await this._listMdFiles();
    } catch (e) {
      if (e.name !== "AbortError") {
        console.error("Folder picker failed:", e);
      }
    }
  }

  static async _listMdFiles() {
    if (!this._dirHandle) return;

    const mdFiles = [];
    for await (const [name, handle] of this._dirHandle.entries()) {
      if (handle.kind === "file" && /\.md$/i.test(name)) {
        mdFiles.push({ name, handle });
      }
    }

    if (mdFiles.length === 0) {
      this._fileListEl.innerHTML =
        '<div class="open-deck__empty">No .md files found in this folder.</div>';
      return;
    }

    const count = mdFiles.length;
    const header = document.createElement("div");
    header.className = "open-deck__section-label";
    header.textContent = `${count} presentation${count > 1 ? "s" : ""} found \u2014 select one to open:`;

    this._fileListEl.innerHTML = "";
    this._fileListEl.appendChild(header);

    const list = document.createElement("div");
    list.className = "open-deck__file-list-items";

    for (const f of mdFiles) {
      const btn = document.createElement("button");
      btn.className = "open-deck__file-item";
      btn.dataset.fileName = f.name;
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        ${f.name}
      `;
      btn.addEventListener("click", () => this._loadFile(f.name));
      list.appendChild(btn);
    }

    this._fileListEl.appendChild(list);
  }

  static async _loadFile(fileName) {
    if (!this._dirHandle) return;

    try {
      const fileHandle = await this._dirHandle.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const rawText = await file.text();

      const { DirectoryHandleStore } = await import("../../core/directory-handle-store.js");

      DeckLoader.fileHandleRegistry.set(fileName, fileHandle);
      await DirectoryHandleStore.save(this._dirHandle, "parent", fileName);

      localStorage.setItem("webdeck_local_file", rawText);
      localStorage.setItem("webdeck_local_file_type", "md");
      localStorage.setItem("webdeck_local_file_name", fileName);
      localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
      localStorage.removeItem("webdeck_source_url");

      DeckLoader.addRecentDeck(fileName);

      this.hide();

      window.dispatchEvent(
        new CustomEvent("webdeck-load-local", {
          detail: { text: rawText, fileType: "md", fileName },
        }),
      );
    } catch (e) {
      console.error("Failed to load file:", e);
      Notification.error(`Failed to load "${fileName}"`);
    }
  }

  static _renderRecentDecks() {
    const recent = DeckLoader.getRecentDecks();
    if (recent.length === 0 || !this._fileListEl) return;

    // Only render if file list is empty (no folder selected yet)
    if (this._fileListEl.children.length > 0) return;

    const heading = document.createElement("div");
    heading.className = "open-deck__section-label";
    heading.textContent = "Recent";

    const list = document.createElement("div");
    list.className = "open-deck__recent-list";

    for (const entry of recent) {
      const btn = document.createElement("button");
      btn.className = "open-deck__recent-item";
      btn.dataset.recentFile = entry.name;

      const timeAgo = this._timeAgo(entry.timestamp);
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <span class="open-deck__recent-name">${entry.name}</span>
        <span class="open-deck__recent-time">${timeAgo}</span>
      `;

      btn.addEventListener("click", () => {
        DeckLoader.loadRecentDeck(entry.name);
        this.hide();
      });

      list.appendChild(btn);
    }

    this._fileListEl.appendChild(heading);
    this._fileListEl.appendChild(list);
  }

  static _timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
}
