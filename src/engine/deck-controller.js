import { getDeckId, EventEmitter, isEmbedded } from "../core/utils.js";
import { SlideRenderer } from "../renderer/slide-renderer.js";
import { ContentEnhancer } from "../renderer/content-enhancer.js";
import { DeckLoader } from "../data/deck-loader.js";
import { StageScaler } from "../renderer/stage-scaler.js";
import { BreakManager } from "./break-manager.js";
import { FreezeManager } from "./freeze-manager.js";
import { ThemeManager } from "../renderer/theme-manager.js";
import { Notification } from "../renderer/notification.js";
import { KeyboardHandler } from "./keyboard-handler.js";
import { WheelHandler } from "./wheel-handler.js";
import { RoleManager } from "./role-manager.js";
import { SlideNavigator } from "./slide-navigator.js";
import { PrintManager } from "../renderer/print-manager.js";
import { HtmlExportManager } from "../renderer/html-export-manager.js";
import { TextpackExportManager } from "../renderer/textpack-export-manager.js";
import { ReloadManager } from "./reload-manager.js";
import { UiActions } from "../ui/ui-actions.js";
import { NewPresentationModal } from "../editor/new-presentation-modal.js";
import { ImagePicker } from "../editor/image/image-picker.js";
import { MarkdownParser, applyOpenInNewTabToLinks } from "../data/markdown-parser.js";
import { AssetLoader } from "../core/asset-loader.js";
import { SlideStylePanel } from "../editor/ui/slide-style-panel.js";
import { DraftManager } from "../core/draft-manager.js";

export class DeckController extends EventEmitter {
  static updateDeckTitle(elements, title) {
    UiActions.updateDeckTitle(elements, title);
  }

  static updateSlideCount(elements, count, deck = null) {
    // If deck is provided, count only visible slides
    if (deck) {
      const visibleSlideCount = deck.slides.filter((s) => !s.hidden).length;
      count = visibleSlideCount;
    }
    UiActions.updateSlideCount(elements, count);
  }

  constructor(deck, elements) {
    super();

    if (elements.reloadDeckBtn && navigator.userAgent.includes("Firefox")) {
      elements.reloadDeckBtn.style.display = "none";
    }

    this.deck = deck;
    this.elements = elements;
    this._enhanceIdleId = null;

    this.initIds();
    this.initSlideNavigator();
    this.initRoleManager();
    this.initReloadManager();
    this.initKeyboardHandler();
    this.initWheelHandler();
    this.initBreakManager();
    this.initFreezeManager();
    this.setupEventListeners();
  }

  initIds() {
    const id = getDeckId(this.deck);
    this.SLIDE_STATE_KEY = `webdeck:${id}:slide`;
  }

  initSlideNavigator() {
    this.slideNavigator = new SlideNavigator(this.deck, {
      slideStateKey: this.SLIDE_STATE_KEY,
      broadcastChannel: null, // Will be set in initBroadcastChannel
      isEditMode: () => this.isEditMode(),
    });
    // Listen for slide changes to trigger render
    this.slideNavigator.addEventListener("slidechange", (e) => {
      this.render();
      this.enhanceActiveSlideNow();
      this.dispatchEvent("slidechange", e);
    });
    // Listen for render requests (e.g., when edit mode changes)
    this.slideNavigator.addEventListener("renderneeded", () => {
      this.render();
    });
  }

  initRoleManager() {
    this.roleManager = new RoleManager(this.elements);
    this.roleManager.applyRoleFromUrl();
  }

  initReloadManager() {
    this.reloadManager = new ReloadManager(this.deck, this.elements, {
      slideNavigator: this.slideNavigator,
      breakManager: null, // Will be set after breakManager is initialized
      freezeManager: null, // Will be set after freezeManager is initialized
      getDeckId: getDeckId,
    });
    // Listen for deck changes
    this.reloadManager.addEventListener("deckchange", (e) => {
      this.deck = e.deck;
      this.dispatchEvent("deckchange", e);
      // Re-rewrite image srcs to blob URLs on the freshly created DOM
      this.#rewriteImages();
    });
    // Note: broadcast channel initialized later, after breakManager exists
  }

  initKeyboardHandler() {
    const edit = () => window.__WEBDECK_EDIT_CONTROLLER__;
    this.keyboardHandler = new KeyboardHandler({
      next: () => this.slideNavigator.next(),
      prev: () => this.slideNavigator.prev(),
      first: () => this.slideNavigator.goTo(this.slideNavigator.findFirstVisibleIndex()),
      last: () => this.slideNavigator.goTo(this.slideNavigator.findLastVisibleIndex()),
      goto: () => this.slideNavigator.openGoToPrompt(),
      viewer: () => this.roleManager.togglePresentWindow(),
      edit: () => this.toggleEditMode(),
      break: () => this.breakManager.toggle(),
      fullscreen: () => this.toggleFullscreen(),
      reload: () => this.reloadManager.handleReloadDeck(),
      theme: () => {
        // T → global app theme (light/dark).  Independent of the
        // current slide's `theme:` directive.
        ThemeManager.toggleTheme();
      },
      slideTheme: () => {
        // Alt+T → per-slide theme (the `theme:` directive on the
        // current slide).  Edit-mode only; the modifier shortcut
        // guard in the keyboard handler already ensures this.
        try {
          edit()?.themeManager?.toggle?.();
        } catch (e) {
          console.warn("Slide theme shortcut failed:", e);
        }
      },
      styles: () => {
        try {
          SlideStylePanel.toggle();
        } catch {
          /* style panel may not be available */
        }
      },
      save: () => {
        try {
          edit()?.saveManager?.save?.();
        } catch (e) {
          console.warn("Save shortcut failed:", e);
        }
      },
      newSlide: () => {
        try {
          edit()?.layoutManager?.showPicker?.();
        } catch (e) {
          console.warn("New slide shortcut failed:", e);
        }
      },
      duplicateSlide: () => {
        try {
          edit()?.slideOps?.duplicateSlide?.();
        } catch (e) {
          console.warn("Duplicate slide shortcut failed:", e);
        }
      },
      deleteSlide: () => {
        try {
          edit()?.slideOps?.deleteSlide?.();
        } catch (e) {
          console.warn("Delete slide shortcut failed:", e);
        }
      },
      insertImage: () => {
        try {
          edit()?.imageInserter?.pickAndInsert?.();
        } catch (e) {
          console.warn("Insert image shortcut failed:", e);
        }
      },
      openLayout: () => {
        try {
          edit()?.layoutManager?.showPickerForCurrentSlide?.();
        } catch (e) {
          console.warn("Open layout shortcut failed:", e);
        }
      },
      toggleMermaid: () => {
        try {
          edit()?.mermaidHelper?.toggle?.();
        } catch (e) {
          console.warn("Toggle Mermaid shortcut failed:", e);
        }
      },
      adjustColumns: () => {
        try {
          edit()?.gridResizer?.toggle?.();
        } catch (e) {
          console.warn("Adjust columns shortcut failed:", e);
        }
      },
      moveSlideUp: () => {
        try {
          edit()?.slideOps?.moveSlideUp?.();
        } catch (e) {
          console.warn("Move slide up shortcut failed:", e);
        }
      },
      moveSlideDown: () => {
        try {
          edit()?.slideOps?.moveSlideDown?.();
        } catch (e) {
          console.warn("Move slide down shortcut failed:", e);
        }
      },
      undo: () => {
        try {
          edit()?.markdownEditor?.undo?.();
        } catch (e) {
          console.warn("Undo shortcut failed:", e);
        }
      },
      redo: () => {
        try {
          edit()?.markdownEditor?.redo?.();
        } catch (e) {
          console.warn("Redo shortcut failed:", e);
        }
      },
      isEditMode: () => this.isEditMode(),
      isBreakActive: () => this.breakManager.isActive,
      endBreak: () => this.breakManager.setActive(false),
      isEditorWindow: () => this.roleManager.isEditorWindow,
      isEmbedded: isEmbedded,
    });
  }

  initWheelHandler() {
    this.wheelHandler = new WheelHandler({
      next: () => this.slideNavigator.next(),
      prev: () => this.slideNavigator.prev(),
      isBreakActive: () => this.breakManager.isActive,
      endBreak: () => this.breakManager.setActive(false),
    });
  }

  initBreakManager() {
    this.breakManager = new BreakManager(this.deck, this.elements, (state) => {
      this.dispatchEvent("breakchange", state);
    });
    // Set breakManager on reloadManager
    if (this.reloadManager) {
      this.reloadManager.breakManager = this.breakManager;
    }
  }

  initFreezeManager() {
    this.freezeManager = new FreezeManager(this.deck, this.elements, (state) => {
      this.dispatchEvent("freezechange", state);
    });
    // Set freezeManager on slideNavigator and reloadManager
    if (this.slideNavigator) {
      this.slideNavigator.freezeManager = this.freezeManager;
    }
    if (this.reloadManager) {
      this.reloadManager.freezeManager = this.freezeManager;
    }
  }

  async init() {
    // Initialize broadcast channel after breakManager is ready
    this.reloadManager.initBroadcastChannel();
    // Initialize deck data channel for viewer windows
    this.reloadManager.initDeckDataChannel();
    // Store reference to bc for backward compatibility
    this.bc = this.reloadManager.getBroadcastChannel();

    const url = new URL(window.location.href);
    const hash = window.location.hash.match(/#slide-(\d+)/);
    const stored = localStorage.getItem(this.SLIDE_STATE_KEY);
    const restoreIndex = sessionStorage.getItem("webdeck_restore_slide_index");

    sessionStorage.removeItem("webdeck_restore_slide_index");

    let initialIndex = hash
      ? parseInt(hash[1], 10) - 1
      : restoreIndex !== null
        ? parseInt(restoreIndex, 10)
        : parseInt(stored, 10) || 0;

    // Ensure we start on a visible slide (unless in edit mode)
    const visibleIndex = this.slideNavigator.getVisibleIndex(initialIndex);
    this.slideNavigator.currentIndex = visibleIndex;

    this.breakManager.setDuration(parseInt(url.searchParams.get("breakMins"), 10) || 10);
    this.breakManager.setActive(url.searchParams.get("break") === "1", { broadcast: false });

    // Note: Freeze state is not persisted or initialized from URL - it's temporary per session

    const title = DeckLoader.getDisplayTitle(this.deck);
    document.title = title;
    DeckController.updateDeckTitle(this.elements, title);

    this.preloadEnhancers();

    this.elements.slidesContainer.innerHTML = "";
    this.deck.slides.forEach((s, i) => {
      this.elements.slidesContainer.appendChild(
        SlideRenderer.createSlideElement(this.deck, s, i, i === this.slideNavigator.currentIndex),
      );
    });

    this.slideNavigator.goTo(this.slideNavigator.currentIndex, { broadcast: false });
    this.applyStageScale();

    // Immediately enhance the first slide (don't wait for idle)
    requestAnimationFrame(() => this.enhanceActiveSlideNow());
  }

  async #rewriteImages() {
    try {
      const { DeckImagesResolver } = await import("../editor/image/deck-images-resolver.js");
      await DeckImagesResolver.rewriteImgSrcs(this.elements.slidesContainer);
      await DeckImagesResolver.rewriteBackgroundUrls(this.elements.slidesContainer);
    } catch {
      // ignore
    }
  }

  preloadEnhancers() {
    const loaderPromise = window.AssetLoader
      ? Promise.resolve(window.AssetLoader)
      : import("../core/asset-loader.js").then(({ AssetLoader }) => AssetLoader);

    loaderPromise
      .then((AssetLoader) => {
        AssetLoader.ensureRichTextEnhancers().catch(console.warn);
        // Scan deck and warmup Mermaid if needed
        const { hasMermaid } = ContentEnhancer.scanDeck(this.deck);
        if (hasMermaid) ContentEnhancer.initializeMermaid().catch(console.warn);
      })
      .catch(console.warn);
  }

  setupEventListeners() {
    const listen = (el, evt, fn) => el?.addEventListener(evt, fn);

    document.addEventListener("keydown", (e) => this.handleKeyboard(e));
    document.addEventListener("wheel", (e) => this.handleWheel(e), { passive: false });
    document.addEventListener("click", (e) => this.handleDocumentClick(e));
    document.addEventListener("fullscreenchange", () => this.applyStageScale());
    window.addEventListener("storage", (e) => this.handleStorage(e));
    window.addEventListener("resize", () => this.applyStageScale());
    window.addEventListener("beforeprint", () => this.handleBeforePrint());
    window.addEventListener("webdeck-load-local", (e) => this.handleLocalFileLoad(e));

    listen(this.elements.presentBtn, "click", () => this.roleManager.togglePresentWindow());
    listen(this.elements.printBtn, "click", () => this.handlePrint());
    listen(this.elements.breakBtn, "click", () => this.breakManager.toggle());
    listen(this.elements.freezeBtn, "click", () => this.freezeManager.toggle());
    listen(this.elements.toggleFullscreenBtn, "click", () => this.toggleFullscreen());
    listen(this.elements.themeToggleBtn, "click", () => ThemeManager.toggleTheme());

    listen(this.elements.menuBtn, "click", () => this.toggleMenu());
    listen(this.elements.menuOpenFileBtn, "click", () => this.closeMenu());
    listen(this.elements.menuReloadDeckBtn, "click", () => {
      this.handleReloadDeck();
      this.closeMenu();
    });
    listen(this.elements.menuToggleEditModeBtn, "click", () => {
      this.toggleEditMode();
      this.closeMenu();
    });
    listen(this.elements.menuSaveBtn, "click", () => {
      const editCtrl = window.__WEBDECK_EDIT_CONTROLLER__;
      if (this.isEditMode() && editCtrl?.saveManager) {
        editCtrl.saveManager.save();
      } else {
        Notification.info("Open edit mode (E) to save changes");
      }
      this.closeMenu();
    });
    listen(this.elements.menuPrintBtn, "click", () => {
      this.handlePrint();
      this.closeMenu();
    });
    listen(this.elements.menuExportHtmlBtn, "click", () => {
      this.handleHtmlExport();
      this.closeMenu();
    });
    listen(this.elements.menuExportTextpackBtn, "click", () => {
      this.handleTextpackExport();
      this.closeMenu();
    });
    listen(this.elements.menuNewPresentationBtn, "click", () => {
      this.handleNewPresentation();
      this.closeMenu();
    });
    listen(this.elements.menuConvertPptxBtn, "click", () => {
      this.handleConvertPptx();
      this.closeMenu();
    });

    listen(this.elements.breakDurationSelect, "change", (e) => {
      this.breakManager.setDuration(parseInt(e.target.value, 10) || 10);
    });

    listen(this.elements.fileInput, "change", (e) => {
      if (e.target.files?.[0]) {
        localStorage.setItem("webdeck_local_file_name", e.target.files[0].name);
      }
    });
  }

  async handleLocalFileLoad(event) {
    await this.reloadManager.handleLocalFileLoad(event);
  }

  handleKeyboard(e) {
    // Arrow keys move the selected image when an image is selected in edit mode.
    // The handler inside handleKeyDown calls preventDefault when an image is
    // actually selected. When no image is selected, the event falls through to
    // the normal keyboard handler for slide navigation.
    if (e.key.startsWith("Arrow") && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const edit = window.__WEBDECK_EDIT_CONTROLLER__;
      if (edit?.isEditMode) {
        import("../editor/image/image-interaction-handler.js").then(
          ({ ImageInteractionHandler }) => {
            if (ImageInteractionHandler.isSelected()) {
              ImageInteractionHandler.handleKeyDown(e);
            } else {
              this.keyboardHandler?.handleKeyboard(e);
            }
          },
        );
        return;
      }
    }
    this.keyboardHandler?.handleKeyboard(e);
  }

  handleWheel(e) {
    this.wheelHandler?.handleWheel(e);
  }

  handleStorage(ev) {
    if (ev.key === this.SLIDE_STATE_KEY) {
      this.slideNavigator.handleIncomingState(parseInt(ev.newValue, 10));
    } else if (ev.key === "webdeck_local_file_timestamp" && ev.newValue) {
      this.reloadManager.handleStorage(ev);
    }
  }

  handleDocumentClick(e) {
    if (
      this.elements.menuDropdown &&
      !this.elements.menuDropdown.classList.contains("webdeck-hidden")
    ) {
      if (
        !this.elements.menuDropdown.contains(e.target) &&
        !this.elements.menuBtn.contains(e.target)
      ) {
        this.elements.menuDropdown.classList.add("webdeck-hidden");
      }
    }
  }

  async handleBeforePrint() {
    if (this.elements.slidesContainer) {
      await PrintManager.handlePrint(this.elements.slidesContainer, this.deck?.meta?.title, {
        triggerBrowserPrint: false,
      });
    }
  }

  /**
   * Check if we're in edit mode
   */
  isEditMode() {
    return document.body.getAttribute("data-edit-mode") === "true";
  }

  enhanceActiveSlideNow() {
    const activeSlide = this.elements.slidesContainer?.querySelector(".slide.active");
    if (activeSlide && activeSlide.dataset.webdeckEnhanced !== "1") {
      requestAnimationFrame(() => {
        ContentEnhancer.enhanceRenderedContent(activeSlide).then((success) => {
          if (success) activeSlide.dataset.webdeckEnhanced = "1";
        });
      });
    }
  }

  applyStageScale() {
    StageScaler.applyStageScale(this.elements);
  }

  /**
   * Renders speaker notes as markdown HTML.
   * @param {string} notes - Raw markdown notes text
   * @returns {string} Rendered HTML
   */
  renderNotes(notes) {
    if (!notes) return "<p class='notes-empty'>No notes</p>";

    // Use markdown-it if available (loaded via AssetLoader)
    if (typeof window.markdownit === "function") {
      try {
        // Get or create markdown-it instance
        if (!this._md) {
          this._md = window.markdownit({
            html: true,
            linkify: false,
            typographer: false,
            breaks: true,
          });
          applyOpenInNewTabToLinks(this._md);
        }
        return `<div class="notes-content">${this._md.render(notes)}</div>`;
      } catch (e) {
        console.warn("Failed to render notes as markdown:", e);
      }
    }

    // Fallback to plain text with line breaks
    return `<div class="notes-content"><pre>${notes}</pre></div>`;
  }

  render() {
    this.elements.slideNumberEl.textContent = String(this.slideNavigator.currentIndex + 1);
    const slides = this.elements.slidesContainer.querySelectorAll(".slide");
    slides.forEach((s, i) => s.classList.toggle("active", i === this.slideNavigator.currentIndex));

    if (this.elements.floatSlideCounter) {
      this.elements.floatSlideCounter.textContent = `${this.slideNavigator.currentIndex + 1} / ${this.deck.slides.length}`;
    }

    if (this.roleManager.isEditorWindow) {
      const next = this.deck.slides[this.slideNavigator.currentIndex + 1];
      const slide = this.deck.slides[this.slideNavigator.currentIndex];
      if (this.elements.nextPreview) {
        this.elements.nextPreview.textContent = next
          ? SlideRenderer.getSlideTitleForUi(next, this.slideNavigator.currentIndex + 1)
          : "(End)";
      }
      if (this.elements.notesContainer) {
        this.elements.notesContainer.innerHTML = slide?.notes
          ? this.renderNotes(slide.notes)
          : "<p class='notes-empty'>No notes</p>";
      }
    }
  }

  toggleFullscreen() {
    UiActions.toggleFullscreen(this.elements.stageHost);
  }

  toggleEditMode() {
    try {
      window.__WEBDECK_EDIT_CONTROLLER__.toggleEditMode();
    } catch (error) {
      console.error("Error: __WEBDECK_EDIT_CONTROLLER__ not found", error);
    }
    // Notify the navigator that edit mode has changed
    this.slideNavigator.onEditModeChanged();
  }

  toggleMenu() {
    UiActions.toggleMenu(this.elements.menuDropdown);
  }

  closeMenu() {
    UiActions.toggleMenu(this.elements.menuDropdown, false);
  }

  async handlePrint({ triggerBrowserPrint = true } = {}) {
    await PrintManager.handlePrint(this.elements.slidesContainer, this.deck?.meta?.title, {
      triggerBrowserPrint,
    });
  }

  async handleHtmlExport({ filename = null } = {}) {
    await HtmlExportManager.handleHtmlExport(this.elements.slidesContainer, this.deck, {
      filename,
    });
  }

  async handleTextpackExport({ filename = null } = {}) {
    const editController = window.__WEBDECK_EDIT_CONTROLLER__;
    const markdown =
      editController?.markdownEditor?.getValue?.() ??
      localStorage.getItem("webdeck_local_file") ??
      "";
    await TextpackExportManager.handleTextpackExport(markdown, this.deck, { filename });
  }

  async handleNewPresentation() {
    NewPresentationModal.setOnPickImage((onSelect) => {
      ImagePicker.show(
        (path) => {
          onSelect(path, "");
        },
        { pathOnly: true },
      );
    });
    const options = await NewPresentationModal.show();
    if (!options) return;

    const { background, theme, titleStyle, areaStyle, template } = options;

    let markdown = template.markdown;

    // Apply background, theme, header-style, and area-style to all slides
    // Title slides (layout: title-slide) get background/theme/header-style but NOT area-style
    markdown = markdown.replace(/^(layout: .+)$/gm, (match) => {
      let result = match;
      const isTitleSlide = match.includes("title-slide");
      if (background) result += `\nbackground: ${background}`;
      if (theme) result += `\ntheme: ${theme}`;
      if (titleStyle && titleStyle !== "short") result += `\nheader-style: ${titleStyle}`;
      if (areaStyle && !isTitleSlide) result += `\narea-style: ${areaStyle}`;
      return result;
    });

    // Store markdown in localStorage so edit mode can work
    localStorage.setItem("webdeck_local_file", markdown);
    localStorage.setItem("webdeck_local_file_type", "md");
    localStorage.setItem("webdeck_local_file_name", "New Presentation");
    localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());

    // Parse markdown into deck data
    await AssetLoader.ensureMarkdownItLoaded();
    const deckData = new MarkdownParser().parseDeckMarkdown(markdown);

    // Replace the current deck
    if (this.reloadManager?.replaceDeck) {
      await this.reloadManager.replaceDeck(deckData, { startAtFirstSlide: true });
    }

    // Update editor if open
    const editor = document.getElementById("markdownEditor");
    if (editor?.CodeMirror) {
      editor.CodeMirror.setValue(markdown);
    }

    Notification.info("New presentation created");
  }

  async handleConvertPptx() {
    const { ConversionModal } = await import("../editor/conversion-modal.js");
    const result = await ConversionModal.show();
    if (!result || !result.markdown) return;

    // Close the conversion modal
    ConversionModal.close();

    let { markdown, images, importImages, deckName } = result;

    // Show a loading overlay while the deck is being saved and loaded
    const loading = Notification.showLoadingModal("Saving deck and uploading images…", {
      title: "Importing PPTX",
      type: "info",
      cancelLabel: "Cancel",
      onCancel: () => {},
    });

    try {
      // Upload PPTX-extracted images via the CLI server API
      // and build a mapping from original filenames to server-saved paths.
      /** @type {Map<string, string>} */
      const imagePathMap = new Map();
      if (importImages && images?.length) {
        let uploaded = 0;
        const total = images.filter((img) => img.base64 && img.ref).length;
        await Promise.all(
          images.map(async (img) => {
            if (!img.base64 || !img.ref) return;
            const rawName = img.ref.split("/").pop();
            if (!rawName) return;
            const safeName = rawName.replace(/\.(emf|wmf|tif|tiff|bmp)$/i, ".png");

            // Convert base64 to File object
            const raw = img.base64
              .replace(/^data:[^;]*;base64,/, "")
              .replace(/\s+/g, "")
              .replace(/-/g, "+")
              .replace(/_/g, "/");
            const pad = raw.length % 4;
            const padded = pad ? raw + "=".repeat(4 - pad) : raw;
            let binary;
            try {
              binary = atob(padded);
            } catch (err) {
              console.warn("Failed to decode base64 for image:", img.ref, "sample:", padded.slice(0, 80));
              return;
            }
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const ext = safeName.match(/\.[^.]+$/)?.[0] || ".png";
            const blob = new Blob([bytes], { type: `image/${ext.slice(1)}` });
            const file = new File([blob], safeName, { type: blob.type });

            // Upload via API
            try {
              const formData = new FormData();
              formData.append("image", file);
              const res = await fetch("/api/upload-image", { method: "POST", body: formData });
              if (!res.ok) {
                console.warn("Failed to upload PPTX image:", safeName, "status:", res.status);
                return;
              }
              const data = await res.json();
              if (data?.path) {
                imagePathMap.set(rawName, data.path);
              }
            } catch {
              console.warn("Failed to upload PPTX image:", safeName);
            }
            uploaded++;
            if (total > 0) {
              loading.updateMessage(`Uploading images… ${uploaded}/${total}`);
              loading.updateProgress(Math.round((uploaded / total) * 60));
            }
          }),
        );

        // Rewrite markdown image references to use the server-saved paths.
        if (imagePathMap.size > 0) {
          let updated = markdown;
          for (const [oldName, newPath] of imagePathMap) {
            const oldRef = `images/${oldName}`;
            const escaped = oldRef.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            updated = updated.replace(new RegExp(escaped, "g"), newPath);
          }
          markdown = updated;
        }
      }

      loading.updateMessage("Loading slides…");
      loading.updateProgress(70);

      // Store markdown info in localStorage so edit mode can find it
      try {
        localStorage.setItem("webdeck_local_file", markdown);
        localStorage.setItem("webdeck_local_file_type", "md");
        localStorage.setItem("webdeck_local_file_name", "pptx-import");
        localStorage.setItem("webdeck_local_file_timestamp", Date.now().toString());
      } catch {
        window.__WEBDECK_MARKDOWN__ = markdown;
      }

      // Persist draft so a page refresh doesn't lose the imported deck
      await DraftManager.saveDraft(markdown);

      // Parse and replace deck
      await AssetLoader.ensureMarkdownItLoaded();
      const deckData = new MarkdownParser().parseDeckMarkdown(markdown);

      loading.updateProgress(85);

      if (this.reloadManager?.replaceDeck) {
        await this.reloadManager.replaceDeck(deckData, { startAtFirstSlide: true });
      }

      loading.updateProgress(95);

      // Open edit mode so the user can review and edit the result
      this.toggleEditMode();

      // Flag the save manager to use file picker instead of overwriting
      // the currently loaded deck file via the CLI API.
      const editCtrl = window.__WEBDECK_EDIT_CONTROLLER__;
      if (editCtrl?.saveManager) {
        editCtrl.saveManager.needsSaveAs = true;
      }

      loading.updateProgress(100);
      loading.dismiss();

      Notification.success("PPTX imported successfully.", 0, {
        actions: [
          {
            label: "Save as .textpack",
            onClick: async () => {
              try {
                const mockDeck = { meta: { title: deckName || "pptx-import" } };
                await TextpackExportManager.handleTextpackExport(
                  markdown,
                  mockDeck,
                  { filename: deckName || "pptx-import" },
                );
                Notification.success("Deck exported as .textpack!");
              } catch (err) {
                if (err?.name !== "AbortError") {
                  console.error("Textpack export failed:", err);
                  Notification.error("Export failed: " + (err.message || err));
                }
              }
            },
          },
          {
            label: "Save as .md (markdown only)",
            onClick: async () => {
              const mdBlob = new Blob([markdown], { type: "text/markdown" });
              try {
                if (window.showSaveFilePicker) {
                  const handle = await window.showSaveFilePicker({
                    suggestedName: `${deckName || "pptx-import"}.md`,
                    types: [
                      {
                        description: "Markdown file",
                        accept: { "text/markdown": [".md"] },
                      },
                    ],
                  });
                  const writable = await handle.createWritable();
                  await writable.write(mdBlob);
                  await writable.close();
                  Notification.success("Deck saved!");
                  return;
                }
              } catch (err) {
                if (err?.name === "AbortError") return;
              }
              const url = URL.createObjectURL(mdBlob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${deckName || "pptx-import"}.md`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            },
          },
        ],
      });

    } catch (err) {
      loading.dismiss();
      console.error("PPTX import failed:", err);
      Notification.error(`Import failed: ${err.message || err}`);
    }
  }

  destroy() {
    if (this.reloadManager) this.reloadManager.destroy();
    if (this.breakManager) this.breakManager.destroy();
    if (this.freezeManager) this.freezeManager.destroy();
    if (this.roleManager) this.roleManager.destroy();
    if (window.__WEBDECK_EDIT_CONTROLLER__?.destroy) {
      window.__WEBDECK_EDIT_CONTROLLER__.destroy();
    }
    this.removeAllListeners();
  }
}
