import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = process.cwd();
const distHtml = path.join(root, "dist", "deck.html");
const outPdf = path.join(root, "dist", "deck.pdf");

if (!fs.existsSync(distHtml)) {
    throw new Error("dist/deck.html not found. Run: npm run build");
}

const url = pathToFileURL(distHtml).toString();

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
    const outAlt = path.join(root, "dist", `deck-${stamp}.pdf`);
    await page.pdf({ path: outAlt, ...pdfOptions });
    console.log(`Wrote ${outAlt} (deck.pdf was locked)`);
}

await browser.close();
