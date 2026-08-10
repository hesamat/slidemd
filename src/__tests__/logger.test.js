import { afterEach, describe, expect, it, vi } from "vitest";
import { getLevel, Logger, resetLevel, setLevel } from "../core/logger.js";

afterEach(() => {
  resetLevel();
  delete globalThis.__WEBDECK_EXPORTED__;
  delete globalThis.__WEBDECK_BUNDLED_BUILD__;
  vi.restoreAllMocks();
});

describe("Logger", () => {
  it("emits all levels in development by default", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    Logger.debug("debug", 1);
    Logger.info("info", 2);
    Logger.warn("warn", 3);
    Logger.error("error", 4);

    expect(getLevel()).toBe("debug");
    expect(debug).toHaveBeenCalledWith("debug", 1);
    expect(info).toHaveBeenCalledWith("info", 2);
    expect(warn).toHaveBeenCalledWith("warn", 3);
    expect(error).toHaveBeenCalledWith("error", 4);
  });

  it("keeps warnings and errors in exported builds", () => {
    globalThis.__WEBDECK_EXPORTED__ = true;
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    Logger.debug("debug");
    Logger.info("info");
    Logger.warn("warn");
    Logger.error("error");

    expect(getLevel()).toBe("warn");
    expect(debug).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("warn");
    expect(error).toHaveBeenCalledWith("error");
  });

  it("supports an explicit level and restores the environment default", () => {
    setLevel("error");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    Logger.info("hidden");
    Logger.error("visible");
    expect(getLevel()).toBe("error");
    expect(info).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("visible");

    resetLevel();
    expect(getLevel()).toBe("debug");
  });

  it("rejects unknown levels", () => {
    expect(() => setLevel("verbose")).toThrow("Unknown log level: verbose");
    expect(() => setLevel("toString")).toThrow("Unknown log level: toString");
  });
});
