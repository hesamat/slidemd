// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PresenterTimer } from "../engine/presenter-timer.js";

describe("PresenterTimer", () => {
  let elements;

  beforeEach(() => {
    elements = {
      presenterElapsed: document.createElement("span"),
      presenterClock: document.createElement("span"),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("displays 00:00 before start and counts after start", () => {
    const timer = new PresenterTimer(elements);
    timer.tick();
    expect(elements.presenterElapsed.textContent).toBe("00:00");
    const now = 1000000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    timer.start();
    vi.spyOn(Date, "now").mockReturnValue(now + 65000);
    timer.tick();
    expect(elements.presenterElapsed.textContent).toBe("01:05");
  });

  it("freezes elapsed on stop and resets to 00:00 on next start", () => {
    const timer = new PresenterTimer(elements);
    const t0 = 2000000;
    vi.spyOn(Date, "now").mockReturnValue(t0);
    timer.start();
    vi.spyOn(Date, "now").mockReturnValue(t0 + 20000);
    timer.tick();
    expect(elements.presenterElapsed.textContent).toBe("00:20");
    // Stop — display freezes at 00:20
    timer.stop();
    timer.tick();
    expect(elements.presenterElapsed.textContent).toBe("00:20");
    // Start again — resets to 00:00, new session
    vi.spyOn(Date, "now").mockReturnValue(t0 + 80000);
    timer.start();
    expect(elements.presenterElapsed.textContent).toBe("00:00");
    vi.spyOn(Date, "now").mockReturnValue(t0 + 90000);
    timer.tick();
    expect(elements.presenterElapsed.textContent).toBe("00:10");
  });

  it("updates wall-clock time display", () => {
    const timer = new PresenterTimer(elements);
    timer.tick();
    expect(elements.presenterClock.textContent.length).toBeGreaterThan(0);
  });

  it("stop is a no-op when not running", () => {
    const timer = new PresenterTimer(elements);
    expect(() => timer.stop()).not.toThrow();
    expect(timer.startTime).toBeNull();
  });

  it("destroy nulls elements and stops", () => {
    const timer = new PresenterTimer(elements);
    vi.spyOn(Date, "now").mockReturnValue(5000000);
    timer.start();
    timer.destroy();
    expect(timer.elements).toBeNull();
    expect(timer.startTime).toBeNull();
  });

  it("handles missing DOM elements gracefully", () => {
    const timer = new PresenterTimer({});
    expect(() => timer.tick()).not.toThrow();
    expect(() => timer.start()).not.toThrow();
    expect(() => timer.stop()).not.toThrow();
  });
});
