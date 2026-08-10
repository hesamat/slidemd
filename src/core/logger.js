/**
 * Level-based client-side logger.
 *
 * Debug and info output is enabled during development. Exported and bundled
 * builds keep warnings and errors visible while suppressing routine output.
 */

const LEVELS = Object.freeze({
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
});

// The logger is a page-wide singleton. Tests and temporary callers should use
// resetLevel() when they need to restore the environment-aware default.
let configuredLevel = null;

function isProductionBuild() {
  return globalThis.__WEBDECK_EXPORTED__ === true || globalThis.__WEBDECK_BUNDLED_BUILD__ === true;
}

function getMinimumLevel() {
  if (configuredLevel !== null) return LEVELS[configuredLevel];
  return isProductionBuild() ? LEVELS.warn : LEVELS.debug;
}

function write(level, method, args) {
  if (LEVELS[level] < getMinimumLevel()) return;
  console[method](...args);
}

/**
 * Set the minimum level emitted by the logger.
 *
 * This changes the page-wide logger singleton. Pass `null` to restore the
 * environment-aware default. The default is `debug` in development and
 * `warn` in exported or bundled builds.
 *
 * @param {"debug"|"info"|"warn"|"error"|null} level
 */
export function setLevel(level) {
  if (level !== null && !Object.hasOwn(LEVELS, level)) {
    throw new Error(`Unknown log level: ${level}`);
  }
  configuredLevel = level;
}

/**
 * Return the effective minimum log level.
 * @returns {"debug"|"info"|"warn"|"error"}
 */
export function getLevel() {
  const minimum = getMinimumLevel();
  return Object.keys(LEVELS).find((level) => LEVELS[level] === minimum);
}

/** Restore the environment-aware default log level. */
export function resetLevel() {
  configuredLevel = null;
}

/**
 * Client-side logging methods. Keep direct console usage confined to this
 * module so callers can use the same level policy everywhere.
 */
export const Logger = Object.freeze({
  debug(...args) {
    write("debug", "debug", args);
  },
  info(...args) {
    write("info", "info", args);
  },
  warn(...args) {
    write("warn", "warn", args);
  },
  error(...args) {
    write("error", "error", args);
  },
});
