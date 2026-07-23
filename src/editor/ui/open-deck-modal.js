/**
 * OpenDeckModal
 *
 * Custom modal for opening deck files.
 * Supports .smd (ZIP archive with images) and .md (remote URLs only).
 */
import { DeckLoader } from "../../data/deck-loader.js";
import { Notification } from "../../renderer/notification.js";
import { SmdHandler } from "../../core/smd-handler.js";
import { DraftManager } from "../../core/draft-manager.js";

export class OpenDeckModal {
  static _el = null;
  static _fileListEl = null;
  static _smdBtn = null;
  static _mdBtn = null;
  static _previousFocus = null;

  static init() {
    this._el = document.getElementById("openDeckModal");
    this._fileListEl = document.getElementById("openDeckFileList");
    this._smdBtn = document.getElementById("openDeckSmdBtn");
    this._mdBtn = document.getElementById("openDeckMdBtn");

    if (!this._el) return;

    document.getElementById("openDeckModalOverlay")?.addEventListener("click", () => this.hide());
    document.getElementById("closeOpenDeckModalBtn")?.addEventListener("click", () => this.hide());
    this._smdBtn?.addEventListener("click", () => this._openSmdFile());
    this._mdBtn?.addEventListener("click", () => this._openMdFile());

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this._el.classList.contains("webdeck-hidden")) {
        this.hide();
      }
    });
  }

  static show() {
    if (!this._el) return;
    this._previousFocus = document.activeElement;
    this._el.classList.remove("webdeck-hidden");
    this._fileListEl.innerHTML = "";
    this._renderRecentDecks();
    this._smdBtn?.focus();
  }

  static hide() {
    if (!this._el) return;
    this._el.classList.add("webdeck-hidden");
    this._previousFocus?.focus();
    this._previousFocus = null;
  }

  static async _openSmdFile() {
    if (!("showOpenFilePicker" in window)) {
      Notification.warning("File picker requires a Chromium-based browser.");
      return;
    }

    try {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [
          {
            description: "SlideMD Presentation",
            accept: { "application/octet-stream": [".smd"] },
          },
        ],
      });

      const file = await fileHandle.getFile();
      const { markdown, images } = await SmdHandler.extractFromSmd(file);

      DeckLoader.smdImageCache.clear();
      for (const [path, blob] of images) {
        const url = URL.createObjectURL(blob);
        DeckLoader.smdImageCache.set(path, url);
      }
      DeckLoader.isSmdMode = true;

      DeckLoader.fileHandleRegistry.set(file.name, fileHandle);

      localStorage.setItem("webdeck_local_file", markdown);
      localStorage.setItem("webdeck_local_file_type", "smd");
      localStorage.setItem("webdeck_local_file_name", file.name);
      localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
      localStorage.removeItem("webdeck_source_url");

      DeckLoader.addRecentDeck(file.name);

      await DraftManager.saveDraft(markdown, images);

      this.hide();

      window.dispatchEvent(
        new CustomEvent("webdeck-load-local", {
          detail: { text: markdown, fileType: "smd", fileName: file.name },
        }),
      );
    } catch (e) {
      if (e.name !== "AbortError") {
        console.error("Failed to open .smd file:", e);
        Notification.error("Failed to open .smd file");
      }
    }
  }

  static async _openMdFile() {
    if (!("showOpenFilePicker" in window)) {
      Notification.warning("File picker requires a Chromium-based browser.");
      return;
    }

    try {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [
          {
            description: "Markdown file",
            accept: { "text/markdown": [".md"] },
          },
        ],
      });

      const file = await fileHandle.getFile();
      const rawText = await file.text();

      DeckLoader.isSmdMode = false;
      DeckLoader.smdImageCache.clear();
      DeckLoader.fileHandleRegistry.set(file.name, fileHandle);

      localStorage.setItem("webdeck_local_file", rawText);
      localStorage.setItem("webdeck_local_file_type", "md");
      localStorage.setItem("webdeck_local_file_name", file.name);
      localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
      localStorage.removeItem("webdeck_source_url");

      DeckLoader.addRecentDeck(file.name);

      await DraftManager.saveDraft(rawText, new Map());

      this.hide();

      window.dispatchEvent(
        new CustomEvent("webdeck-load-local", {
          detail: { text: rawText, fileType: "md", fileName: file.name },
        }),
      );
    } catch (e) {
      if (e.name !== "AbortError") {
        console.error("Failed to open .md file:", e);
        Notification.error("Failed to open .md file");
      }
    }
  }

  static _renderRecentDecks() {
    const recent = DeckLoader.getRecentDecks();
    if (recent.length === 0 || !this._fileListEl) return;
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

      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("width", "14");
      icon.setAttribute("height", "14");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("fill", "none");
      icon.setAttribute("stroke", "currentColor");
      icon.setAttribute("stroke-width", "2");
      icon.setAttribute("stroke-linecap", "round");
      icon.setAttribute("stroke-linejoin", "round");
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", "12");
      circle.setAttribute("cy", "12");
      circle.setAttribute("r", "10");
      const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      poly.setAttribute("points", "12 6 12 12 16 14");
      icon.appendChild(circle);
      icon.appendChild(poly);

      const nameSpan = document.createElement("span");
      nameSpan.className = "open-deck__recent-name";
      nameSpan.textContent = entry.name;

      const timeSpan = document.createElement("span");
      timeSpan.className = "open-deck__recent-time";
      timeSpan.textContent = this._timeAgo(entry.timestamp);

      btn.appendChild(icon);
      btn.appendChild(nameSpan);
      btn.appendChild(timeSpan);

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
