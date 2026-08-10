#!/usr/bin/env node
/**
 * Dev launcher: starts the CLI dev server and Vite in parallel.
 * Usage: node tools/dev.mjs [path] [--port 8000]
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rawArgs = process.argv.slice(2);
const noOpen = rawArgs.includes("--no-open");
const args = rawArgs.filter((arg) => arg !== "--no-open");

// CLI server on port 8001
const cliArgs = ["tools/dev-server.mjs", ...args, "--port", "8001"];
const cli = spawn(process.execPath, cliArgs, {
  cwd: path.join(__dirname, ".."),
  stdio: "inherit",
});

// Vite on port 8000 (proxies /api and /images to CLI server)
const viteArgs = ["vite"];
if (noOpen) viteArgs.push("--open=false");
const vite = spawn("npx", viteArgs, {
  cwd: path.join(__dirname, ".."),
  stdio: "inherit",
  shell: true,
});

cli.on("close", (code) => process.exit(code));
vite.on("close", (code) => process.exit(code));

process.on("SIGINT", () => {
  cli.kill();
  vite.kill();
  process.exit();
});
process.on("SIGTERM", () => {
  cli.kill();
  vite.kill();
  process.exit();
});
