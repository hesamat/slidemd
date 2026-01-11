# HTML Slides — Quick Guide

A lightweight, browser-based slide deck with a presenter view. Slides are defined in JSON and rendered by `slides.js` inside `test4.html`.

## Run Locally

Because `slides.js` fetches `slides.json`, serve files over HTTP (not `file://`).

- Python (built-in on many systems):

```powershell
python -m http.server 8000
```
Open http://localhost:8000/test4.html

- Node.js (if installed):

```powershell
npx serve .
```
Open the served URL and navigate to `/test4.html`.

## File Layout

- `test4.html` — main deck page (light theme)
- `slides.js` — loads `slides.json`, renders slides, presenter features
- `slides.json` — slide data (array of slide objects)

## slides.json — Structure

Top-level is an array of slide objects. Each object supports common fields plus optional fields depending on `layout`.

### Common Fields
- `id` (number): Unique per slide; order in the array determines slide order
- `layout` (string): One of the supported layout names (see below)
- `title` (string, optional): Main heading
- `content` (string, optional): Paragraph text; newlines supported
- `bullets` (string[], optional): Bullet points
- `notes` (string, optional): Presenter-only notes
- `wrapperClass` (string, optional): Tailwind classes for the slide wrapper (theme per slide)
- `innerClass` (string, optional): Tailwind classes for inner content wrapper

#### Reference Link Footer (optional)
- `referenceUrl` or `referenceLink` (string): URL to display as a small footer link.
- `referenceLabel` or `referenceText` (string): Label to show for the link; if omitted, the URL hostname is used.
- `reference` (string): If a URL, treated like `referenceUrl`; if plain text, displayed as non-clickable reference text.

### Layouts and Fields

- `title-center`
  - Fields: `title`, `content`, `bullets`, `wrapperClass`, `innerClass`, `notes`
  - Behavior: Centered title, optional paragraph and bullets.

- `center-big`
  - Fields: Same as `title-center`
  - Behavior: Similar to `title-center` with emphasis/spacing for big center content.

- `two-column`
  - Fields: `title`, `leftTitle`, `leftItems[]`, `rightTitle`, `rightItems[]`, `wrapperClass`, `notes`
  - Behavior: Two lists side-by-side with headings.

- `bullets-big`
  - Fields: `title`, `bullets[]`, `wrapperClass`, `notes`
  - Behavior: Large bullet list under a title.

- `title-bullets`
  - Fields: `title`, `subtitle`, `bullets[]`, `wrapperClass`, `notes`
  - Behavior: Title + subtitle + bullet list.

- `cards-grid`
  - Fields: `title`, `subtitle`, `cards[{ title, body }]`, `wrapperClass`, `notes`
  - Behavior: Responsive grid of cards.

- `image-full`
  - Fields: `imageUrl` (required), `imageAlt` (recommended), `title` (optional), `wrapperClass`, `notes`
  - Behavior: Big, centered image; optional title above.

- `image-caption`
  - Fields: `imageUrl`, `imageAlt`, `caption`, `title` (optional), `wrapperClass`, `notes`
  - Behavior: Image with caption below.

- `media-left` / `media-right`
  - Fields: `mediaType` ("image" | "video"), `mediaUrl` (required for video; for image you can also use `imageUrl`), `imageAlt`, `title` (optional), `content` (optional), `bullets[]` (optional), `wrapperClass`, `notes`
  - Behavior: Split media + text; `media-right` flips order.

- `code`
  - Fields: `title` (optional), `code` (string), `caption` (optional), `wrapperClass`, `notes`
  - Behavior: Preformatted code block; basic styling.

- `quote`
  - Fields: `quote` (string), `author` (optional), `wrapperClass`, `notes`
  - Behavior: Centered quotation with optional author line.

## Sample slides.json

```json
[
  {
    "id": 1,
    "layout": "title-center",
    "title": "Welcome",
    "content": "A lightweight, browser-based slide deck with presenter mode.",
    "bullets": ["Keyboard navigation", "Presenter notes", "PDF export"],
    "notes": "Intro slide notes go here.",
    "wrapperClass": "bg-gradient-to-br from-white via-slate-50 to-emerald-50"
  },
  {
    "id": 9,
    "layout": "title-bullets",
    "title": "CI/CD Basics",
    "bullets": ["Build", "Test", "Deploy"],
    "referenceUrl": "https://martinfowler.com/articles/continuousIntegration.html",
    "referenceLabel": "Martin Fowler: Continuous Integration"
  },
  {
    "id": 2,
    "layout": "two-column",
    "title": "Two-Column Overview",
    "leftTitle": "Audience",
    "leftItems": ["Sees slides", "Project/share this window"],
    "rightTitle": "Presenter",
    "rightItems": ["Sees notes", "Next slide preview", "Timer"],
    "notes": "Explain dual-window flow."
  },
  {
    "id": 3,
    "layout": "title-bullets",
    "title": "Shortcuts",
    "subtitle": "Know your keys",
    "bullets": ["→/↓/Space: Next", "←/↑: Previous", "P: Presenter", "E: Export PDF"]
  },
  {
    "id": 4,
    "layout": "cards-grid",
    "title": "Highlights",
    "subtitle": "Composable layouts",
    "cards": [
      { "title": "Simple", "body": "Edit JSON, refresh to update." },
      { "title": "Flexible", "body": "Mix text, images, code, and quotes." },
      { "title": "Presenter", "body": "Notes and previews built-in." },
      { "title": "Export", "body": "Use your browser’s print to PDF." }
    ]
  },
  {
    "id": 5,
    "layout": "image-caption",
    "title": "Figure 1",
    "imageUrl": "images/architecture.png",
    "imageAlt": "System architecture diagram",
    "caption": "High-level architecture overview.",
    "notes": "Call out key services and data flows."
  },
  {
    "id": 6,
    "layout": "media-left",
    "title": "Demo Screenshot",
    "mediaType": "image",
    "mediaUrl": "images/demo.png",
    "imageAlt": "App demo",
    "content": "On the right, summarize what the image shows.",
    "bullets": ["Feature A", "Feature B", "Performance results"]
  },
  {
    "id": 7,
    "layout": "code",
    "title": "Code Snippet",
    "code": "function greet(name) {\n  return `Hello, ${name}!`;\n}\nconsole.log(greet('World'));",
    "caption": "Minimal example, ready to run."
  },
  {
    "id": 8,
    "layout": "quote",
    "quote": "Simplicity is the ultimate sophistication.",
    "author": "Leonardo da Vinci",
    "notes": "Nice break slide after technical sections."
  }
]
```

## Tips
- Images/videos: Use absolute URLs or relative paths and serve them via the same local server.
- IDs: Must be unique; order in the file controls slide order.
- Optional fields: Omit what you don’t need; the renderer handles missing fields.
- Theming: Prefer `wrapperClass` for background/theme per slide; use `innerClass` for fine-grained layout tweaks.

## Extending Layouts
To add a new layout, update the `createSlideElement()` switch in `slides.js` with a new `layout` branch and the expected fields. Keep presenter preview (`makePreviewContent`) in sync for a better presenter experience.
