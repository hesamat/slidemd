#!/usr/bin/env node
/**
 * Dev launcher: starts the CLI dev server and Vite in parallel.
 * Usage: node tools/dev.mjs [path] [--port 8000]
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const rawArgs = process.argv.slice(2);
const noOpen = rawArgs.includes("--no-open");
const args = rawArgs.filter((arg) => arg !== "--no-open");

// CLI server on port 8001
const cliArgs = ["tools/dev-server.mjs", ...args, "--port", "8001"];
const cli = spawn(process.execPath, cliArgs, {
  cwd: root,
  stdio: "inherit",
});

// Vite on port 8000 (proxies /api and /images to CLI server)
const viteScript = path.join(root, "node_modules", "vite", "bin", "vite.js");
const vite = spawn(process.execPath, [viteScript], {
  cwd: root,
  env: {
    ...process.env,
    ...(noOpen ? { WEBDECK_NO_OPEN: "1" } : {}),
  },
  stdio: "inherit",
});

let shutdownStarted = false;
let closedChildren = 0;
let forceShutdownTimer = null;

function terminate(child, signal = "SIGTERM") {
  if (!child.killed) child.kill(signal);
}

function shutdown(code) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  process.exitCode = typeof code === "number" ? code : 1;
  terminate(cli);
  terminate(vite);
  forceShutdownTimer = setTimeout(() => {
    terminate(cli, "SIGKILL");
    terminate(vite, "SIGKILL");
  }, 5_000);
  forceShutdownTimer.unref();
}

function handleClose(code) {
  if (!shutdownStarted) shutdown(code);
  closedChildren += 1;
  if (closedChildren === 2 && forceShutdownTimer) {
    clearTimeout(forceShutdownTimer);
  }
}

cli.on("error", (error) => {
  console.error("Failed to start the CLI dev server:", error);
  shutdown(1);
});
vite.on("error", (error) => {
  console.error("Failed to start Vite:", error);
  shutdown(1);
});
cli.on("close", handleClose);
vite.on("close", handleClose);

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
