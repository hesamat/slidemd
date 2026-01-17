import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = process.cwd();
const distDir = path.join(root, "dist");

const args = process.argv.slice(2);

/**
 * Resolve HTML file path from arguments.
 *
 * Usage: node pdf.mjs [html-path]
 *
 * Arguments:
 *   html-path - Path to the HTML file. Can be:
 *               - A filename relative to the dist directory (e.g., "deck.html", "presentation.html")
 *               - An absolute path (e.g., "/path/to/deck.html" on Unix, "C:\\path\\to\\deck.html" on Windows)
 *               - Defaults to "dist/deck.html" if not provided
 *
 * Examples:
 *   node pdf.mjs                    # Use default dist/deck.html
 *   node pdf.mjs my-deck.html      # Use my-deck.html from dist directory
 *   node pdf.mjs ./dist/deck.html  # Use relative path
 *   node pdf.mjs /absolute/path/deck.html  # Use absolute path
 */
function resolveHtmlPath() {
    const htmlArg = args.find(arg => !arg.startsWith("--"));

    if (!htmlArg) {
        return path.join(distDir, "deck.html");
    }

    // Check if it's an absolute path
    if (path.isAbsolute(htmlArg)) {
        return htmlArg;
    }

    // Check if it's already a path to dist
    if (htmlArg.includes("dist")) {
        return path.join(root, htmlArg);
    }

    // Otherwise, resolve relative to dist directory
    return path.join(distDir, htmlArg);
}

const distHtml = resolveHtmlPath();
const outPdf = path.join(distDir, `${path.basename(distHtml, path.extname(distHtml))}.pdf`);

if (!fs.existsSync(distHtml)) {
    throw new Error(`HTML file not found: ${distHtml}\nRun: npm run build`);
}

const urlObj = pathToFileURL(distHtml);
urlObj.searchParams.set("role", "viewer");
const url = urlObj.toString();

console.log(`Loading ${url}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
console.log("Page loaded");

// Wait for the deck runtime to finish rendering/enhancing content.
try {
    await page.waitForFunction(() => window.__WEBDECK_READY__ === true, null, { timeout: 30_000 });
    console.log("Deck ready");
} catch {
    // Fallback: continue; the font/image settle step below will still guard against most layout shifts.
    console.log("Deck ready signal not found (continuing)");
}

// Ensure print sizing for code/blockquote matches dev theme (no change to print.css on disk).
await page.addStyleTag({
    content: `@media print {
        .slide__area pre { font-size: 28px !important; line-height: 1.2 !important; padding: 18px !important; }
        .slide__area pre code { font-size: 1.4rem !important; line-height: 1.2 !important; }
        .slide__area blockquote { font-size: 32px !important; line-height: 1.3 !important; }
        .slide__page-number { position: absolute; right: 22px; bottom: 18px; font-size: 18px; color: rgba(15,23,42,0.65); }
    }`,
});

// Inject page numbers per slide (print only styling applied above)
await page.evaluate(() => {
    const slides = Array.from(document.querySelectorAll('.slide'));
    slides.forEach((slide, idx) => {
        let badge = slide.querySelector('.slide__page-number');
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'slide__page-number';
            slide.appendChild(badge);
        }
        badge.textContent = `${idx + 1}/${slides.length}`;
    });
});

await page.emulateMedia({ media: "print" });
console.log("Print media emulated");

// Ensure fonts + images are fully loaded/decoded before PDF capture to avoid layout shifts.
await page.evaluate(async () => {
    const withTimeout = async (promise, ms) => {
        let timeoutId;
        const timeout = new Promise((resolve) => {
            timeoutId = setTimeout(resolve, ms);
        });

        try {
            await Promise.race([promise, timeout]);
        } finally {
            clearTimeout(timeoutId);
        }
    };

    // Wait for web fonts
    if (document.fonts && document.fonts.ready) {
        try {
            await withTimeout(document.fonts.ready, 5_000);
        } catch {
            // ignore
        }
    }

    const images = Array.from(document.images);
    await withTimeout(
        Promise.all(
            images.map((img) => {
                if (img.complete) return Promise.resolve();
                return new Promise((resolve) => {
                    const done = () => resolve();
                    img.addEventListener("load", done, { once: true });
                    img.addEventListener("error", done, { once: true });
                });
            })
        ),
        8_000
    );

    // Give the browser a beat to settle layout after media emulation.
    await new Promise((r) => setTimeout(r, 50));
});

console.log("Fonts/images settled (or timed out)");

// Deterministic 16:9 page size; matches styles.css @page and print rules.
const pdfOptions = {
    printBackground: true,
    scale: 1,
    width: "20in",
    height: "11.25in",
    margin: { top: "0in", right: "0in", bottom: "0in", left: "0in" },
    preferCSSPageSize: false,
};

try {
    await page.pdf({ path: outPdf, ...pdfOptions });
    console.log(`Wrote ${outPdf}`);
} catch (err) {
    const code = err && typeof err === "object" ? err.code : undefined;
    if (code !== "EBUSY" && code !== "EPERM") throw err;

    const stamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .replace("T", "_")
        .replace("Z", "");
    const baseName = path.basename(distHtml, path.extname(distHtml));
    const outAlt = path.join(distDir, `${baseName}-${stamp}.pdf`);
    await page.pdf({ path: outAlt, ...pdfOptions });
    console.log(`Wrote ${outAlt} (${baseName}.pdf was locked)`);
}

await browser.close();
