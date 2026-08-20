import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  consoleMessages: [
    async ({ page }, use, testInfo) => {
      const messages = [];
      const maxMessages = 200;
      const onConsole = (message) => {
        if (messages.length === maxMessages) messages.shift();
        messages.push({ type: message.type(), text: message.text() });
      };
      const onPageError = (error) => {
        messages.push({ type: "pageerror", text: String(error?.message || error) });
        console.error(`[pageerror] ${error?.message || error}`);
      };
      page.on("console", onConsole);
      page.on("pageerror", onPageError);

      await use(messages);
      page.off("console", onConsole);
      page.off("pageerror", onPageError);

      if (testInfo.status !== testInfo.expectedStatus && messages.length > 0) {
        await testInfo.attach("browser-console.json", {
          body: Buffer.from(JSON.stringify(messages, null, 2)),
          contentType: "application/json",
        });
        // Also print to stdout so it appears in CI logs (attachments are not
        // always downloadable from failed runs).
        const errors = messages.filter((m) => m.type === "error" || m.type === "pageerror");
        if (errors.length > 0) {
          console.log(`\n=== Browser errors for ${testInfo.title} ===`);
          for (const e of errors) console.log(`  [${e.type}] ${e.text}`);
          console.log(`=== End browser errors ===\n`);
        }
      }
    },
    { auto: true },
  ],
});

export { expect };
