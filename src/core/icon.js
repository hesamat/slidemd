/**
 * Centralized icon helper.
 *
 * Wraps Lucide icons so every icon in the app has a single source of truth
 * with consistent sizing, stroke width, `currentColor`, and accessibility
 * (`aria-hidden`). Lives in `core/` so any layer (renderer, editor, ui) can
 * import it without violating the layering invariants.
 *
 * Usage:
 *   import { icon, ICONS } from "../core/icon.js";
 *   btn.appendChild(icon("close"));                 // default size
 *   btn.appendChild(icon("save", { size: "sm" }));  // 14px
 *   const svg = icon("x");                          // returns an <svg> Element
 *
 * For static HTML strings (e.g. innerHTML templates that are sanitized),
 * use `iconString(name, opts)` which returns the serialized SVG markup.
 */

// Namespace import keeps this module usable in the runtime HTML export,
// where the concatenated bundle strips ESM imports (see
// HtmlExportManager.stripEsmSyntax). The fallback reads the UMD global the
// export fetches as a vendor script; when neither is present (stripped
// import, no UMD), icon lookups resolve to undefined and icon()/iconString()
// return null/"" so callers degrade gracefully instead of throwing.
import * as lucideModule from "lucide";

const lucide =
  (typeof lucideModule !== "undefined" &&
    lucideModule &&
    typeof lucideModule.X !== "undefined" &&
    lucideModule) ||
  globalThis.lucide ||
  {};

const {
  X,
  Menu,
  Ellipsis,
  EllipsisVertical,
  Upload,
  FileUp,
  SquarePlus,
  Pencil,
  Save,
  RefreshCw,
  Terminal,
  Printer,
  Download,
  Settings,
  Sun,
  Moon,
  Monitor,
  Maximize,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  LayoutTemplate,
  Columns3,
  LayoutGrid,
  Image: ImageIcon,
  Type,
  Workflow,
  Sparkles,
  Wrench,
  Headphones,
  Lock,
  LockOpen,
  Unlock,
  File,
  FileText,
  Folder,
  FolderArchive,
  FolderOpen,
  TriangleAlert,
  CircleAlert,
  Check,
  Info,
  RotateCcw,
  RotateCw,
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  ArrowLeftRight,
  Plane,
  PanelLeft,
  Eye,
  EyeOff,
  Send,
  Clipboard,
  ArrowUp,
  ArrowDown,
  Presentation,
  Ban,
  GripVertical,
  SlidersHorizontal,
  Palette,
  Pipette,
  Brush,
  Copy,
  Trash2,
  PencilLine,
  Wand2,
  ExternalLink,
  MessageSquare,
  MessageCircle,
} = lucide;

/**
 * Canonical size tokens (px). Mirrored as CSS custom properties in
 * `styles/base.css` (`--icon-sm`, `--icon-md`, etc.) so CSS can size icons
 * without overriding the SVG width/height attributes.
 */
export const ICON_SIZES = Object.freeze({
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  "2xl": 24,
});

/**
 * Default size used when `opts.size` is omitted.
 */
const DEFAULT_SIZE = "md";

/**
 * Semantic name -> Lucide icon node. Adding a new icon = add one entry here.
 * Keep keys lowercase, kebab-case; consumers use `icon("close")`, etc.
 */
export const ICONS = Object.freeze({
  // Close / dismiss
  close: X,
  x: X,
  // Menus
  menu: Menu,
  "more-horizontal": Ellipsis,
  ellipsis: Ellipsis,
  "more-vertical": EllipsisVertical,
  // File ops
  upload: Upload,
  "file-up": FileUp,
  open: Upload, // "open file" affordance; Upload matches the existing arrow-up glyph
  "square-plus": SquarePlus,
  "plus-square": SquarePlus,
  pencil: Pencil,
  edit: Pencil,
  save: Save,
  reload: RefreshCw,
  "refresh-cw": RefreshCw,
  terminal: Terminal,
  "command-palette": Terminal,
  printer: Printer,
  print: Printer,
  download: Download,
  export: Download,
  settings: Settings,
  // Theme
  sun: Sun,
  moon: Moon,
  monitor: Monitor,
  presentation: Presentation,
  // Layout / format
  "layout-template": LayoutTemplate,
  layout: LayoutTemplate,
  columns: Columns3,
  "layout-grid": LayoutGrid,
  grid: LayoutGrid,
  image: ImageIcon,
  type: Type,
  text: Type,
  workflow: Workflow,
  diagram: Workflow,
  sparkles: Sparkles,
  ai: Sparkles,
  wrench: Wrench,
  "clean-up": Wrench,
  headphones: Headphones,
  "speaker-notes": Headphones,
  // Chevrons
  "chevron-down": ChevronDown,
  "chevron-up": ChevronUp,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  // Plus / minus
  plus: Plus,
  minus: Minus,
  // Image properties
  lock: Lock,
  "lock-open": LockOpen,
  unlock: Unlock,
  "rotate-ccw": RotateCcw,
  "rotate-cw": RotateCw,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "arrow-up-down": ArrowUpDown,
  "arrow-left-right": ArrowLeftRight,
  plane: Plane,
  // Files / folders
  file: File,
  "file-text": FileText,
  folder: Folder,
  "folder-open": FolderOpen,
  "folder-archive": FolderArchive,
  textpack: FolderArchive,
  // Notifications
  check: Check,
  "triangle-alert": TriangleAlert,
  warning: TriangleAlert,
  "circle-alert": CircleAlert,
  info: Info,
  // Misc UI
  "panel-left": PanelLeft,
  eye: Eye,
  "eye-off": EyeOff,
  send: Send,
  clipboard: Clipboard,
  "arrow-up": ArrowUp,
  "arrow-down": ArrowDown,
  maximize: Maximize,
  ban: Ban,
  "grip-vertical": GripVertical,
  "sliders-horizontal": SlidersHorizontal,
  palette: Palette,
  pipette: Pipette,
  brush: Brush,
  copy: Copy,
  trash: Trash2,
  "pencil-line": PencilLine,
  wand: Wand2,
  "external-link": ExternalLink,
  "message-square": MessageSquare,
  message: MessageSquare,
  "message-circle": MessageCircle,
  "chat-bubble": MessageCircle,
});

/**
 * Default SVG attributes applied to every icon. Mirrors Lucide's
 * `defaultAttributes` but with `aria-hidden="true"` and `currentColor` so
 * icons inherit text color and are hidden from assistive tech by default.
 */
const BASE_ATTRS = Object.freeze({
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": 2,
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "aria-hidden": "true",
  focusable: "false",
});

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Build a single SVG child element from a Lucide node tuple
 * `[tag, attrs, children?]`.
 * @param {[string, object, any[]?]} node
 * @returns {SVGElement}
 */
function buildNode(node) {
  const [tag, attrs, children] = node;
  const el = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, String(value));
  }
  if (children?.length) {
    for (const child of children) {
      el.appendChild(buildNode(child));
    }
  }
  return el;
}

/**
 * Resolve a semantic icon name to its Lucide icon node.
 * @param {string} name
 * @returns {Array|null}
 */
function resolveIcon(name) {
  const node = ICONS[name];
  if (!node) {
    console.warn(`[icon] Unknown icon name: "${name}"`);
    return null;
  }
  return node;
}

/**
 * Create an SVG icon element for the given semantic name.
 *
 * @param {string} name - One of the keys in {@link ICONS}.
 * @param {object} [opts]
 * @param {("xs"|"sm"|"md"|"lg"|"xl"|"2xl"|number)} [opts.size="md"]
 *   Size token or explicit pixel value.
 * @param {string} [opts.class] - Extra class(es) to add to the `<svg>`.
 * @param {string} [opts.label] - Accessible label. When provided, sets
 *   `role="img"` and `aria-label` and removes `aria-hidden`.
 * @param {number} [opts.strokeWidth] - Override stroke-width (default 2).
 * @returns {SVGElement|null} The `<svg>` element, or null if `name` is unknown.
 */
export function icon(name, opts = {}) {
  const node = resolveIcon(name);
  if (!node) return null;

  const sizeToken = opts.size ?? DEFAULT_SIZE;
  const px =
    typeof sizeToken === "number" ? sizeToken : (ICON_SIZES[sizeToken] ?? ICON_SIZES[DEFAULT_SIZE]);

  const svg = document.createElementNS(SVG_NS, "svg");
  for (const [k, v] of Object.entries(BASE_ATTRS)) {
    svg.setAttribute(k, v);
  }
  svg.setAttribute("width", String(px));
  svg.setAttribute("height", String(px));

  if (opts.strokeWidth != null) {
    svg.setAttribute("stroke-width", String(opts.strokeWidth));
  }
  if (opts.class) {
    svg.setAttribute("class", opts.class);
  }
  if (opts.label) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", opts.label);
    svg.removeAttribute("aria-hidden");
  }

  for (const child of node) {
    svg.appendChild(buildNode(child));
  }
  return svg;
}

/**
 * Serialize an icon to an SVG string. Use this for static HTML templates
 * that are subsequently sanitized with DOMPurify. For DOM construction,
 * prefer {@link icon} which returns an Element.
 *
 * @param {string} name
 * @param {object} [opts] - Same as {@link icon}.
 * @returns {string} SVG markup, or empty string if `name` is unknown.
 */
export function iconString(name, opts = {}) {
  const node = resolveIcon(name);
  if (!node) return "";

  const sizeToken = opts.size ?? DEFAULT_SIZE;
  const px =
    typeof sizeToken === "number" ? sizeToken : (ICON_SIZES[sizeToken] ?? ICON_SIZES[DEFAULT_SIZE]);

  const attrs = { ...BASE_ATTRS, width: px, height: px };
  if (opts.strokeWidth != null) attrs["stroke-width"] = opts.strokeWidth;
  if (opts.class) attrs.class = opts.class;
  if (opts.label) {
    attrs.role = "img";
    attrs["aria-label"] = opts.label;
    delete attrs["aria-hidden"];
  }

  const attrStr = Object.entries(attrs)
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, "&quot;")}"`)
    .join(" ");

  const inner = node.map(([tag, a, children]) => serializeNode(tag, a, children)).join("");

  return `<svg ${attrStr}>${inner}</svg>`;
}

/**
 * Recursively serialize a Lucide node tuple to SVG markup.
 * @param {string} tag
 * @param {object} attrs
 * @param {Array} [children]
 * @returns {string}
 */
function serializeNode(tag, attrs, children) {
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, "&quot;")}"`)
    .join(" ");
  const inner = children?.length
    ? children.map(([t, a, c]) => serializeNode(t, a, c)).join("")
    : "";
  return `<${tag} ${attrStr}>${inner}</${tag}>`;
}

/**
 * Replace every `<i data-icon="name">` (or any element with a `data-icon`
 * attribute) inside `root` with the corresponding SVG icon. Preserves all
 * other attributes (class, style, data-*, aria-*) on the placeholder element
 * so CSS rules and theme toggling continue to work.
 *
 * Recognized attributes on the placeholder:
 *   - `data-icon` — semantic icon name (required)
 *   - `data-size` — size token ("xs".."2xl") or numeric px (optional, default "md")
 *   - `data-stroke-width` — override stroke-width (optional)
 *   - `data-label` — accessible label; sets role="img" + aria-label (optional)
 *   - any other attribute (class, style, aria-*, data-*) is transferred to the SVG
 *
 * @param {ParentNode} root - Defaults to `document` (whole page).
 * @returns {number} Number of icons hydrated.
 */
export function hydrateIcons(root = document) {
  const placeholders = root.querySelectorAll("[data-icon]");
  let count = 0;
  for (const el of placeholders) {
    const name = el.getAttribute("data-icon");
    if (!name) continue;

    const opts = {};
    const sizeAttr = el.getAttribute("data-size");
    if (sizeAttr) {
      const n = Number(sizeAttr);
      opts.size = Number.isFinite(n) && sizeAttr.trim() !== "" ? n : sizeAttr;
    }
    const strokeWidth = el.getAttribute("data-stroke-width");
    if (strokeWidth) opts.strokeWidth = Number(strokeWidth);
    const label = el.getAttribute("data-label");
    if (label) opts.label = label;

    const svg = icon(name, opts);
    if (!svg) continue;

    // Transfer all attributes except data-icon/data-size/data-stroke-width/data-label
    // from the placeholder to the SVG.
    for (const attr of Array.from(el.attributes)) {
      if (
        attr.name === "data-icon" ||
        attr.name === "data-size" ||
        attr.name === "data-stroke-width" ||
        attr.name === "data-label"
      ) {
        continue;
      }
      svg.setAttribute(attr.name, attr.value);
    }

    el.replaceWith(svg);
    count++;
  }
  return count;
}
