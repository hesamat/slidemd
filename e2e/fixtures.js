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
      page.on("console", onConsole);

      await use(messages);
      page.off("console", onConsole);

      if (testInfo.status !== testInfo.expectedStatus && messages.length > 0) {
        await testInfo.attach("browser-console.json", {
          body: Buffer.from(JSON.stringify(messages, null, 2)),
          contentType: "application/json",
        });
      }
    },
    { auto: true },
  ],
});

export { expect };
