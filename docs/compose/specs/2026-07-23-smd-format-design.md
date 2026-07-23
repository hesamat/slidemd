# Self-Contained Deck Formats (.smd + remote .md)

## [S1] Problem

Opening a markdown presentation requires picking a folder for image resolution, which is confusing for users. Key issues:

- Users expect to open a file, not a directory
- Image path resolution requires directory handles (File System Access API)
- Different behavior across browsers
- No easy way to share a deck with images — must send a folder

## [S2] Solution — Clean Format Separation

Two strictly defined formats with no legacy migration:

| Format | Container      | Images                                        | Use Case                                              |
| ------ | -------------- | --------------------------------------------- | ----------------------------------------------------- |
| `.smd` | ZIP archive    | Separate files in `images/` folder inside ZIP | Local presentations, single-file sharing, offline use |
| `.md`  | Plain markdown | Remote URLs (`https://...`) only              | Text-only decks, Git-backed remote-image decks        |

**User flow:**

1. **Open**: File picker for `*.smd` or `*.md` (no folder picker needed at all)
2. **Edit**: Markdown editable in app editor. Uploads stored as in-memory Blobs.
3. **Auto-Save**: Continuous draft saving to IndexedDB (prevents data loss on crash)
4. **Export/Save**: Manual save bundles to `.smd` via ZIP, or plain `.md` for remote URLs
5. **Share**: Send single `.smd` file — no folder needed

## [S3] Approach — Minimal & Resilient Integration

- Add `jszip` for `.smd` ZIP handling
- Add `localforage` for IndexedDB auto-save/crash recovery
- `DeckImagesResolver` intercepts standard relative paths (`images/foo.png`) and maps them to in-memory Blob URLs
- Save manager uses `showSaveFilePicker` where available, falls back to `<a download>` for Safari/Firefox

## [S4] New: `src/core/smd-handler.js`

Static utility class for ZIP operations:

```js
class SmdHandler {
  static async extractFromSmd(file) → { markdown: string, images: Map<string, Blob> }
  static async buildSmd(markdown, images) → Blob
}
```

- `extractFromSmd`: Uses JSZip to read `.smd` file, extracts `deck.md` and all files in `images/`
- `buildSmd`: Uses JSZip to create ZIP. **Must use `{ compression: "STORE" }` for image files** to prevent UI thread freezing on large JPEGs/PNGs

## [S5] New: `src/core/draft-manager.js` (IndexedDB)

Handles crash recovery and auto-save using `localforage`.

- `saveDraft(markdown, imageMap)`: Stores the current markdown string and `Map<string, Blob>` to IndexedDB
- `loadDraft()`: Retrieves draft on app load
- `clearDraft()`: Clears draft after a successful manual export to disk
- Auto-save triggers on editor `input` event (debounced) and image uploads

## [S6] Modified: `src/editor/ui/open-deck-modal.js`

Two open buttons with clear subtitles explaining the difference. No folder picker anywhere.

1. **"Open .smd File"** — subtitle: "Self-contained presentation with embedded local images."
   - `showOpenFilePicker({ accept: { 'application/octet-stream': ['.smd'] } })`
2. **"Open .md File"** — subtitle: "Plain markdown. Requires external image URLs (e.g., https://...)."
   - `showOpenFilePicker({ accept: { 'text/markdown': ['.md'] } })`

### Open flow for .smd:

1. `SmdHandler.extractFromSmd(file)` → `{ markdown, images }`
2. Map images to Blob URLs (`URL.createObjectURL`), store in `DeckLoader.smdImageCache`
3. Load markdown into editor
4. Trigger initial `DraftManager.saveDraft()`

### Open flow for .md:

1. Read file text
2. Load markdown into editor
3. Trigger initial `DraftManager.saveDraft()`

## [S7] Modified: `src/editor/image/deck-images-resolver.js`

The markdown always contains `![alt](images/filename.png)` for local images in .smd mode. The resolver maps these to in-memory Blob URLs.

Modified `resolvePreviewSrc(relPath)`:

- If `relPath` starts with `http://` or `https://` → return as-is (remote URL mode)
- If `relPath` starts with `images/` → look up in `DeckLoader.smdImageCache`
  - If found → return temporary Blob URL
  - If not found → return "Missing Image" placeholder (SVG data URI with filename)
- If `relPath` is a local path with no directory handle → return "Missing Image" placeholder

## [S8] Modified: `src/editor/ui/save-manager.js`

Save logic based on deck type:

**Export to Disk (Manual Save):**

1. Check if deck contains local images (Blob URLs in cache)
2. If yes (`.smd` mode):
   - Call `SmdHandler.buildSmd(markdown, images)` using `compression: "STORE"`
   - Try `window.showSaveFilePicker({ suggestedName: 'presentation.smd' })`
   - **Fallback:** If `showSaveFilePicker` is undefined, create `<a>` element with `URL.createObjectURL(zipBlob)` and `.click()` for download
3. If no local images (`.md` mode):
   - Save plain text file using the same picker/fallback logic
4. Call `DraftManager.clearDraft()`

## [S9] Modified: `src/editor/image/image-background-handler.js`

Upload logic adapts based on the file type the user currently has open:

| Mode        | Behavior                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `.smd` mode | Standard file picker → creates Blob URL → stores in `DeckLoader.smdImageCache` → inserts `![alt](images/filename.png)` into markdown |
| `.md` mode  | File picker disabled/hidden. "Insert Image URL" prompt shown instead. User pastes URL → inserts `![alt](https://...)` into markdown  |

No files are written to disk until the user manually clicks "Save/Export".

## [S10] Modified: `src/editor/image/image-inserter.js`

The `pickAndInsert()` method adapts based on file type:

- **`.smd` mode**: Opens the full ImagePicker modal with upload/existing/URL tabs
- **`.md` mode**: Shows a simple URL prompt (`window.prompt`) — no file picker, no directory handle resolution

Drag-drop and clipboard paste of images are disabled in `.md` mode (only URL-based insertion supported).

## [S11] Modified: `src/data/deck-loader.js`

New properties:

- `smdImageCache: Map<string, string>` — path → blob URL for local images
- `isSmdMode: boolean` — whether current deck is .smd format

`loadDeckData()` modified:

- On initialization, check `DraftManager.loadDraft()`. If a draft exists, prompt user: "Restore unsaved work?" If yes, load markdown and Blobs from IndexedDB into memory

## [S12] Dependencies

- Add `jszip` to `package.json` (~45KB gzipped)
- Add `localforage` to `package.json` (~8KB gzipped)

## [S13] Testing

- **Unit**: `SmdHandler` extract/build round-trip (verify `STORE` compression is used for images)
- **Unit**: `DraftManager` saves and retrieves a Map of Blobs from IndexedDB
- **Integration**: Open `.smd` → images display → upload new image → simulate browser crash (refresh) → restore from IndexedDB → export to `.smd` → all images present
- **Browser Fallback**: Test export in Safari/Firefox to ensure `<a download>` fallback triggers successfully
- **Edge cases**: `.smd` with no images, `.smd` with 20+ large images (verify UI doesn't freeze during ZIP creation), corrupted `.smd`
