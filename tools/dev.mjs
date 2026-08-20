#!/usr/bin/env node
/**
 * Dev launcher: starts the CLI dev server and Vite in parallel.
 * Usage: node tools/dev.mjs [path] [--no-open]
 *
 * Ports are configurable via environment variables:
 *   WEBDECK_VITE_PORT — Vite dev server port (default: auto-find free port from 8000)
 *   WEBDECK_CLI_PORT  — CLI API server port (default: auto-find free port from 8001)
 *
 * When auto-finding, the launcher probes sequential ports starting from the
 * default until it finds one that is free, then passes it to both processes.
 * This avoids EADDRINUSE crashes when multiple dev sessions run in parallel.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const rawArgs = process.argv.slice(2);
const noOpen = rawArgs.includes("--no-open");
const args = rawArgs.filter((arg) => arg !== "--no-open");

/**
 * Find a free TCP port, starting from `startPort` and incrementing up to
 * `startPort + maxTries - 1`. Returns the first free port, or `startPort`
 * if none are free (let the process fail with EADDRINUSE for a clear error).
 * @param {number} startPort
 * @param {number} [maxTries=20]
 * @returns {Promise<number>}
 */
function findFreePort(startPort, maxTries = 20) {
  return new Promise((resolve) => {
    let port = startPort;
    let tries = 0;

    const probe = () => {
      if (tries >= maxTries) {
        resolve(startPort);
        return;
      }
      const tester = createServer();
      tester.unref();
      tester.once("error", () => {
        tries++;
        port++;
        probe();
      });
      tester.once("listening", () => {
        tester.close(() => resolve(port));
      });
      tester.listen(port, "127.0.0.1");
    };

    probe();
  });
}

// Resolve ports: use env vars if set, otherwise auto-find from defaults.
const vitePort = process.env.WEBDECK_VITE_PORT
  ? parseInt(process.env.WEBDECK_VITE_PORT, 10)
  : await findFreePort(8000);
const cliPort = process.env.WEBDECK_CLI_PORT
  ? parseInt(process.env.WEBDECK_CLI_PORT, 10)
  : await findFreePort(vitePort === 8001 ? 8002 : 8001);

// Detect the current git branch for the startup banner. Falls back to the
// directory name if not in a git repo (e.g. extracted archives).
let branchLabel = path.basename(root);
try {
  branchLabel = execSync("git branch --show-current", { cwd: root, encoding: "utf-8" }).trim();
} catch {
  // Not a git repo or git unavailable — use directory name.
}

// CLI server
const cliArgs = ["tools/dev-server.mjs", ...args, "--port", String(cliPort)];
const cli = spawn(process.execPath, cliArgs, {
  cwd: root,
  stdio: "inherit",
});

// Vite — pass both ports via env so vite.config.mjs can read them.
const viteScript = path.join(root, "node_modules", "vite", "bin", "vite.js");
const vite = spawn(process.execPath, [viteScript], {
  cwd: root,
  env: {
    ...process.env,
    WEBDECK_VITE_PORT: String(vitePort),
    WEBDECK_CLI_PORT: String(cliPort),
    ...(noOpen ? { WEBDECK_NO_OPEN: "1" } : {}),
  },
  stdio: "inherit",
});

// Print a summary so the user knows where to point their browser, especially
// when auto-fallback picked a non-default port or multiple worktrees are
// running in parallel.
console.log(`\n  Dev server — branch: ${branchLabel}`);
console.log(`  Ports: Vite=${vitePort}  CLI=${cliPort}`);
console.log(`  URL:   http://127.0.0.1:${vitePort}/index.html\n`);

let shutdownStarted = false;
let closedChildren = 0;
let forceShutdownTimer = null;

function terminate(child, signal = "SIGTERM") {
  if (!child.killed) child.kill(signal);
}

function shutdown(code) {
  if (shutdownStarted) {
    if (typeof code === "number" && code !== 0 && process.exitCode === 0) {
      process.exitCode = code;
    }
    return;
  }
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
